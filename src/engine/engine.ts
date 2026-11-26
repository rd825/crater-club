// The stateful game engine: a faithful port of src/c_play.js (turn flow, shaping, firing,
// projectiles, impact, damage, tanks, save/restore) + src/d_ai_loop.js (AI + sim loop) +
// the setup pieces from src/b_world.js (baseGame, mkTank, newGame, rollWind, draft).
//
// Kept as one class to mirror the original single-shared-scope IIFE (minimizes translation
// bugs). The pure, separately-tested world layer (grid/sim/mapgen/rng/color) is imported.
// No DOM, canvas, or WebAudio: side effects go through the injected UI/Audio/Scheduler bridges.

import {
  H, REF, CELL, SIZES, ARSENAL, SEATS, HAZ, WATERC, LAVAC, AMIN, AMAX,
  AIR, DIRT, LOOSE, WATER, LAVA, TURF, BUILT, ROCK, SOLID,
  OOB, GROUND, LIQ, type PlayerType,
} from './constants.ts';
import { clamp, lerp, listNames } from './math.ts';
import { mix } from './color.ts';
import { createRng, timeSeed, type Rng } from './rng.ts';
import type { UIBridge, AudioBridge, Scheduler } from './bridge.ts';
import * as grid from './grid.ts';
import { simStep } from './sim.ts';
import { genHeight, flatten, raster, features, makeSources } from './mapgen.ts';
import { WEAPONS, WEAPON_IDS, KINDS, MYSTERY_POOL, TRACER, type WeaponSpec } from '../data/weapons.ts';
import { BIOMES } from '../data/biomes.ts';
import { TIMES } from '../data/times.ts';
import { WEATHER } from '../data/weather.ts';
import { LEVELS, type Level } from '../data/levels.ts';
import type {
  Game, Grid, Tank, Projectile, MatchConfig, Env, DraftView, GameOverResult, Preview, Part,
} from './types.ts';

/** A no-damage "support" weapon (smoke, bubble, bunker, hop, dirt): useful, but it can't finish a
 *  kill. The deal and the resupply cap how many of these one tank can be handed. */
const isSupportWeapon = (id: string): boolean => WEAPONS[id].spec.dmg === 0;

type Fog = { x: number; y: number; w: number; h: number; v: number };
type Cloud = { x: number; y: number; v: number; parts: { dx: number; dy: number; w: number; h: number }[] };
type Solve = { a: number; p: number; miss: number };

export class Engine {
  S!: Game;
  G!: Grid;
  W = REF;
  rng: Rng = createRng(1);
  armed = false;
  preview: Preview = null;
  paused = false;
  reduced = false;
  stable: Record<string, unknown> = {};
  gen = 0; // bumps when the terrain is (re)built, so the renderer rebuilds its cache

  private acc = 0;
  readonly FOG: Fog[];
  readonly CLOUDS: Cloud[];

  // Particle freelist: `parts` is the most numerous transient (capped at 480 live) and is
  // allocated and culled every frame, so reused Part objects cut per-frame GC in heavy scenes
  // (backlog: "object-pool particles / bits / booms"). `bits` already compacts in place
  // (stepBits) and booms/puffs/bolts/floats are now compacted in place too (see update()).
  private partPool: Part[] = [];
  private allocPart(x: number, y: number, vx: number, vy: number, life: number, c: string, s: number, spark: boolean): Part {
    const q = this.partPool.pop();
    if (q) { q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.t = 0; q.life = life; q.c = c; q.s = s; q.spark = spark; return q; }
    return { x, y, vx, vy, t: 0, life, c, s, spark };
  }
  private freePart(q: Part): void { if (this.partPool.length < 600) this.partPool.push(q); }

  constructor(
    readonly ui: UIBridge,
    readonly audio: AudioBridge,
    readonly scheduler: Scheduler,
  ) {
    const r = createRng(1234);
    this.FOG = Array.from({ length: 9 }, () => ({ x: r.rand(0, SIZES.large), y: r.rand(250, 520), w: r.rand(440, 720), h: r.rand(120, 200), v: r.rand(6, 16) * (r.random() < 0.5 ? -1 : 1) }));
    this.CLOUDS = Array.from({ length: 8 }, () => ({ x: r.rand(0, SIZES.large), y: r.rand(40, 200), v: r.rand(3, 9), parts: Array.from({ length: 4 }, (_q, i) => ({ dx: (i - 1.5) * r.rand(48, 72), dy: r.rand(-14, 12), w: r.rand(150, 250), h: r.rand(50, 88) })) }));
  }

  // ---- rng shortcuts ----
  private rand(a: number, b: number) { return this.rng.rand(a, b); }
  private pickOne<T>(a: readonly T[]) { return this.rng.pick(a); }
  private shuffle<T>(a: T[]) { return this.rng.shuffle(a); }
  private gauss() { return this.rng.gauss(); }
  private rnd() { return this.rng.random(); }

  // ---- grid wrappers (so ported bodies read like the original) ----
  private cellAt(x: number, y: number) { return grid.cellAt(this.G, x, y); }
  private solidAt(x: number, y: number) { return grid.solidAt(this.G, x, y); }
  private liquidAt(x: number, y: number) { return grid.liquidAt(this.G, x, y); }
  private floorBelow(x: number, y: number) { return grid.floorBelow(this.G, x, y); }
  private solidTop(x: number) { return grid.solidTop(this.G, x); }
  private solidBelow(x: number, y: number) { return grid.solidBelow(this.G, x, y); }
  private surfaceY(x: number) { return grid.surfaceY(this.G, x); }
  private carve(cx: number, cy: number, r: number, ej: number, crumble?: boolean) { return grid.carve(this.G, this.rng, this.S.bits, cx, cy, r, ej, crumble); }
  private blob(cx: number, cy: number, rx: number, ry: number, t: number, only: (c: number) => boolean) { grid.blob(this.G, cx, cy, rx, ry, t, only); }
  private fillCells(x0: number, y0: number, x1: number, y1: number, t: number, only: (c: number) => boolean) { grid.fillCells(this.G, x0, y0, x1, y1, t, only); }
  private deposit(x: number, y: number, t: number) { grid.deposit(this.G, x, y, t); }

