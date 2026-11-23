// Owns the engine, renderer, rAF loop, input, settings persistence and the resume bridge.
// The single bridge between the imperative game and the React shell.

import { Engine } from '../engine/engine.ts';
import { realScheduler, type UIBridge } from '../engine/bridge.ts';
import { H } from '../engine/constants.ts';
import type { MatchConfig, DraftView, GameOverResult, Tank } from '../engine/types.ts';
import { WebAudio } from '../audio/sound.ts';
import { Renderer } from '../render/draw.ts';
import { Store } from './store.ts';
import { DEFAULT_SETTINGS, validateSettings, type Settings } from '../data/options.ts';
import { clamp } from '../engine/math.ts';

const SETTINGS_KEY = 'craterclub.settings.v3';

export class GameController {
  readonly store = new Store();
  readonly audio = new WebAudio();
  readonly engine: Engine;
  settings: Settings;

  private renderer: Renderer | null = null;
  private cv: HTMLCanvasElement | null = null;
  private stage: HTMLElement | null = null;
  private raf = 0;
  private last = 0;
  private dragging = false;
  private attached = false;
  private booted = false;

  constructor() {
    this.settings = this.loadSettings();
    const ui: UIBridge = {
      onSync: () => this.store.bump(),
      onAim: () => this.store.bump(),
      onScores: () => this.store.bump(),
      onBanner: () => {},
      onBuildCards: () => this.store.bump(),
      onDraft: (v: DraftView | null) => { this.store.draftView = v; this.store.overlay = v ? 'draft' : this.store.overlay === 'draft' ? null : this.store.overlay; this.store.bump(); },
      onGameOver: (r: GameOverResult) => { this.store.overResult = r; this.store.overlay = 'over'; this.store.bump(); },
      closeOverlays: () => { this.store.overlay = null; this.store.bump(); },
    };
    this.engine = new Engine(ui, this.audio, realScheduler);
    this.engine.reduced = !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.audio.gate = () => !!this.engine.S && !this.engine.S.demo;
    this.audio.onState = () => { this.store.soundState = this.audio.state; this.store.bump(); };
  }

  // ---- settings ----
  private loadSettings(): Settings {
    try {
      return validateSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'));
    } catch {
      return { ...DEFAULT_SETTINGS, players: DEFAULT_SETTINGS.players.map((p) => ({ ...p })) };
    }
  }
  saveSettings(s: Settings): void {
    this.settings = s;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
    this.store.bump();
  }

  // ---- boot / resume ----
  boot(): void {
    if (this.booted) return;
    this.booted = true;
    const hot = (window as unknown as { claude?: { hot?: { snapshot?: (fn: () => unknown) => void; ready?: (cb: (d: unknown) => void) => void; data?: unknown } } }).claude?.hot;
    if (hot?.snapshot) hot.snapshot(() => this.engine.stable);
    const start = (data: unknown) => this.startFrom(data);
    if (hot?.ready) hot.ready(start);
    else start(hot?.data || {});
  }

  private startFrom(data: unknown): void {
    const d = data as Record<string, unknown> | null;
    if (d && d.v === 5 && d.grid && d.tanks && d.env) {
      try { this.engine.restore(d); this.store.overlay = null; this.store.bump(); this.startLoop(); return; } catch { /* fall through */ }
    }
    this.showMenu();
    this.startLoop();
  }

  showMenu(): void {
    // a live demo match plays behind the menu
    this.engine.newGame(this.engine.demoCfg(), true);
    this.store.overlay = 'menu';
    this.store.bump();
  }

  startMatch(): void {
    this.audio.wake();
    this.engine.newGame(this.buildConfig(), false);
    this.store.overResult = null;
    this.startLoop();
  }
  startPlayground(): void {
    this.audio.wake();
    this.engine.newGame(this.engine.playCfg(this.settings), false);
    this.startLoop();
  }
  newMap(): void {
    if (this.engine.S && this.engine.S.sandbox) this.engine.newGame(this.engine.S.cfg, false);
  }
  rematch(): void {
    this.store.overResult = null;
    this.engine.newGame(this.engine.S.cfg, false);
  }

  private buildConfig(): MatchConfig {
    const s = this.settings;
    return {
      players: s.players.map((p) => ({ type: p.type })),
      mode: s.mode, volleys: s.volleys, health: s.health, teams: s.teams, deal: s.deal,
      wind: s.wind, size: s.size, biome: s.biome, time: s.time, weather: s.weather,
    };
  }

  // ---- canvas / loop ----
  attach(cv: HTMLCanvasElement, stage: HTMLElement): void {
    if (this.attached) return;
    this.attached = true;
    this.cv = cv; this.stage = stage;
    this.renderer = new Renderer(cv);
    this.resize();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(stage);
    window.addEventListener('resize', this.resize);
    for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(ev, () => this.audio.wake(), { capture: true, passive: true });
    window.addEventListener('keydown', this.onKey);
    cv.addEventListener('pointerdown', this.onPointerDown);
    cv.addEventListener('pointermove', this.onPointerMove);
    cv.addEventListener('pointerup', this.endDrag);
    cv.addEventListener('pointercancel', this.endDrag);
  }

  resize = (): void => {
    const cv = this.cv, stage = this.stage;
    if (!cv || !stage) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = stage.clientWidth || 960;
    const W = this.engine.W || 1200;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round((cssW * dpr * H) / W);
    cv.style.width = '100%';
    cv.style.height = 'auto';
  };