  // ---- helpers (src/a_core.js:151-156) ----
  cur(): Tank { return this.S.tanks[this.S.turn]; }
  colorOf(o: number): string { return o < 0 ? HAZ : this.S.tanks[o].color; }
  sameTeam(a: number, b: number): boolean { return this.S.teamOf[a] === this.S.teamOf[b]; }
  canHuman(): boolean { const S = this.S; return !!S && !S.demo && !this.paused && S.phase === 'aim' && !this.cur().isAI && !this.cur().dead && !(this.cur().moveLeft > 0); }
  nearestRival(o: number, x: number): Tank | null {
    let best: Tank | null = null, bd = 1e9;
    for (const k of this.S.live) if (o < 0 || !this.sameTeam(k.id, o)) { const d = Math.abs(k.x - x); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  private floatText(k: Tank, text: string, c: string) { this.S.floats.push({ x: k.x + this.rand(-10, 10), y: k.y - 30 - this.rand(0, 14), t: 0, text, c }); }
  private facing(t: Tank): number { return t.angle <= 90 ? 1 : -1; }
  private holds(t: Tank, id: string): number { return t.weapons.reduce((n, w) => n + (w === id ? 1 : 0), 0); }
  private teamTotal(k: number): number { return this.S.tanks.reduce((n, t) => n + (this.S.teamOf[t.id] === k ? this.S.scores[t.id] : 0), 0); }
  private teamNames(k: number): string { return listNames(this.S.tanks.filter((t) => this.S.teamOf[t.id] === k).map((t) => t.name)); }

  // ---- setup (src/b_world.js:324-401) ----
  private mkTank(id: number, x: number, type: PlayerType, hp: number): Tank {
    const ai = type !== 'human';
    return {
      id, name: SEATS[id].name, color: SEATS[id].c, x, y: 0, vy: 0, falling: false, afloat: false,
      angle: x < this.W / 2 ? 60 : 120, power: 60, weapons: [], sel: 0, fuel: 2, moveLeft: 0, moveDir: 0,
      isAI: ai, level: ai && type !== 'target' ? type : null, hitLast: 0, rangeN: 0, lastFoe: -1,
      hp, dead: false, shield: 0, hiccup: false, pending: null, recoil: 0, shaped: false, fallT: 0,
      hi: mix(SEATS[id].c, '#ffffff', 0.42), lo: mix(SEATS[id].c, '#120d1c', 0.4),
    };
  }

  private baseGame(cfg: MatchConfig, demo: boolean, env: Env): Game {
    const sandbox = !demo && !!cfg.sandbox;
    const b = BIOMES[env.biome], n = cfg.players.length;
    const health = cfg.mode === 'health' && !sandbox;
    const teams = !demo && !sandbox && cfg.teams === 'teams' && n >= 4 && n % 2 === 0;
    const W = this.W;
    const g: Game = {
      demo, sandbox, taken: [], shotDmg: 0, cfg, env, pal: b, sky: TIMES[env.time], g: b.space ? 150 : 300, vel: b.space ? 7 * Math.SQRT1_2 : 7,
      health, per: health ? ARSENAL : cfg.volleys, teams, teamOf: cfg.players.map((_p, i) => (teams ? (i < n / 2 ? 0 : 1) : i)),
      tanks: [], live: [], scores: [], shots: [], turn: 0, round: 1, phase: 'aim', wind: 0, lastId: null,
      projs: [], events: [], parts: [], floats: [], booms: [], bolts: [], props: [], drops: [], holes: [], bombs: [], smokes: [], puffs: [], bits: [], sources: [],
      flash: 0, shake: 0, time: 0, tickN: 0, settleT: 0, flowT: 0, hazardDone: true, burnDone: true, slowT: 0, z: 1, zx: W / 2, zy: H / 2, dramaAt: 0,
      traces: [], marks: [], tracerRound: !demo && !sandbox, curTrace: [], pool: [], pickTurn: 0, aiPlan: null, banner: null,
      maxHold: 1, precip: null,
    };
    g.maxHold = Math.ceil(g.per / KINDS);
    const w = env.weather;
    g.precip = w === 'rain' || w === 'storm' ? 'rain' : w === 'snow' ? 'snow' : b.embers ? 'embers' : null;
    const count = (g.precip === 'rain' ? (w === 'storm' ? 190 : 130) : g.precip === 'snow' ? 110 : g.precip === 'embers' ? 36 : 0) * W / REF;
    for (let i = 0; i < count; i++) g.drops.push({ x: this.rand(0, W), y: this.rand(0, H), s: this.rnd() });
    return g;
  }

  newGame(cfgIn: MatchConfig, demo = false): void {
    const cfg: MatchConfig = JSON.parse(JSON.stringify(cfgIn));
    this.rng = createRng(cfg.seed != null ? cfg.seed >>> 0 : timeSeed());
    const n = cfg.players.length, size = cfg.size === 'auto' ? (n <= 4 ? 'medium' : 'large') : cfg.size;
    const biome = cfg.biome === 'random' ? this.pickOne(Object.keys(BIOMES)) : cfg.biome, space = !!BIOMES[biome].space;
    let time = cfg.time === 'random' ? this.pickOne(['dawn', 'noon', 'dusk', 'night']) : cfg.time;
    let weather = cfg.weather === 'random' ? this.pickOne(space ? ['clear', 'meteors'] : Object.keys(WEATHER)) : cfg.weather;
    if (space) { time = 'space'; if (weather !== 'meteors') weather = 'clear'; }
    this.W = (SIZES as Record<string, number>)[size] || REF;
    const W = this.W;
    this.S = this.baseGame(cfg, !!demo, { biome, time, weather, size, W });
    this.paused = false; this.armed = false; this.preview = null; this.stable = {};
    const S = this.S;
    const { h, coneX } = genHeight(this.rng, biome, W);
    for (let x = 0; x < W; x++) h[x] = clamp(h[x] - 36, 150, 512);
    cfg.players.forEach((p, i) => {
      const x = clamp(100 + (i * (W - 200)) / (n - 1) + this.rand(-18, 18), 60, W - 60);
      flatten(h, x, S.pal.sea || 0, W);
      S.tanks.push(this.mkTank(i, x, p.type, cfg.health));
      S.scores.push(0); S.shots.push(cfg.volleys); S.traces.push(null); S.marks.push(null);
    });
    S.live = S.tanks.slice();
    this.G = grid.makeGrid(W, H); raster(this.G, h); features(this.G, this.rng, biome, h, S.tanks, S.pal.sea || 0, coneX);
    S.sources = makeSources(this.G, biome, h, S.tanks, coneX);
    this.G.act = [0, 0, this.G.cols - 1, this.G.rows - 1]; this.G.dirty = null;
    for (const t of S.tanks) t.y = Math.round(h[Math.round(t.x)] / CELL) * CELL;
    const np = Math.round((13 * W) / REF);
    for (let i = 0; i < np * 2 && S.props.length < np; i++) {
      const x = Math.round(this.rand(16, W - 16)), y0 = Math.round(h[x] / CELL) * CELL;
      if (S.tanks.some((t) => Math.abs(t.x - x) < 46) || this.cellAt(x, y0 - 3) !== AIR || S.props.some((p) => Math.abs(p.x - x) < 22)) continue;
      S.props.push({ x, y0, s: this.rand(0.8, 1.3), f: this.rnd() < 0.5 ? -1 : 1 });
    }
    this.gen++; // renderer rebuilds its terrain cache
    const need = n * S.per;
    let bag: string[] = [];
    while (bag.length < need) bag = bag.concat(this.shuffle(WEAPON_IDS.slice()));
    S.pool = this.shuffle(bag.slice(0, need)).map((id) => ({ id, by: -1 }));
    this.rollWind(true);
    if (!demo) this.ui.closeOverlays();
    this.ui.onBuildCards();
    if (S.sandbox) {
      for (const t of S.tanks) if (!t.isAI) t.weapons = WEAPON_IDS.slice();
      S.turn = Math.max(0, S.tanks.findIndex((t) => !t.isAI));
      this.startAim();
      return;
    }
    if (cfg.deal === 'draft' && !demo) {
      S.phase = 'draft'; this.renderDraft(); this.ui.onSync(); this.maybeAIPick();
    } else {
      const give = (c: { id: string; by: number }, t: Tank) => { c.by = t.id; t.weapons.push(c.id); };
      // Keep every hand playable: cap the no-damage "support" weapons (smoke, bubble, bunker,
      // hop, dirt) per tank so a random deal can't saddle one player with a pile of them and too
      // few ways to actually deal damage. Deal damage weapons first, support last, so the cap
      // only ever trims the unlucky extras.
      const supCap = Math.max(1, Math.floor(S.per / 4));
      const supCount = (t: Tank) => { let s = 0; for (const id of t.weapons) if (isSupportWeapon(id)) s++; return s; };
      const order = S.pool.map((_c, i) => i).sort((a, b) => (isSupportWeapon(S.pool[a].id) ? 1 : 0) - (isSupportWeapon(S.pool[b].id) ? 1 : 0));
      for (const idx of order) {
        const c = S.pool[idx], sup = isSupportWeapon(c.id);
        let best: Tank | null = null;
        for (const t of S.tanks) {
          if (t.weapons.length >= S.per || this.holds(t, c.id) >= S.maxHold) continue;
          if (sup && supCount(t) >= supCap) continue;
          if (!best || t.weapons.length < best.weapons.length) best = t;
        }
        if (best) give(c, best);
      }
      // Fill any hand still short (rare: not enough damage cards in the bag to honour every cap).
      for (const c of S.pool) if (c.by < 0) { const t = S.tanks.find((k) => k.weapons.length < S.per); if (t) give(c, t); }
      this.startAim();
    }
  }

  private rollWind(newRound: boolean): void {
    const m = this.S.pal.space ? 'calm' : this.S.env.weather === 'storm' ? 'gusty' : this.S.cfg.wind;
    if (m === 'calm') this.S.wind = 0;
    else if (m === 'breeze') { if (newRound) this.S.wind = Math.round(this.rand(-20, 20)); }
    else this.S.wind = Math.round(this.rand(-45, 45));
  }

  // ---- draft (src/base.html:553-596) ----
  private legalPick(t: Tank, i: number): boolean { return this.S.pool[i].by === -1 && this.holds(t, this.S.pool[i].id) < this.S.maxHold; }
  private anyLegal(t: Tank): boolean { return this.S.pool.some((_c, i) => this.legalPick(t, i)); }
  private renderDraft(): void {
    const S = this.S, who = S.tanks[S.pickTurn], free = !this.anyLegal(who);
    const view: DraftView = {
      whoName: who.name, whoColor: who.color, whoIsAI: who.isAI, per: S.per, whoCount: who.weapons.length,
      pool: S.pool.map((c) => ({ id: c.id, by: c.by })),
      legal: S.pool.map((c, i) => c.by === -1 && (free || this.legalPick(who, i))),
      colors: S.tanks.map((t) => t.color), names: S.tanks.map((t) => t.name),
    };
    this.ui.onDraft(view);
  }
  pick(i: number): void {
    const S = this.S;
    if (!S || S.phase !== 'draft') return;
    const c = S.pool[i], who = S.tanks[S.pickTurn];
    if (c.by !== -1 || (!this.legalPick(who, i) && this.anyLegal(who))) return;
    c.by = S.pickTurn; who.weapons.push(c.id);
    S.pickTurn = (S.pickTurn + 1) % S.tanks.length;
    if (S.tanks.every((t) => t.weapons.length >= S.per)) { this.ui.onDraft(null); this.startAim(); return; }
    this.renderDraft(); this.maybeAIPick();
  }
  private maybeAIPick(): void {
    const S = this.S, who = S.tanks[S.pickTurn];
    if (!who.isAI) return;
    const L = LEVELS[who.level!];
    this.later(S, 380, () => {
      const free = !this.anyLegal(who), open = S.pool.map((c, i) => (c.by === -1 && (free || this.legalPick(who, i)) ? i : -1)).filter((i) => i >= 0);
      let bi = open[0], bv = -1e9;
      for (const i of open) {
        const v = L.smart === 0 ? this.rnd() : WEAPONS[S.pool[i].id].rating! + this.rand(0, 3.2 - 2.9 * L.smart);
        if (v > bv) { bv = v; bi = i; }
      }
      this.pick(bi);
    }, 'draft');
  }

  // ---- turn flow (src/c_play.js:1-108) ----
  private later(g: Game, ms: number, fn: () => void, phase?: string): void {
    this.scheduler.set(() => { if (this.S === g && g.phase === (phase || 'aim')) fn(); }, ms);
  }

  /** A fresh hand of `n` weapons with at most ~a quarter being no-damage support weapons, so a
   *  resupply can't leave a tank unable to finish anyone off. Draws the same single shuffle the
   *  old `shuffle(...).slice(0, n)` did, so the RNG sequence is unchanged. */
  private dealArsenal(n: number): string[] {
    const cap = Math.max(1, Math.floor(n / 4)), bag = this.shuffle(WEAPON_IDS.slice());
    const out: string[] = []; let sup = 0;
    for (const id of bag) { if (out.length >= n) break; if (isSupportWeapon(id)) { if (sup >= cap) continue; sup++; } out.push(id); }
    for (const id of bag) { if (out.length >= n) break; if (!out.includes(id)) out.push(id); }
    return out;
  }

  startAim(): void {
    const S = this.S;
    this.regenSources();
    S.phase = 'aim'; S.settleT = 0; S.aiPlan = null; this.armed = false; this.preview = null;
    const t = this.cur(); t.shaped = false; t.fuel = 2;
    if (S.health && !t.weapons.length) { t.weapons = this.dealArsenal(ARSENAL); t.sel = 0; this.floatText(t, 'resupplied', t.color); }
    t.sel = clamp(t.sel, 0, Math.max(0, t.weapons.length - 1));
    S.banner = S.sandbox ? (S.shotDmg > 0 ? { text: S.shotDmg + ' damage', t: 0, c: t.color } : null) : { text: t.isAI ? t.name + ' takes aim' : t.name + "'s turn", t: 0, c: t.color };
    this.ui.onSync(); this.saveStable();
    if (t.isAI) this.planAI();
  }

  endTurn(): void {
    const S = this.S;
    S.traces[S.turn] = S.curTrace; S.curTrace = []; this.cur().hitLast = 0;
    const n = S.tanks.length, prev = S.turn;
    if (S.sandbox) {
      for (const m of S.smokes) m.turns--;
      S.smokes = S.smokes.filter((m) => m.turns > 0);
      for (let i = 1; i <= n; i++) { const k = (prev + i) % n; if (!S.tanks[k].isAI) { S.turn = k; break; } }
      S.round++; this.rollWind(true); this.startAim(); return;
    }
    if (S.tracerRound) {
      if (prev + 1 < n) S.turn = prev + 1;
      else { S.tracerRound = false; S.turn = 0; }
      this.startAim(); return;
    }
    for (const m of S.smokes) m.turns--;
    S.smokes = S.smokes.filter((m) => m.turns > 0);
    if (S.health ? new Set(S.live.map((t) => S.teamOf[t.id])).size <= 1 : S.shots.every((v) => v === 0)) return this.gameOver();
    let next = -1;
    for (let i = 1; i <= n; i++) { const k = (prev + i) % n; if (!S.tanks[k].dead && (S.health || S.shots[k] > 0)) { next = k; break; } }
    if (next < 0) return this.gameOver();
    S.turn = next; if (next <= prev) S.round++;
    this.rollWind(next <= prev); this.startAim();
  }

  private hazard(): boolean {
    const S = this.S;
    S.hazardDone = true;
    const w = S.env.weather, W = this.W;
    if (w === 'storm' && this.rnd() < 0.4) {
      const x = this.rand(40, W - 40), y = this.surfaceY(x);
      this.bolt(x + this.rand(-90, 90), -10, x, y, '#ffffff'); S.flash = 1;
      this.explode(x, y, 38, 18, -1); this.audio.thunder(); return true;
    }
    if (w === 'meteors' && this.rnd() < 0.55) {
      const n = 1 + ((this.rnd() * 3) | 0);
      for (let i = 0; i < n; i++) this.after(i * 0.25, () => this.spawn({ x: this.rand(80, W - 80), y: -30, vx: this.rand(-130, 130), vy: this.rand(160, 240), owner: -1, age: 1, r: 36, dmg: 18 }));
      return true;
    }
    return false;
  }

  private gameOver(): void {
    const S = this.S;
    S.phase = 'over'; this.stable = {}; this.armed = false; this.ui.onSync();
    const g = S;
    if (g.demo) { this.scheduler.set(() => { if (this.S === g) this.newGame(this.demoCfg(), true); }, 2600); return; }
    let order: Tank[], title: string, color = '';
    if (g.health) {
      order = g.tanks.slice().sort((a, b) => a.dead === b.dead ? (b.hp - a.hp) || (g.scores[b.id] - g.scores[a.id]) : (a.dead ? 1 : 0) - (b.dead ? 1 : 0));
      if (!g.live.length) title = 'Nobody is left standing';
      else if (g.teams) { const k = g.teamOf[g.live[0].id]; title = this.teamNames(k) + ' win'; color = g.live[0].color; }
      else { title = g.live[0].name + ' wins'; color = g.live[0].color; }
    } else {
      order = g.tanks.slice().sort((a, b) => g.scores[b.id] - g.scores[a.id]);
      if (g.teams) {
        const a = this.teamTotal(0), b = this.teamTotal(1);
        if (a === b) title = 'Dead heat';
        else { const k = a > b ? 0 : 1; title = this.teamNames(k) + ' win ' + Math.max(a, b) + ' to ' + Math.min(a, b); color = g.tanks.find((t) => g.teamOf[t.id] === k)!.color; }
      } else if (g.scores[order[0].id] === g.scores[order[1].id]) title = 'Dead heat';
      else { title = order[0].name + ' wins'; color = order[0].color; }
    }
    const result: GameOverResult = {
      title, color,
      rows: order.map((t) => ({
        name: t.name, color: t.color, isAI: t.isAI,
        sub: (t.isAI ? 'computer' : 'player') + (g.health ? ' · ' + g.scores[t.id] + ' damage dealt' : ''),
        score: g.health ? (t.dead ? 'out' : Math.ceil(t.hp)) : g.scores[t.id],
      })),
    };
    this.scheduler.set(() => { if (this.S === g) this.ui.onGameOver(result); }, 900);
  }

  saveStable(): void {
    const S = this.S;
    if (S.demo) { this.stable = {}; return; }
    this.stable = {
      v: 5, seed: S.cfg.seed, cfg: S.cfg, env: S.env, tracer: S.tracerRound, marks: S.marks, grid: grid.encodeGrid(this.G),
      scores: S.scores.slice(), turn: S.turn, round: S.round, shots: S.shots.slice(), wind: S.wind, props: S.props, bombs: S.bombs, smokes: S.smokes, lastId: S.lastId,
      tanks: S.tanks.map((t) => ({ x: t.x, y: t.y, angle: t.angle, power: t.power, weapons: t.weapons.slice(), sel: t.sel, fuel: t.fuel, hp: t.hp, dead: t.dead, shield: t.shield, hiccup: t.hiccup })),
    };
  }

  restore(d: Record<string, unknown>): void {
    const env = d.env as Env;
    this.W = env.W || REF;
    this.S = this.baseGame(d.cfg as MatchConfig, false, env); this.paused = false; this.armed = false;
    const S = this.S;
    S.tracerRound = !!d.tracer;
    this.G = grid.makeGrid(this.W, H); grid.decodeGrid(this.G, d.grid as number[]); this.G.act = [0, 0, this.G.cols - 1, this.G.rows - 1];
    S.scores = d.scores as number[]; S.turn = d.turn as number; S.round = (d.round as number) || 1; S.shots = d.shots as number[]; S.wind = d.wind as number;
    S.props = (d.props as Game['props']) || []; S.bombs = (d.bombs as Game['bombs']) || []; S.smokes = (d.smokes as Game['smokes']) || []; S.lastId = (d.lastId as string) || null;
    const cfg = d.cfg as MatchConfig, savedTanks = d.tanks as Partial<Tank>[];
    S.tanks = savedTanks.map((t, i) => Object.assign(this.mkTank(i, t.x!, cfg.players[i].type, cfg.health), t));
    S.live = S.tanks.filter((t) => !t.dead);
    S.traces = S.tanks.map(() => null);
    const marks = d.marks as Game['marks'] | undefined;
    S.marks = S.tanks.map((_t, i) => (marks && Array.isArray(marks[i]) ? marks[i] : null));
    this.gen++;
    this.ui.closeOverlays(); this.ui.onBuildCards(); this.startAim();
  }

  playCfg(settings: { players: { type: PlayerType }[]; wind: string; size: string; biome: string; time: string; weather: string }): MatchConfig {
    // The playground is always a solo range: exactly one human, the rest stationary targets to
    // practise on — regardless of how many players the menu is set up for.
    const targets = clamp(Math.max(2, settings.players.length - 1), 0, 7);
    const players = [{ type: 'human' as PlayerType }].concat(Array.from({ length: targets }, () => ({ type: 'target' as PlayerType })));
    return { sandbox: true, players, mode: 'volleys', volleys: 99, health: 150, teams: 'ffa', deal: 'random', wind: settings.wind, size: settings.size, biome: settings.biome, time: settings.time, weather: settings.weather };
  }
  demoCfg(): MatchConfig {
    return { players: [{ type: 'veteran' }, { type: 'regular' }, { type: 'ace' }, { type: 'regular' }], mode: 'volleys', volleys: 5, health: 150, teams: 'ffa', deal: 'random', wind: 'breeze', size: 'medium', biome: 'random', time: 'random', weather: 'random' };
  }

  // ---- shaping (src/c_play.js:110-132) ----
  shapeBox(t: Tank, tool: string): [number, number, number, number] {
    const d = this.facing(t);
    // Wall: set well forward of the barrel so it shields without blocking your own shot.
    if (tool === 'wall') { const x0 = t.x + d * 46, f = Math.min(t.y + 60, this.solidBelow(x0 + d * 7, t.y - 30)); return [Math.min(x0, x0 + d * 14), f - 54, Math.max(x0, x0 + d * 14), f + 1]; }
    if (tool === 'bridge') return [Math.min(t.x + d * 14, t.x + d * 176), t.y, Math.max(t.x + d * 14, t.x + d * 176), t.y + 5];
    // Burrow: the mound it raises (used for the preview); the dig/doShape build it directly.
    if (tool === 'burrow') return [t.x - 26, t.y - 64, t.x + 26, t.y + 2];
    return [t.x - 17, t.y, t.x + 17, t.y + 46];
  }
  doShape(t: Tank, tool: string): boolean {
    const S = this.S;
    if ((t.shaped && !S.sandbox) || S.phase !== 'aim' || S.tracerRound || t.moveLeft > 0) return false;
    if (tool === 'dig') {
      // A longer, conically-widening tunnel along the barrel line.
      const a = (t.angle * Math.PI) / 180;
      for (let s = 0; s <= 150; s += 5) this.carve(t.x + Math.cos(a) * s, t.y - 9 - Math.sin(a) * s, 11 + s * 0.12, 0.1);
    } else if (tool === 'burrow') {
      // Raise a pillar of earth under the tank: take the high ground.
      const ny = Math.max(70, t.y - 64), g = this.G.g, cols = this.G.cols, rows = this.G.rows, r0 = Math.round(ny / CELL);
      for (let c = Math.max(0, ((t.x - 26) / CELL) | 0); c <= Math.min(cols - 1, ((t.x + 26) / CELL) | 0); c++)
        for (let r = r0; r < rows - 5 && !SOLID[g[r * cols + c]]; r++) g[r * cols + c] = r < r0 + 3 ? TURF : DIRT;
      grid.touch(this.G, ((t.x - 28) / CELL) | 0, r0 - 1, ((t.x + 28) / CELL) | 0, rows - 1);
      t.y = r0 * CELL; this.debris(t.x, t.y + 28, 40, S.pal.dust);
    } else {
      const b = this.shapeBox(t, tool);
      this.fillCells(b[0], b[1], b[2], b[3], BUILT, grid.notSolid);
    }
    t.shaped = !S.sandbox; this.preview = null;
    for (const k of S.tanks) k.rangeN = 0;
    if (S.puffs.length < 60) this.smokePuff(t.x, t.y - 8, 12, false);
    this.audio.thud(); this.ui.onSync(); return true;
  }

  /** Springs and vents well their liquid back up each turn so blasted-out ponds and lava lakes refill. */
  private regenSources(): void {
    const S = this.S;
    if (!S.sources.length) return;
    const g = this.G.g, cols = this.G.cols, rows = this.G.rows;
    for (const s of S.sources) {
      let n = 0;
      for (let r = Math.max(0, s.box[1]); r <= Math.min(rows - 1, s.box[3]); r++)
        for (let c = Math.max(0, s.box[0]); c <= Math.min(cols - 1, s.box[2]); c++) if (g[r * cols + c] === s.t) n++;
      if (n >= s.target) continue; // feature already full — rest quietly
      const pulse = Math.min(s.vent ? 24 : 42, (s.target - n)); // cells welled up this turn; the solver carries them down
      for (let k = 0; k < pulse; k++) this.deposit(s.x + ((k % 7) - 3) * CELL, s.y, s.t);
      if (s.vent) { this.smokePuff(s.x, s.y - 10, 14, true); if (S.puffs.length < 60) this.debris(s.x, s.y, 10, LAVAC); }
    }
  }

  /** Loose sediment sliding onto a tank slumps over it and buries it until it digs out. */
  private burySlides(): void {
    const S = this.S;
    for (const t of S.live) {
      if (t.dead || t.falling || t.afloat || this.isBuried(t)) continue;
      // fresh loose dirt only appears from blasts/carving, so finding it on the deck means a slide landed
      const onDeck = this.cellAt(t.x, t.y - 7) === LOOSE || this.cellAt(t.x, t.y - 11) === LOOSE;
      const shoulders = this.cellAt(t.x - 12, t.y - 6) === LOOSE && this.cellAt(t.x + 12, t.y - 6) === LOOSE;
      if (!onDeck && !shoulders) continue;
      this.fillCells(t.x - 10, t.y - 15, t.x + 10, t.y - 1, DIRT, (c) => c === AIR || c === LOOSE);
      grid.touch(this.G, ((t.x - 12) / CELL) | 0, ((t.y - 17) / CELL) | 0, ((t.x + 12) / CELL) | 0, (t.y / CELL) | 0);
      this.smokePuff(t.x, t.y - 8, 12, false); this.floatText(t, 'buried!', '#d8c08a'); this.audio.thud();
      t.moveLeft = 0; t.moveDir = 0;
    }
  }

  // ---- firing & projectiles (src/c_play.js:134-202) ----
  private launch(t: Tank, ang: number, pw: number, spec: WeaponSpec): Projectile {
    const a = (ang * Math.PI) / 180, sp = spec.straight ? 900 : pw * this.S.vel;
    return Object.assign({ x: t.x + Math.cos(a) * 18, y: t.y - 12 - Math.sin(a) * 18, vx: Math.cos(a) * sp, vy: -Math.sin(a) * sp, owner: t.id, age: 0, trail: [] as number[] }, spec) as Projectile;
  }
  private spawn(p: Projectile, primary?: boolean): Projectile { p.primary = !!primary; if (!p.trail) p.trail = []; this.S.projs.push(p); return p; }
  private after(delay: number, fn: () => void): void { this.S.events.push({ t: this.S.time + delay, fn }); }

  fire(): void {
    const S = this.S;
    if (!S || S.phase !== 'aim') return;
    const t = this.cur();
    if (t.moveLeft > 0 || !t.weapons.length) return;
    this.armed = false; this.preview = null; S.burnDone = false; S.flowT = 0;
    if (S.tracerRound) {
      S.phase = 'flight'; S.settleT = 0; S.curTrace = []; S.aiPlan = null; S.hazardDone = true; S.burnDone = true;
      S.marks[t.id] = []; t.recoil = 1;
      const up = this.facing(t);
      for (const d of TRACER.fan!) this.spawn(this.launch(t, clamp(t.angle + d * up, AMIN, AMAX), t.power, Object.assign({ lab: d }, TRACER.spec)), d === 0);
      this.audio.pop(); S.banner = { text: 'Tracer', t: 0.5, c: t.color }; this.ui.onSync(); return;
    }
    S.marks[t.id] = null;
    for (const b of S.bombs) b.fuse--;
    let id = S.sandbox ? t.weapons[t.sel] : t.weapons.splice(t.sel, 1)[0], via = '';
    S.shotDmg = 0;
    if (id === 'mystery') { via = 'Mystery Box: '; id = t.pending || this.pickOne(MYSTERY_POOL); }
    if (id === 'encore') { via = 'Encore: '; id = S.lastId || 'shell'; }
    t.pending = null; S.lastId = id;
    const w = WEAPONS[id], sp = w.spec;
    t.sel = clamp(t.sel, 0, Math.max(0, t.weapons.length - 1));
    if (!S.health && !S.sandbox) S.shots[t.id]--;
    S.phase = 'flight'; S.settleT = 0; S.curTrace = []; S.aiPlan = null; S.hazardDone = false;
    let off = 0;
    if (t.hiccup) { t.hiccup = false; off = this.rand(6, 13) * (this.rnd() < 0.5 ? -1 : 1); this.floatText(t, 'hic!', '#a6e86a'); }
    if (sp.self === 'bags') {
      for (const d of [-1, 1]) { const x0 = t.x + d * 34, f = Math.min(t.y + 60, this.solidBelow(x0 + d * 6, t.y - 30)); this.fillCells(Math.min(x0, x0 + d * 12), f - 52, Math.max(x0, x0 + d * 12), f + 1, BUILT, grid.notSolid); this.smokePuff(x0, f - 20, 14, false); }
      this.audio.thud();
    } else if (sp.self === 'bubble') {
      t.shield = 1; S.booms.push({ x: t.x, y: t.y - 8, r: 26, t: 0, c: '#bfe8ff', soft: true }); this.audio.pop();
    } else {
      const shoot = (first: boolean) => {
        if (t.dead) return;
        const j = off + (first ? 0 : this.rand(-1, 1) * (w.jitter || 0));
        const ma = ((t.angle + j) * Math.PI) / 180, mx = t.x + Math.cos(ma) * 24, my = t.y - 12.5 - Math.sin(ma) * 24;
        S.booms.push({ x: mx, y: my, r: 12, t: 0.3, c: '#fff1c4', soft: true }); this.smokePuff(mx, my, 9, false); t.recoil = 1;
        if (w.fan) w.fan.forEach((o) => this.spawn(this.launch(t, t.angle + j + o, t.power, sp), first && o === w.fan![w.fan!.length >> 1]));
        else if (w.pellets) for (let i = 0; i < w.pellets; i++) this.spawn(this.launch(t, t.angle + j + (i ? this.rand(-5, 5) : 0), t.power * (i ? this.rand(0.94, 1.06) : 1), sp), i === 0);
        else this.spawn(this.launch(t, t.angle + j, t.power, sp), first);
        this.audio.fire();
      };
      shoot(true);
      for (let i = 1; i < (w.repeat || 1); i++) this.after(i * w.gap!, () => shoot(false));
    }
    S.banner = { text: via + w.name, t: 0.5, c: t.color };
    this.ui.onSync();
  }

  private fly(p: Projectile, spec: WeaponSpec, wind: number, g: number): void {
    const DT = 1 / 120, pvy = p.vy;
    if (!spec.straight) { p.vy += g * DT; p.vx += wind * DT; }
    if (pvy < 0 && p.vy >= 0) { if (spec.boom) p.vx = -p.vx; if (spec.plumb) p.vx = 0; }
    if (spec.chute && p.vy > 0) { if (p.vy > 75) p.vy = 75; p.vx += wind * 2 * DT; p.vx *= 1 - 0.8 * DT; }
    p.x += p.vx * DT; p.y += p.vy * DT;
    if (spec.walls) { if (p.x < 0 && p.vx < 0) { p.x = -p.x; p.vx *= -0.9; } else if (p.x > this.W && p.vx > 0) { p.x = 2 * this.W - p.x; p.vx *= -0.9; } }
  }

  private hitAt(x: number, y: number, age: number, owner: number, safeAll?: boolean): typeof OOB | typeof GROUND | typeof LIQ | Tank | null {
    if (x < -150 || x > this.W + 150 || y > H + 50 || y < -1500) return OOB;
    for (const k of this.S.live) {
      if (safeAll ? age < 0.35 : k.id === owner && age < 0.25) continue;
      const dx = x - k.x, dy = y - (k.y - 7);
      if (dx * dx + dy * dy < 144) return k;
    }
    if (x >= 0 && x < this.W && y >= 0) {
      const t = y >= H ? ROCK : this.G.g[((y / CELL) | 0) * this.G.cols + ((x / CELL) | 0)];
      if (SOLID[t]) return GROUND;
      if (t !== AIR) return LIQ;
    }
    return null;
  }

  private normalAt(x: number, y: number): [number, number] {
    let nx = 0, ny = 0;
    for (let a = 0; a < 8; a++) { const dx = Math.cos(a * 0.7854), dy = Math.sin(a * 0.7854); if (this.solidAt(x + dx * 7, y + dy * 7)) { nx -= dx; ny -= dy; } }
    const l = Math.hypot(nx, ny);
    return l < 0.01 ? [0, -1] : [nx / l, ny / l];
  }

  private stepProj(p: Projectile): void {
    const DT = 1 / 120, S = this.S;
    p.age += DT;
    if (p.rolling) return this.rollStep(p);
    if (p.moling) return this.moleStep(p);
    if (p.seek) return this.seekStep(p);
    const pvy = p.vy;
    if (p.homing && p.vy > 0) {
      const k = this.nearestRival(p.owner, p.x), dx = k ? k.x - p.x : 1e9;
      if (Math.abs(dx) < 320 && Math.abs(dx) > 4) p.vx = clamp(p.vx + Math.sign(dx) * 340 * DT, -440, 440);
    }
    this.fly(p, p, S.wind, S.g);
    if (p.primary && S.tickN % 4 === 0) S.curTrace.push(p.x, p.y);
    if (p.split && pvy < 0 && p.vy >= 0) {
      p.dead = true; S.booms.push({ x: p.x, y: p.y, r: 20, t: 0, c: this.colorOf(p.owner), soft: true });
      for (const o of [-95, -57, -19, 19, 57, 95]) this.spawn({ x: p.x, y: p.y, vx: p.vx + o, vy: p.vy, owner: p.owner, age: p.age, r: p.r, dmg: p.dmg }, o === 19);
      this.audio.pop(); return;
    }
    if (p.burst && p.vy > 0 && p.age > 0.3 && p.x >= 0 && p.x < this.W && this.floorBelow(p.x, Math.max(0, p.y)) - p.y < 70) {
      p.dead = true; S.booms.push({ x: p.x, y: p.y, r: 22, t: 0, c: this.colorOf(p.owner), soft: true });
      for (let i = -4; i <= 4; i++) this.spawn({ x: p.x, y: p.y, vx: p.vx * 0.35 + i * 38, vy: Math.max(130, p.vy * 0.5), owner: p.owner, age: 1, r: p.r, dmg: p.dmg });
      this.audio.pop(); return;
    }
    let hit = this.hitAt(p.x, p.y, p.age, p.owner, p.safeAll);
    if (hit === OOB) { p.dead = true; return; }
    if (p.ghost && (hit === GROUND || hit === LIQ)) hit = null;
    if (hit === GROUND && (p.bore || 0) > 0) { this.carve(p.x, p.y, p.boreR || 5, 0.2); p.bore = (p.bore || 0) - Math.hypot(p.vx, p.vy) * DT; return; }
    if ((p.pierceT || 0) > 0) {
      p.pierceT = (p.pierceT || 0) - DT; this.carve(p.x, p.y, 7, 0.15);
      if (hit && hit !== GROUND && hit !== LIQ) this.impact(p, hit);
      else if ((p.pierceT || 0) <= 0) { p.dead = true; this.explode(p.x, p.y, p.r, p.dmg, p.owner); }
      return;
    }
    if (hit) this.impact(p, hit);
  }

  private rollStep(p: Projectile): void {
    const DT = 1 / 120, S = this.S, W = this.W;
    p.rollT = (p.rollT || 0) + DT;
    const f0 = this.floorBelow(clamp(p.x - 3, 0, W - 1), p.y - 8), f1 = this.floorBelow(clamp(p.x + 3, 0, W - 1), p.y - 8), slope = clamp((f1 - f0) / 6, -2.5, 2.5);
    p.rv = (p.rv || 0) + slope * 520 * DT; p.rv *= 1 - (S.env.weather === 'snow' ? 2.4 : 0.6) * DT;
    const nx = p.x + p.rv * DT, dir = Math.sign(p.rv) || 1;
    if (nx < 2 || nx > W - 3) { p.dead = true; return; }
    if (this.solidAt(nx + dir * 4, p.y - 7)) p.rv *= -0.4; else p.x = nx;
    const f = this.floorBelow(p.x, p.y - 8);
    if (this.liquidAt(p.x, f + 1)) { p.dead = true; this.explode(p.x, f, p.r, p.dmg, p.owner); return; }
    p.y = f - 3 < p.y ? f - 3 : Math.min(f - 3, p.y + 340 * DT);
    for (const k of S.live) {
      if (Math.abs(p.x - k.x) < 13 && Math.abs(p.y - (k.y - 7)) < 14) { p.dead = true; this.explode(k.x, k.y - 7, p.r, p.dmg, p.owner); return; }
    }
    if ((p.rollT || 0) > (p.life || 4) || ((p.rollT || 0) > 0.6 && Math.abs(p.rv || 0) < 6 && p.y >= f - 4)) { p.dead = true; this.explode(p.x, p.y, p.r, p.dmg, p.owner); }
  }

  private moleStep(p: Projectile): void {
    const DT = 1 / 120, S = this.S, W = this.W;
    const saw = p.kind === 'saw';
    p.moleT = (p.moleT || 0) + DT; p.x += (p.dir || 1) * (saw ? 200 : 230) * DT;
    if (p.x < 3 || p.x > W - 4) { p.dead = true; return; }
    if (saw) {
      if (this.solidAt(p.x + (p.dir || 1) * 6, p.y - 6)) this.carve(p.x + (p.dir || 1) * 6, p.y - 4, 12, 0.3);
      else { const f = this.floorBelow(clamp(p.x + (p.dir || 1) * 14, 0, W - 1), p.y - 14); p.y = f - 4 < p.y ? f - 4 : Math.min(f - 4, p.y + 300 * DT); }
      if (S.tickN % 2 === 0) this.carve(p.x - (p.dir || 1) * 2, p.y + 8, 11, 0.35);
    } else {
      if (p.y < (p.deep || 0)) p.y = Math.min(p.deep || 0, p.y + 130 * DT);
      this.carve(p.x, p.y, 8, 0.12);
    }
    if (this.liquidAt(p.x + (p.dir || 1) * 4, p.y)) { p.dead = true; this.explode(p.x, p.y, saw ? 20 : p.r, saw ? 10 : p.dmg, p.owner); return; }
    if (S.tickN % 4 === 0 && S.parts.length < 420) S.parts.push({ x: p.x, y: saw ? p.y : this.surfaceY(p.x), vx: this.rand(-30, 30) - (p.dir || 1) * 40, vy: -this.rand(40, 120), t: 0, life: 0.4, c: saw ? '#ffe9a8' : S.pal.dust, s: 2.5, spark: saw });
    for (const k of S.live) {
      if (k.id === p.owner && (p.moleT || 0) < 0.3) continue;
      if (Math.abs(p.x - k.x) < (saw ? 13 : 8) && Math.abs(p.y - (k.y - 6)) < (saw ? 20 : 46)) { p.dead = true; this.explode(saw ? k.x : p.x, saw ? k.y - 6 : Math.min(p.y, k.y + 14), p.r, p.dmg, p.owner); return; }
    }
    if ((p.moleT || 0) > (saw ? 1.6 : 1.3)) { p.dead = true; this.explode(p.x, p.y, saw ? 20 : p.r, saw ? 10 : p.dmg, p.owner); }
  }

  private seekStep(p: Projectile): void {
    const DT = 1 / 120, S = this.S;
    p.life = (p.life || 0) - DT;
    let tg: Tank | null = null, bd = 1e9;
    for (const k of S.live) if (!this.sameTeam(k.id, p.owner)) { const d = Math.hypot(k.x - p.x, k.y - 7 - p.y); if (d < bd) { bd = d; tg = k; } }
    if (tg) { let da = Math.atan2(tg.y - 7 - p.y, tg.x - p.x) - (p.ang || 0); while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; p.ang = (p.ang || 0) + clamp(da, -3.4 * DT, 3.4 * DT); }
    const a = (p.ang || 0) + Math.sin(p.age * 13 + (p.ph || 0)) * 0.6;
    p.x += Math.cos(a) * (p.sp || 0) * DT; p.y += Math.sin(a) * (p.sp || 0) * DT;
    const hit = this.hitAt(p.x, p.y, p.age, p.owner, true);
    if (hit === OOB || (p.life || 0) <= 0) { p.dead = true; return; }
    if (!hit) return;
    p.dead = true;
    if (hit !== GROUND && hit !== LIQ) this.explode((hit as Tank).x, (hit as Tank).y - 7, p.r, p.dmg, p.owner, true);
  }

  private impact(p: Projectile, hit: typeof GROUND | typeof LIQ | Tank): void {
    const S = this.S, W = this.W;
    const tank = hit !== GROUND && hit !== LIQ ? (hit as Tank) : null, wet = hit === LIQ;
    const x = tank ? tank.x : p.x, y = tank ? tank.y - 7 : p.y, o = p.owner;
    if (p.tracer) {
      p.dead = true; (S.marks[o] || (S.marks[o] = [])).push({ x, y: tank ? tank.y : y, lab: p.lab! });
      this.debris(x, y, 6, this.colorOf(o)); if (p.lab === 0) this.audio.pop();
      if (tank && !this.sameTeam(tank.id, o)) S.floats.push({ x: tank.x, y: tank.y - 40 - (S.floats.length % 3) * 18, t: 0, text: this.offsetLabel(p.lab!) + ' on target', c: this.colorOf(o) });
      return;
    }
    if (!tank) {
      if ((p.skip || 0) > 0 || ((p.bounce || 0) > 0 && !wet) || ((p.hops || 0) > 0 && !wet)) {
        const n = wet ? [0, -1] : this.normalAt(p.x, p.y), dot = p.vx * n[0] + p.vy * n[1];
        if ((p.bounce || 0) > 0) { this.explode(x, y, p.r, p.dmg, o); p.bounce = (p.bounce || 0) - 1; p.r += p.grow || 0; p.dmg += 2; }
        else if ((p.hops || 0) > 0) { this.explode(x, y, 18, 6, o); p.hops = (p.hops || 0) - 1; }
        else { p.skip = (p.skip || 0) - 1; if (wet) this.debris(x, y, 12, WATERC); else this.carve(x, y, 16, 0.5); this.audio.pop(); }
        if (p.hops != null && !p.skip && !p.bounce) {
          const k = this.nearestRival(o, p.x), dx = k ? k.x - p.x : 0;
          p.vx = clamp(dx * 0.6, -80, 80); p.vy = -0.83 * S.g;
        } else {
          const e = p.skip != null ? 0.74 : 0.62;
          if (dot < 0) { p.vx -= 2 * dot * n[0]; p.vy -= 2 * dot * n[1]; }
          p.vx *= e; p.vy *= e; if (p.vy > -130) p.vy = -130;
        }
        p.x += n[0] * 5; p.y += n[1] * 5; p.age = 1; return;
      }
      if (!wet) {
        if (p.roll) { p.rolling = true; p.rollT = 0; p.rv = clamp(p.vx * 0.6, -280, 280); p.y = this.floorBelow(p.x, p.y - 8) - 3; return; }
        if (p.pierce && !p.pierced) { p.pierced = true; p.pierceT = 0.2; p.vx *= 0.6; p.vy *= 0.6; return; }
        if (p.kind === 'mole' || p.kind === 'saw') { p.moling = true; p.moleT = 0; p.dir = Math.sign(p.vx) || 1; p.deep = p.y + 26; if (p.kind === 'saw') p.y -= 4; return; }
      }
    }
    p.dead = true;
    const boom = () => this.explode(x, y, p.r, p.dmg, o, p.ghost);
    const lightning = (bx: number, r: number, d: number) => { const by = this.surfaceY(bx); this.bolt(bx + this.rand(-60, 60), -10, bx, by, '#ffffff'); S.flash = Math.max(S.flash, 0.6); this.explode(bx, by, r, d, o); this.audio.thunder(); };
    switch (p.kind) {
      case 'drill':
        if (wet) { boom(); break; }
        for (let i = 0; i < 14; i++) this.after(i * 0.07, () => this.explode(x, y + i * 15, 11, 5, o));
        this.after(14 * 0.07 + 0.12, () => this.explode(x, Math.min(H - 30, y + 14 * 15), p.r, p.dmg, o));
        break;
      case 'dirt':
        this.blob(x, Math.max(40, y - 74), 50, 46, LOOSE, (t) => t === AIR); this.debris(x, y - 60, 40, S.pal.dust); this.audio.thud();
        break;
      case 'strike':
        boom();
        for (let i = -3; i <= 3; i++) this.after(0.3 + (i + 3) * 0.11, () => this.spawn({ x: clamp(x + i * 38 + this.rand(-8, 8), 4, W - 4), y: -20, vx: 0, vy: 300, owner: o, age: 1, r: 34, dmg: 15 }));
        break;
      case 'fountain':
        boom();
        for (let i = 0; i < 8; i++) this.spawn({ x, y: y - 8, vx: this.rand(-150, 150), vy: -this.rand(260, 420), owner: o, age: 0, safeAll: true, r: 28, dmg: 11 });
        break;
      case 'cracker': {
        const dir = Math.sign(p.vx) || 1;
        for (let i = 0; i < 7; i++) this.after(i * 0.1, () => { const ex = clamp(x + dir * i * 34, 0, W - 1); this.explode(ex, i === 0 ? y : this.floorBelow(ex, Math.max(0, y - 60)), p.r, p.dmg, o); });
        break;
      }
      case 'sauce': {
        boom();
        const n = S.precip === 'rain' ? 80 : 140;
        for (let i = 0; i < n; i++) S.bits.push({ x: x + this.rand(-6, 6), y: y - 6 - this.rand(0, 10), vx: this.rand(-110, 110), vy: -this.rand(60, 240), t: LAVA });
        this.audio.sizzle();
        break;
      }
      case 'sink':
        this.blob(x, y + 14, 92, 62, AIR, () => true); this.explode(x, y, p.r, p.dmg, o, true); this.audio.thud();
        break;
      case 'thump':
        this.explode(x, y, p.r, p.dmg, o, true);
        for (const k of S.live) { const d = Math.abs(k.x - x); if (d < 180 && !this.isBuried(k)) { k.moveDir = k.x >= x ? 1 : -1; k.moveLeft = Math.max(k.moveLeft, 14 + 46 * (1 - d / 180)); S.traces[k.id] = null; } }
        for (const k of S.tanks) k.rangeN = 0;
        break;
      case 'level': {
        const g = this.G.g, cols = this.G.cols, rows = this.G.rows, c0 = Math.max(0, ((x - 150) / CELL) | 0), c1 = Math.min(cols - 1, ((x + 150) / CELL) | 0), tops: number[] = [];
        let s = 0;
        for (let c = c0; c <= c1; c++) { let r = 0; while (r < rows && !SOLID[g[r * cols + c]]) r++; tops.push(r); s += r; }
        const avg = s / tops.length;
        for (let c = c0; c <= c1; c++) {
          const top = tops[c - c0], k = 0.9 * (0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, Math.abs(c * CELL - x) / 150))), tgt = Math.round(top + (avg - top) * k);
          if (top < tgt) { for (let r = top; r < tgt; r++) if (g[r * cols + c] !== ROCK) g[r * cols + c] = AIR; }
          else for (let r = tgt; r < top && r < rows - 5; r++) g[r * cols + c] = DIRT;
        }
        grid.touch(this.G, c0 - 1, 0, c1 + 1, rows - 1);
        this.explode(x, y, p.r, p.dmg, o, true); this.audio.thud();
        break;
      }
      case 'arc': {
        boom();
        const done = new Set([o]); if (tank) done.add(tank.id);
        let fx = x, fy = y;
        for (let j = 0; j < 2; j++) {
          let best: Tank | null = null, bd = 380;
          for (const k of S.live) { if (done.has(k.id)) continue; const d = Math.hypot(k.x - fx, k.y - 7 - fy); if (d < bd && d > 20) { bd = d; best = k; } }
          if (!best) break;
          done.add(best.id);
          const ax = fx, ay = fy, amt = j ? 10 : 14; fx = best.x; fy = best.y - 7;
          const bb = best;
          this.after(0.16 + j * 0.2, () => { if (bb.dead) return; this.bolt(ax, ay, bb.x, bb.y - 7, '#bfe8ff'); this.hurt(bb, amt, o); this.audio.zap(); });
        }
        break;
      }
      case 'steal':
        if (tank && !this.sameTeam(tank.id, o)) {
          const me = S.tanks[o];
          if (S.health) { if (!me.dead) { me.hp = Math.min(S.cfg.health, me.hp + 15); this.floatText(me, '+15', me.color); } this.hurt(tank, 15, o); }
          else { S.scores[tank.id] -= 15; S.scores[o] += 15; S.floats.push({ x: tank.x, y: tank.y - 52, t: 0, text: '15 swiped', c: this.colorOf(o) }); this.ui.onScores(); }
        }
        boom();
        break;
      case 'hop': {
        const me = S.tanks[o]; if (me.dead) break;
        S.booms.push({ x: me.x, y: me.y - 7, r: 26, t: 0, c: me.color, soft: true });
        if (tank && tank !== me) { [me.x, tank.x] = [tank.x, me.x]; [me.y, tank.y] = [tank.y, me.y]; S.traces[tank.id] = null; }
        else if (!tank) {
          let nx = clamp(x, 20, W - 20);
          for (const k of S.live) if (k !== me && Math.abs(nx - k.x) < 30) nx = clamp(k.x + (nx >= k.x ? 32 : -32), 20, W - 20);
          this.carve(nx, y - 8, 15, 0);
          me.x = nx; me.y = y - 6; me.vy = 0;
        }
        S.booms.push({ x: me.x, y: me.y - 7, r: 26, t: 0, c: me.color, soft: true });
        for (const k of S.tanks) k.rangeN = 0;
        S.traces[o] = null; this.audio.pop();
        break;
      }
      case 'hole':
        S.holes.push({ x, y: y - 6, t: 0, owner: o, r: p.r, dmg: p.dmg }); this.audio.zap();
        break;
      case 'swarm':
        boom();
        for (let i = 0; i < 8; i++) this.spawn({ x, y: y - 10, vx: 0, vy: 0, seek: true, ang: -Math.PI / 2 + this.rand(-1.2, 1.2), sp: this.rand(135, 170), life: this.rand(2.4, 3.1), ph: this.rand(0, 6.28), owner: o, age: 0, r: 14, dmg: 5 });
        break;
      case 'hiccup':
        boom(); S.booms.push({ x, y, r: 70, t: 0, c: '#a6e86a', soft: true });
        for (const k of S.live) if (Math.hypot(k.x - x, k.y - 7 - y) < 72) { k.hiccup = true; this.floatText(k, 'hic!', '#a6e86a'); }
        break;
      case 'geyser':
        boom();
        for (const k of S.live) if (Math.abs(k.x - x) < 44 && Math.abs(k.y - 7 - y) < 54 && !this.isBuried(k)) {
          k.y -= 3; k.vy = -this.rand(320, 390); k.moveDir = Math.abs(k.x - x) < 2 ? (this.rnd() < 0.5 ? -1 : 1) : Math.sign(k.x - x); k.moveLeft = this.rand(60, 110); S.traces[k.id] = null;
        }
        for (const k of S.tanks) k.rangeN = 0;
        for (let j = 0; j < 5; j++) this.after(j * 0.09, () => { for (let i = 0; i < 46; i++) S.bits.push({ x: x + this.rand(-8, 8), y: y - 4 - this.rand(0, 8), vx: this.rand(-70, 70), vy: -this.rand(220, 520), t: WATER }); });
        this.audio.splash();
        break;
      case 'thunder':
        boom();
        for (let i = 0; i < 4; i++) this.after(0.3 + i * 0.3, () => lightning(clamp(x + this.rand(-125, 125), 6, W - 6), 34, 15));
        break;
      case 'smoke':
        S.smokes.push({ x, y: y - 34, r: 150, turns: S.live.length * 2, puffs: Array.from({ length: 16 }, () => ({ dx: this.rand(-120, 120), dy: this.rand(-50, 34), w: this.rand(170, 260), h: this.rand(100, 150) })) });
        this.audio.thud();
        break;
      case 'prism': {
        const ex = x, ey = Math.max(30, y - 90);
        S.booms.push({ x: ex, y: ey, r: 18, t: 0, c: this.colorOf(o), soft: true }); this.audio.zap();
        for (let i = 0; i < 9; i++) this.after(0.25 + i * 0.06, () => {
          const a = ((200 + (i * 140) / 8) * Math.PI) / 180, cx = Math.cos(a), cy = -Math.sin(a);
          let rx = ex, ry = ey, ht: ReturnType<Engine['hitAt']> = null;
          for (let d = 0; d < 480 && !ht; d += 4) { rx += cx * 4; ry += cy * 4; ht = this.hitAt(rx, ry, 1, -1, false); }
          this.bolt(ex, ey, rx, ry, this.colorOf(o), true);
          if (ht && ht !== OOB) { const tk = ht !== GROUND && ht !== LIQ ? (ht as Tank) : null; this.explode(tk ? tk.x : rx + cx * 6, tk ? tk.y - 7 : ry + cy * 6, p.r, p.dmg, o); }
        });
        break;
      }
      case 'sticky':
        S.bombs.push({ x, y, tank: tank ? tank.id : -1, fuse: 1, owner: o, r: p.r, dmg: p.dmg }); this.audio.pop();
        break;
      default:
        boom();
    }
  }

  offsetLabel(d: number): string { return d === 0 ? '0°' : (d > 0 ? '+' : '−') + Math.abs(d) + '°'; }

  private drama(x: number, y: number): void {
    const S = this.S;
    if (this.reduced || S.time < S.dramaAt) return;
    S.slowT = 0.55; S.zx = clamp(x, this.W * 0.2, this.W * 0.8); S.zy = clamp(y, H * 0.3, H * 0.8); S.dramaAt = S.time + 1.2;
  }

  private kill(k: Tank): void {
    const S = this.S;
    if (k.dead) return;
    k.dead = true; k.hp = 0; k.shield = 0; k.moveLeft = 0; S.live = S.tanks.filter((t) => !t.dead); S.marks[k.id] = null;
    S.booms.push({ x: k.x, y: k.y - 7, r: 60, t: 0, c: k.color }); this.debris(k.x, k.y - 7, 70, k.color); this.debris(k.x, k.y - 7, 50, '#3a3340');
    for (let i = 0; i < 6; i++) this.smokePuff(k.x + this.rand(-14, 14), k.y - 10 - this.rand(0, 16), this.rand(12, 22), true);
    S.floats.push({ x: k.x, y: k.y - 56, t: 0, text: k.name + ' is out', c: k.color });
    S.shake = Math.min(18, S.shake + 9); S.flash = Math.max(S.flash, 0.5); this.audio.boom(90); this.drama(k.x, k.y);
  }