  private startLoop(): void {
    if (this.raf) return;
    this.last = 0;
    const frame = (now: number) => {
      const real = Math.min(0.05, (now - this.last) / 1000 || 0);
      this.last = now;
      // keep canvas backing in sync with world width (it changes per match)
      if (this.cv && this.engine.W && Math.abs(this.cv.height / this.cv.width - H / this.engine.W) > 0.001) this.resize();
      this.engine.advance(real);
      if (this.renderer && this.engine.S) this.renderer.draw(this.engine);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  // ---- input (port of src/f_ui.js) ----
  private canHuman(): boolean { return this.engine.canHuman(); }

  nudge(dA: number, dP: number): void {
    if (!this.canHuman()) return;
    this.unarm();
    const t = this.engine.cur();
    t.angle = clamp(Math.round(t.angle) + dA, 0, 180);
    t.power = clamp(Math.round(t.power) + dP, 5, 100);
    this.store.bump();
  }
  setAngle(v: number): void { if (!this.canHuman()) return; this.unarm(); this.engine.cur().angle = 180 - v; this.store.bump(); }
  setPower(v: number): void { if (!this.canHuman()) return; this.unarm(); this.engine.cur().power = v; this.store.bump(); }
  cycle(d: number): void {
    if (!this.canHuman() || this.engine.S.tracerRound) return;
    const t = this.engine.cur(), n = t.weapons.length;
    if (n) { this.engine.unarm(); t.sel = (t.sel + d + n) % n; this.store.bump(); }
  }
  selectWeapon(i: number): void { if (!this.canHuman()) return; this.engine.unarm(); this.engine.cur().sel = i; this.store.bump(); }
  drive(d: number): void { if (!this.canHuman()) return; this.unarm(); if (this.engine.startMove(this.engine.cur(), d)) this.store.bump(); }
  shapeNow(tool: string): void { if (!this.canHuman()) return; this.unarm(); this.engine.doShape(this.engine.cur(), tool); }
  hoverTool(tool: string | null): void {
    if (tool && this.canHuman() && !this.engine.cur().shaped) this.engine.setPreview(tool);
    else if (!tool) this.engine.setPreview(null);
    this.store.bump();
  }
  pressFire(): void {
    this.audio.wake();
    if (!this.canHuman()) return;
    if (this.settings.confirm === 'off' || this.engine.isArmed()) this.engine.fire();
    else this.engine.arm();
    this.store.bump();
  }
  unarm(): void { this.engine.unarm(); this.store.bump(); }

  openPicker(): void {
    if (!this.engine.S?.sandbox || !this.canHuman()) return;
    this.engine.unarm(); this.engine.paused = true; this.store.overlay = 'picker'; this.store.bump();
  }
  closePicker(): void {
    if (this.store.overlay !== 'picker') return;
    this.engine.paused = false; this.store.overlay = null; this.store.bump();
  }
  pickDraft(i: number): void { this.engine.pick(i); }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.store.overlay === 'picker') { this.closePicker(); return; }
    if (!this.canHuman() || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('input, select, button, .overlay')) return;
    const big = e.shiftKey ? 5 : 1, k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let used = true;
    if (k === 'arrowleft') this.nudge(big, 0);
    else if (k === 'arrowright') this.nudge(-big, 0);
    else if (k === 'arrowup') this.nudge(0, big);
    else if (k === 'arrowdown') this.nudge(0, -big);
    else if (k === 'q' || k === '[') this.cycle(-1);
    else if (k === 'e' || k === ']') this.cycle(1);
    else if (k === 'a') this.drive(-1);
    else if (k === 'd') this.drive(1);
    else if (k === 'w') this.openPicker();
    else if (k === 'z') this.shapeNow('dig');
    else if (k === 'x') this.shapeNow('burrow');
    else if (k === 'c') this.shapeNow('wall');
    else if (k === 'v') this.shapeNow('bridge');
    else if (k === ' ' || k === 'enter') { if (!e.repeat) this.pressFire(); }
    else if (k === 'escape') this.unarm();
    else used = false;
    if (used) e.preventDefault();
  };

  private worldPt(e: PointerEvent): { x: number; y: number } {
    const cv = this.cv!, r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * this.engine.W, y: ((e.clientY - r.top) / r.height) * H };
  }
  private nearHandle(e: PointerEvent): boolean {
    const q = this.worldPt(e), t = this.engine.cur(), a = (t.angle * Math.PI) / 180, px = t.x, py = t.y - 12;
    return Math.hypot(q.x - px, q.y - py) < 70 || Math.hypot(q.x - (px + Math.cos(a) * t.power * 3.2), q.y - (py - Math.sin(a) * t.power * 3.2)) < 46;
  }
  private aimAt(e: PointerEvent): void {
    const q = this.worldPt(e), t: Tank = this.engine.cur(), dx = q.x - t.x, dy = t.y - 12 - q.y;
    let a = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (a < 0) a = dx < 0 ? 180 : 0;
    this.unarm();
    t.angle = Math.round(clamp(a, 0, 180));
    t.power = Math.round(clamp(Math.hypot(dx, dy) / 3.2, 5, 100));
    this.store.bump();
  }
  private onPointerDown = (e: PointerEvent): void => {
    if (!this.canHuman() || !this.nearHandle(e)) return;
    this.dragging = true;
    try { this.cv!.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  private onPointerMove = (e: PointerEvent): void => {
    if (this.dragging && this.canHuman()) this.aimAt(e);
    else if (this.cv) this.cv.style.cursor = this.canHuman() && this.nearHandle(e) ? 'grab' : 'default';
  };
  private endDrag = (): void => { this.dragging = false; };
}