  private hurt(k: Tank, amt: number, owner: number): void {
    const S = this.S;
    if (k.dead) return;
    amt = Math.max(1, Math.round(amt));
    // Soap Bubble: a one-hit shield. It swallows the whole incoming hit, whatever its size, then pops.
    if (k.shield > 0) { k.shield = 0; this.floatText(k, 'blocked', '#bfe8ff'); S.booms.push({ x: k.x, y: k.y - 8, r: 26, t: 0, c: '#bfe8ff', soft: true }); this.audio.pop(); return; }
    k.hitLast += amt;
    if (amt >= 30) this.drama(k.x, k.y - 10);
    const friendly = owner >= 0 && this.sameTeam(k.id, owner);
    if (owner >= 0 && !friendly) S.shotDmg += amt;
    S.taken[k.id] = (S.taken[k.id] || 0) + amt;
    if (S.health) {
      k.hp -= amt; if (owner >= 0 && !friendly) S.scores[owner] += amt;
      this.floatText(k, '−' + amt, k.color);
      if (k.hp <= 0) this.kill(k);
    } else {
      const who = owner < 0 ? k.id : owner, gain = owner >= 0 && !friendly;
      S.scores[who] += gain ? amt : -amt;
      this.floatText(k, (gain ? '+' : '−') + amt, S.tanks[who].color);
    }
    this.ui.onScores();
  }

  private explode(x: number, y: number, r: number, dmg: number, owner: number, noCarve?: boolean): void {
    const S = this.S;
    const wet = this.liquidAt(x, y) || this.liquidAt(x, y + 4);
    if (!noCarve) this.carve(x, y, r, 0.3, r >= 20);
    if (dmg > 0) for (const k of S.live) {
      const d = Math.hypot(x - k.x, y - (k.y - 7)), reach = r + 12;
      if (d < reach) this.hurt(k, dmg * (1 - Math.pow(d / reach, 1.5)), owner);
    }
    S.booms.push({ x, y, r, t: 0, c: this.colorOf(owner) });
    this.debris(x, y, r, wet ? WATERC : S.pal.dust);
    for (let i = 0, n = clamp((r / 10) | 0, 2, 9); i < n; i++) this.smokePuff(x + this.rand(-r, r) * 0.5, y + this.rand(-r, r) * 0.3, this.rand(0.3, 0.6) * r + 6, !wet);
    if (!wet) for (let i = 0, n = Math.min(22, (r / 3) | 0); i < n && S.parts.length < 480; i++) {
      const a = this.rand(Math.PI, 2 * Math.PI), sp = this.rand(120, 200 + r * 4);
      S.parts.push(this.allocPart(x, y, Math.cos(a) * sp, Math.sin(a) * sp, this.rand(0.25, 0.7), '#ffd98a', 1.6, true));
    }
    if (r >= 40) S.flash = Math.max(S.flash, Math.min(0.7, r / 160));
    S.shake = Math.min(18, S.shake + r * 0.14);
    if (r >= 76) this.drama(x, y);
    if (wet) this.audio.splash();
    this.audio.boom(r);
  }

  private smokePuff(x: number, y: number, r: number, dark: boolean): void { if (this.S.puffs.length < 90) this.S.puffs.push({ x, y, vx: this.rand(-14, 14), vy: -this.rand(12, 32), t: 0, life: this.rand(0.9, 1.9), r, dark }); }

  private debris(x: number, y: number, r: number, c: string): void {
    const S = this.S, n = Math.min(18, 4 + ((r / 5) | 0));
    for (let i = 0; i < n && S.parts.length < 480; i++) {
      const a = this.rand(Math.PI, 2 * Math.PI), s = this.rand(40, 60 + r * 3);
      S.parts.push(this.allocPart(x + this.rand(-r, r) * 0.4, y + this.rand(-r, r) * 0.3, Math.cos(a) * s, Math.sin(a) * s, this.rand(0.4, 1), c, this.rand(1.5, 3.5), false));
    }
  }

  private bolt(x0: number, y0: number, x1: number, y1: number, c: string, straight?: boolean): void {
    const n = straight ? 1 : Math.max(4, (Math.hypot(x1 - x0, y1 - y0) / 26) | 0), pts = [x0, y0];
    for (let i = 1; i < n; i++) pts.push(lerp(x0, x1, i / n) + this.rand(-12, 12), lerp(y0, y1, i / n) + this.rand(-8, 8));
    pts.push(x1, y1); this.S.bolts.push({ pts, t: 0, c });
  }

  // ---- tanks (src/c_play.js:543-581) ----
  isBuried(t: Tank): boolean { return this.solidAt(t.x, t.y - 9); }
  private solidFloor(x: number, y: number): number { let f = 1e9; for (const d of [-8, 0, 8]) { const v = this.solidBelow(x + d, y - 9); if (v < f) f = v; } return f; }
  restY(t: Tank): number {
    const f = this.solidFloor(t.x, t.y), g = this.G.g, cols = this.G.cols, c = clamp((t.x / CELL) | 0, 0, cols - 1), rEnd = Math.min(this.G.rows - 1, (f / CELL) | 0);
    const wet = (k: number) => { const v = g[k * cols + c]; return v === WATER || v === LAVA; };
    let r = clamp(((t.y - 6) / CELL) | 0, 0, this.G.rows - 1);
    if (wet(r)) { for (let up = 0; r > 0 && up < 30 && wet(r - 1); up++) r--; } else while (r < rEnd && !wet(r)) r++;
    let n = 0; while (r + n < rEnd && wet(r + n)) n++;
    t.afloat = n >= 5;
    return t.afloat ? Math.min(f, r * CELL + 4) : f;
  }
  tiltOf(t: Tank): number { return this.isBuried(t) || t.afloat || t.falling ? 0 : clamp(Math.atan2(this.solidBelow(t.x + 9, t.y - 9) - this.solidBelow(t.x - 9, t.y - 9), 18), -0.6, 0.6); }
  inLava(t: Tank): boolean { for (const dx of [-9, 0, 9]) for (const dy of [-3, 1]) if (this.cellAt(clamp(t.x + dx, 0, this.W - 1), t.y + dy) === LAVA) return true; return false; }
  startMove(t: Tank, dir: number): boolean {
    const S = this.S;
    if ((t.fuel <= 0 && !S.sandbox) || t.moveLeft > 0 || this.isBuried(t)) return false;
    if (!S.sandbox) t.fuel--;
    t.moveLeft = 40; t.moveDir = dir;
    for (const k of S.tanks) k.rangeN = 0;
    S.traces[t.id] = null;
    return true;
  }
  private stepTank(t: Tank): void {
    const DT = 1 / 120, S = this.S, W = this.W;
    if (t.moveLeft > 0) {
      const step = Math.min(t.moveLeft, 70 * DT), nx = t.x + t.moveDir * step;
      const blocked = S.live.some((o) => o !== t && Math.abs(nx - o.x) < 30 && Math.abs(nx - o.x) < Math.abs(t.x - o.x));
      if (nx < 20 || nx > W - 20 || blocked || this.isBuried(t) || this.solidAt(nx + t.moveDir * 9, t.y - 10)) { t.moveLeft = 0; this.ui.onSync(); }
      else { t.x = nx; const g = this.solidFloor(nx, t.y); if (g < t.y) t.y = g; t.moveLeft -= step; if (t.moveLeft <= 0) { t.moveLeft = 0; this.ui.onSync(); } }
    }
    if (this.isBuried(t)) { t.vy = 0; t.falling = false; t.fallT = 0; t.afloat = false; return; }
    const g = this.restY(t);
    if (t.afloat && t.vy >= 0) {
      if (t.y > g + 0.5) { if (!this.solidAt(t.x, t.y - 20)) t.y = Math.max(g, t.y - 60 * DT); t.vy = 0; t.falling = false; t.fallT = 0; return; }
      if (t.y >= g - 8) { t.y = Math.min(g, t.y + 40 * DT); t.vy = 0; t.falling = false; t.fallT = 0; return; }
    }
    if (t.y < g - 0.5) { t.vy += 700 * DT; t.y = Math.min(g, t.y + t.vy * DT); t.falling = true; t.fallT += DT; }
    else { if (g < t.y) t.y = g; t.vy = 0; t.falling = false; t.fallT = 0; }
  }

  // ---- AI (src/d_ai_loop.js:2-125) ----
  private simShot(t: Tank, ang: number, pw: number, spec: WeaponSpec): { x: number; y: number; tank: Tank | null } | null {
    const DT = 1 / 120, a = (ang * Math.PI) / 180, sp = spec.straight ? 900 : pw * this.S.vel, wind = this.S.wind, g = this.S.g;
    const q: Projectile = { x: t.x + Math.cos(a) * 18, y: t.y - 12 - Math.sin(a) * 18, vx: Math.cos(a) * sp, vy: -Math.sin(a) * sp, owner: t.id, age: 0, r: spec.r, dmg: spec.dmg };
    let age = 0, bore = spec.bore || 0;
    for (let i = 0; i < 2400; i++) {
      age += DT; this.fly(q, spec, wind, g);
      const hit = this.hitAt(q.x, q.y, age, t.id, false);
      if (hit === OOB) return null;
      if (hit === GROUND || hit === LIQ) {
        if (spec.ghost) continue;
        if (hit === GROUND && bore > 0) { bore -= Math.hypot(q.vx, q.vy) * DT; continue; }
        return { x: q.x, y: q.y, tank: null };
      }
      if (hit) return { x: (hit as Tank).x, y: (hit as Tank).y - 7, tank: hit as Tank };
    }
    return null;
  }

  private aiSolve(me: Tank, tx: number, ty: number, foe: Tank | null, spec: WeaponSpec): Solve {
    const S = this.S, hits: Solve[] = [], safe = (spec.danger || spec.r || 25) + 30;
    let best: Solve = { a: me.angle, p: me.power, miss: 1e9 };
    const consider = (a: number, p: number) => {
      const r = this.simShot(me, a, p, spec); let miss = 5000;
      if (r) {
        miss = foe && r.tank === foe ? 0 : Math.hypot(r.x - tx, r.y - ty);
        if (r.tank && r.tank !== foe && !this.sameTeam(r.tank.id, me.id)) miss = Math.min(miss, 2);
        if (spec.kind !== 'hop') for (const k of S.live) if (this.sameTeam(k.id, me.id) && Math.hypot(r.x - k.x, r.y - (k.y - 7)) < safe) miss += 800;
      }
      if (miss === 0) hits.push({ a, p, miss });
      if (miss < best.miss) best = { a, p, miss };
    };
    if (spec.straight) {
      const d = (Math.atan2(me.y - 12 - ty, tx - me.x) * 180) / Math.PI;
      for (let o = -4; o <= 4; o += 0.5) consider(clamp(d + o, 0, 180), 100);
      return best;
    }
    // NB (backlog "AI aiSolve speed"): coarsening this grid (3->4) and an early-out on the first
    // hits were both tried and reverted — they perturb match outcomes (changing which exact-hit
    // solution is picked) for negligible gain, since profiling (tests/e2e/perf.spec.ts) shows AI
    // planning frames peak at ~6ms and are not the e2e bottleneck; match length is. If AI solve
    // ever needs to come off the main thread, move it to a Web Worker (no outcome change).
    for (let a = 6; a <= 174; a += 3) for (let p = 16; p <= 100; p += 3) consider(a, p);
    if (hits.length) return this.pickOne(hits);
    const c = best;
    for (let a = c.a - 3; a <= c.a + 3; a += 0.5) for (let p = c.p - 3; p <= c.p + 3; p += 0.5) consider(clamp(a, 0, 180), clamp(p, 5, 100));
    return best;
  }

  private specOf(t: Tank, id: string): WeaponSpec { return WEAPONS[id === 'encore' ? this.S.lastId || 'shell' : id === 'mystery' ? t.pending || 'shell' : id].spec; }

  private aiPickWeapon(me: Tank, foe: Tank, L: Level): number {
    const S = this.S, W = this.W, inv = me.weapons;
    if (inv.length < 2) return 0;
    if (L.smart === 0) return (this.rnd() * inv.length) | 0;
    const sl = this.surfaceY(clamp(foe.x - 44, 0, W - 1)), sr = this.surfaceY(clamp(foe.x + 44, 0, W - 1));
    const pit = sl < foe.y - 24 && sr < foe.y - 24, hill = sl > foe.y + 16 && sr > foe.y + 16;
    const covered = this.isBuried(foe) || this.solidTop(foe.x) < foe.y - 26;
    const d = (Math.atan2(me.y - 12 - (foe.y - 7), foe.x - me.x) * 180) / Math.PI;
    const r = this.simShot(me, clamp(d, 0, 180), 100, WEAPONS.rail.spec), los = !!(r && r.tank === foe);
    const crowd = S.live.some((k) => k !== foe && !this.sameTeam(k.id, me.id) && Math.abs(k.x - foe.x) < 380);
    let bi = 0, bv = -1e9;
    inv.forEach((id, i) => {
      const s = this.specOf(me, id); let v = this.rand(0, 3 * (1.2 - L.smart) + 0.8);
      if (s.straight) v += los ? 4 : -6;
      if (s.kind === 'drill') v += pit || covered ? 3 : 0;
      if (s.roll || s.kind === 'sauce' || s.kind === 'geyser') v += pit ? 2 : hill ? -3 : 0;
      if (s.kind === 'dirt') v += covered ? -4 : 1.5;
      if (covered) v += s.kind === 'drill' || s.pierce || s.ghost || s.kind === 'mole' || s.bore ? 3 : (s.r >= 60 ? 1.5 : -1.5);
      if (s.plumb || s.ghost) v += pit ? 2.5 : 0;
      if (s.kind === 'arc' || s.kind === 'hole') v += crowd ? 2.5 : 0;
      if (s.kind === 'steal') v += S.health || S.scores[foe.id] >= 15 ? 1.5 : -1;
      if (s.self === 'bubble') v += me.hitLast >= 14 && !me.shield ? 4 : -3;
      else if (s.self || s.kind === 'hop' || s.kind === 'smoke') v -= 4;
      if (v > bv) { bv = v; bi = i; }
    });
    return bi;
  }

  private planAI(): void {
    const g = this.S, me = this.cur(), L = LEVELS[me.level!], W = this.W;
    const aimAtFoe = (foe: Tank, el: number) => { me.angle = foe.x >= me.x ? el : 180 - el; };
    const think = () => {
      const S = this.S, foes = S.live.filter((k) => !this.sameTeam(k.id, me.id)), shell = WEAPONS.shell.spec, tracer = S.tracerRound;
      const near = this.nearestRival(me.id, me.x) || foes[0] || me;
      if (!tracer && !me.shaped) {
        if (this.isBuried(me)) { aimAtFoe(near, 62); this.doShape(me, 'dig'); }
        else if (L.smart > 0 && me.hitLast >= 20 && this.rnd() < L.dodge * 0.7) { aimAtFoe(near, 60); this.doShape(me, 'wall'); }
      }
      const solveAll = (): [Tank, Solve] => {
        let foe = foes[0] || me, sol: Solve | null = null;
        if (L.smart === 0) { foe = this.pickOne(foes); sol = this.aiSolve(me, foe.x, foe.y - 7, foe, shell); }
        else { let bv = 1e9; for (const f of foes) { const s = this.aiSolve(me, f.x, f.y - 7, f, shell), v = s.miss - (S.health ? (S.cfg.health - f.hp) * 0.12 : S.scores[f.id] * 0.15) + this.rand(0, 10); if (v < bv) { bv = v; foe = f; sol = s; } } }
        return [foe, sol || this.aiSolve(me, foe.x, foe.y - 7, foe, shell)];
      };
      let [foe, sol] = solveAll();
      const boxed = this.solidTop(me.x) < me.y - 24 || (this.solidAt(me.x - 26, me.y - 22) && this.solidAt(me.x + 26, me.y - 22));
      if (!tracer && !me.shaped && L.smart > 0 && sol.miss > 80 && boxed && !this.isBuried(me)) {
        aimAtFoe(foe, clamp(sol.a <= 90 ? sol.a : 180 - sol.a, 25, 75)); this.doShape(me, 'dig'); [foe, sol] = solveAll();
      }
      let a = me.angle, p = me.power;
      if (!tracer) {
        me.sel = this.aiPickWeapon(me, foe, L);
        if (me.weapons[me.sel] === 'mystery') me.pending = this.pickOne(MYSTERY_POOL);
      }
      const spec = tracer ? TRACER.spec : this.specOf(me, me.weapons[me.sel]);
      if (!spec.self) {
        if (spec.kind === 'hop') {
          let tx = this.rand(60, W - 60);
          for (let i = 0; i < 8 && S.live.some((k) => Math.abs(k.x - tx) < 90); i++) tx = this.rand(60, W - 60);
          sol = this.aiSolve(me, tx, this.surfaceY(tx), null, spec);
        } else if (spec.straight || spec.boom || spec.plumb || spec.chute || spec.walls || spec.ghost || spec.bore) {
          const s2 = this.aiSolve(me, foe.x, foe.y - 7, foe, spec); if (s2.miss < 4000) sol = s2;
        }
        if (me.lastFoe !== foe.id) { me.rangeN = 0; me.lastFoe = foe.id; }
        const k = Math.max(L.floor, Math.pow(L.learn, me.rangeN)), blind = S.smokes.some((m) => Math.abs(m.x - foe.x) < m.r) ? 3.5 : 0;
        a = clamp(sol.a + this.gauss() * (L.sa * k * (spec.straight ? 0.5 : 1) + blind), 0, 180);
        p = clamp(sol.p + this.gauss() * (L.sp * k + blind), 5, 100);
        me.rangeN++;
      }
      g.aiPlan = { a0: me.angle, p0: me.power, a, p, t: 0, dur: g.demo ? 0.6 : 1 };
      this.ui.onSync();
    };
    const step = (tries: number) => {
      const S = this.S;
      const bomb = L.smart > 0 && S.bombs.find((b) => b.tank !== me.id && Math.abs(b.x - me.x) < b.r + 14);
      const hot = this.inLava(me), flinch = tries === 0 && me.hitLast >= 16 && this.rnd() < L.dodge;
      if ((bomb || hot || flinch) && tries < 2 && me.fuel > 0 && !this.isBuried(me)) {
        const dir = bomb ? (me.x >= bomb.x ? 1 : -1) : me.x < 90 ? 1 : me.x > W - 90 ? -1 : this.rnd() < 0.5 ? -1 : 1;
        if (this.startMove(me, dir)) { this.ui.onSync(); this.later(g, 900, () => step(tries + 1)); return; }
      }
      think();
    };
    this.later(g, g.demo ? 350 : 700, () => step(0));
  }

  // ---- sim loop (src/d_ai_loop.js:127-239) ----
  private stepBits(): void {
    const DT = 1 / 120, S = this.S, W = this.W, bits = S.bits, gr = S.g * 1.25, holes = S.holes;
    let w = 0;
    for (let i = 0; i < bits.length; i++) {
      const b = bits[i]; b.vy += gr * DT; if (!b.rain) b.vx += S.wind * 0.3 * DT;
      let eaten = false;
      for (const hl of holes) { const dx = hl.x - b.x, dy = hl.y - b.y, d = Math.hypot(dx, dy); if (d < 16) { eaten = true; break; } if (d < 240) { b.vx += (dx / d) * 1500 * DT; b.vy += (dy / d) * 1500 * DT; } }
      if (eaten) continue;
      const nx = b.x + b.vx * DT, ny = b.y + b.vy * DT;
      if (nx < 0 || nx >= W || ny >= H) continue;
      if (ny >= 0 && this.cellAt(nx, ny) !== AIR) { this.deposit(b.x, b.y, b.t); continue; }
      b.x = nx; b.y = ny; bits[w++] = b;
    }
    bits.length = w;
  }

  private tick(): void {
    const DT = 1 / 120, S = this.S, W = this.W;
    S.time += DT; S.tickN++;
    for (let i = S.events.length - 1; i >= 0; i--) if (S.events[i].t <= S.time) S.events.splice(i, 1)[0].fn();
    for (let i = S.projs.length - 1; i >= 0; i--) { const p = S.projs[i]; if (p && !p.dead) this.stepProj(p); }
    { const a = S.projs; let w = 0; for (let i = 0; i < a.length; i++) { const p = a[i]; if (p && !p.dead) a[w++] = p; } a.length = w; }
    if (S.holes.length) {
      for (const hl of S.holes) {
        hl.t += DT;
        if (S.tickN % 6 === 0) this.carve(hl.x, hl.y, 14 + hl.t * 23, 0);
        for (const k of S.live) { const dx = hl.x - k.x; if (Math.abs(dx) < 240 && Math.abs(dx) > 14 && !this.isBuried(k)) { k.moveDir = Math.sign(dx); k.moveLeft = Math.max(k.moveLeft, 1.5); S.traces[k.id] = null; } }
        if (S.tickN % 3 === 0 && S.parts.length < 480) { const a = this.rand(0, 6.28), d = this.rand(40, 130); S.parts.push(this.allocPart(hl.x + Math.cos(a) * d, hl.y + Math.sin(a) * d, -Math.cos(a) * d * 2.2, -Math.sin(a) * d * 2.2 - 120, 0.42, '#c4a1ff', 2.5, false)); }
      }
      const done = S.holes.filter((hl) => hl.t >= 2);
      if (done.length) {
        S.holes = S.holes.filter((hl) => hl.t < 2);
        for (const hl of done) this.explode(hl.x, hl.y, hl.r, hl.dmg, hl.owner);
        for (const k of S.tanks) k.rangeN = 0;
      }
    }
    for (const b of S.bombs) { const k = b.tank >= 0 ? S.tanks[b.tank] : null; if (k && !k.dead) { b.x = k.x; b.y = k.y - 10; } else { b.tank = -1; b.y = this.floorBelow(clamp(b.x, 0, W - 1), Math.max(0, b.y - 6)) - 4; } }
    if (S.bits.length) this.stepBits();
    simStep(this.G, (sx, sy) => { if (S.puffs.length < 70) S.puffs.push({ x: sx, y: sy, vx: this.rand(-10, 10), vy: -this.rand(20, 44), t: 0, life: this.rand(0.6, 1.1), r: this.rand(6, 11), dark: false }); });
    for (const t of S.tanks) this.stepTank(t);
    if (this.G.act && S.tickN % 3 === 0) this.burySlides();
    if (S.tickN % 30 === 0) S.props = S.props.filter((p) => this.solidAt(p.x, p.y0 + 2));
    if (S.precip === 'rain' && S.tickN % (S.env.weather === 'storm' ? 10 : 20) === 0 && S.bits.length < 1400) S.bits.push({ x: this.rand(4, W - 4), y: 1, vx: S.wind * 1.5, vy: 430, t: WATER, rain: true });
    if (S.phase === 'flight') {
      const busy = S.projs.length || S.events.length || S.holes.length || S.tanks.some((k) => (k.falling && k.fallT > 0.15) || k.moveLeft > 0) || S.bits.some((b) => !b.rain);
      if (busy) { S.settleT = 0; S.flowT = 0; }
      else if (this.G.act && (S.flowT += DT) < 1.6) S.settleT = 0;
      else if ((S.settleT += DT) > 0.7) {
        if (!S.health && !S.tracerRound && S.shots.every((v) => v === 0)) for (const b of S.bombs) b.fuse = 0;
        const due = S.bombs.filter((b) => b.fuse <= 0);
        if (due.length) { S.bombs = S.bombs.filter((b) => b.fuse > 0); for (const b of due) this.explode(b.x, b.y, b.r, b.dmg, b.owner); S.settleT = 0; }
        else if (!S.hazardDone && this.hazard()) S.settleT = 0;
        else if (!S.burnDone) {
          S.burnDone = true; const k = this.cur();
          if (!k.dead && this.inLava(k)) { this.hurt(k, 16, -1); this.smokePuff(k.x, k.y - 12, 12, true); this.audio.sizzle(); S.settleT = 0.2; } else this.endTurn();
        } else this.endTurn();
      }
    }
  }

  update(dt: number): void {
    const S = this.S, W = this.W;
    for (const p of S.projs) { p.trail!.push(p.x, p.y); if (p.trail!.length > (p.seek ? 10 : 32)) p.trail!.splice(0, 2); }
    // In-place compaction (no per-frame array allocation); culled parts return to the freelist.
    { const a = S.parts; let w = 0; for (let i = 0; i < a.length; i++) { const q = a[i]; q.t += dt; q.vy += 520 * dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.t < q.life) a[w++] = q; else this.freePart(q); } a.length = w; }
    { const a = S.puffs; let w = 0; for (let i = 0; i < a.length; i++) { const q = a[i]; q.t += dt; q.x += (q.vx + S.wind * 0.3) * dt; q.y += q.vy * dt; q.r += 12 * dt; if (q.t < q.life) a[w++] = q; } a.length = w; }
    for (const t of S.tanks) {
      t.recoil *= Math.pow(0.002, dt);
      if (t.dead ? this.rnd() < dt * 2.5 : S.health && t.hp < S.cfg.health * 0.35 && this.rnd() < dt * 5) this.smokePuff(t.x + this.rand(-4, 4), t.y - 14, this.rand(5, 9), true);
    }
    { const a = S.booms; let w = 0; for (let i = 0; i < a.length; i++) { const b = a[i]; b.t += dt * 2.3; if (b.t < 1) a[w++] = b; } a.length = w; }
    { const a = S.bolts; let w = 0; for (let i = 0; i < a.length; i++) { const b = a[i]; b.t += dt * 3.2; if (b.t < 1) a[w++] = b; } a.length = w; }
    { const a = S.floats; let w = 0; for (let i = 0; i < a.length; i++) { const f = a[i]; f.t += dt; f.y -= 26 * dt; if (f.t < 1.5) a[w++] = f; } a.length = w; }
    if (S.banner) { S.banner.t += dt; if (S.banner.t > 1.9) S.banner = null; }
    S.shake *= Math.pow(0.004, dt); S.flash *= Math.pow(0.004, dt);
    for (const d of S.drops) {
      if (S.precip === 'rain') { d.y += (600 + d.s * 220) * dt; d.x += (S.wind * 4 - 50) * dt; if (d.y > H) { d.y = -12; d.x = this.rand(0, W + 100); } }
      else if (S.precip === 'snow') { d.y += (48 + d.s * 44) * dt; d.x += (S.wind * 2 + Math.sin(S.time * 1.5 + d.s * 9) * 18) * dt; if (d.y > H) { d.y = -6; d.x = this.rand(0, W); } }
      else { d.y -= (28 + d.s * 40) * dt; d.x += Math.sin(S.time * 2 + d.s * 9) * 14 * dt; if (d.y < 150 + d.s * 200) { d.x = this.rand(0, W); d.y = this.surfaceY(d.x); } }
      if (d.x < -20) d.x += W + 40; else if (d.x > W + 20) d.x -= W + 40;
    }
    if (this.rnd() < dt * 16 && S.parts.length < 480) {
      const x = this.rand(0, W - 1), y = this.surfaceY(x);
      if (this.cellAt(x, y + 1) === LAVA) S.parts.push(this.allocPart(x, y, this.rand(-14, 14), -this.rand(50, 130), this.rand(0.5, 1), '#ffb347', 1.6, true));
    }
    for (const f of this.FOG) { f.x += f.v * dt; if (f.x < -400) f.x = W + 400; else if (f.x > W + 400) f.x = -400; }
    for (const c of this.CLOUDS) { c.x += c.v * dt; if (c.x > W + 340) c.x = -340; }
    const pl = S.aiPlan;
    if (pl && S.phase === 'aim' && !(this.cur().moveLeft > 0)) {
      pl.t += dt; const me = this.cur(), k = clamp(pl.t / pl.dur, 0, 1), e = k * k * (3 - 2 * k);
      me.angle = lerp(pl.a0, pl.a, e); me.power = lerp(pl.p0, pl.p, e); this.ui.onAim();
      if (pl.t > pl.dur + 0.3) this.fire();
    }
  }

  /** Advance the sim by `real` seconds of wall-clock time (fixed-step accumulator + slow-mo). */
  advance(real: number): void {
    const DT = 1 / 120, S = this.S;
    if (!S || this.paused) return;
    real = Math.min(0.05, real);
    let scale = 1;
    if (S.slowT > 0) { S.slowT -= real; scale = 0.3; }
    S.z += ((S.slowT > 0 ? 1.14 : 1) - S.z) * Math.min(1, real * 7);
    const dt = real * scale;
    this.acc += dt; let n = 0;
    while (this.acc >= DT && n++ < 12) { this.tick(); this.acc -= DT; }
    if (this.acc > DT) this.acc = 0;
    this.update(dt);
  }

  // expose a couple of input affordances used by the UI layer
  setPreview(preview: Preview): void { this.preview = preview; }
  isArmed(): boolean { return this.armed; }
  arm(): void { this.armed = true; this.audio.arm(); }
  unarm(): void { this.armed = false; }

  /** Test helper: load `id` on the current tank and (for ballistic weapons) aim a solving shot at `target`. */
  loadAndAim(id: string, target: Tank | null): void {
    const me = this.cur();
    me.weapons = [id]; me.sel = 0; me.pending = null;
    const spec = WEAPONS[id].spec;
    if (target && !spec.self && !spec.tracer) {
      const sol = this.aiSolve(me, target.x, target.y - 7, target, this.specOf(me, id));
      me.angle = clamp(sol.a, 0, 180); me.power = clamp(sol.p, 5, 100);
    }
  }
}
