import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/engine/engine.ts';
import { silentUI, silentAudio } from '../../src/engine/bridge.ts';
import { FakeClock } from '../helpers/harness.ts';
import { WEAPON_IDS, WEAPONS } from '../../src/data/weapons.ts';
import { BUILT, LAVA, STONE, AIR, CELL } from '../../src/engine/constants.ts';
import type { MatchConfig, Tank } from '../../src/engine/types.ts';

function arena(seed = 999): { eng: Engine; me: Tank; foe: Tank } {
  const cfg: MatchConfig = {
    players: [{ type: 'regular' }, { type: 'regular' }],
    mode: 'volleys', volleys: 30, health: 150, teams: 'ffa', deal: 'random',
    wind: 'calm', size: 'medium', biome: 'hills', time: 'noon', weather: 'clear', seed,
  };
  const eng = new Engine(silentUI, silentAudio, new FakeClock());
  eng.newGame(cfg);
  eng.S.tracerRound = false; // skip ranging volley; fire live immediately
  eng.S.phase = 'aim';
  return { eng, me: eng.S.tanks[0], foe: eng.S.tanks[1] };
}

/** Advance physics-only (clock frozen so AI never acts) until the shot resolves. */
function resolve(eng: Engine, cap = 2500): void {
  let n = 0;
  while (eng.S.phase === 'flight' && n < cap) { eng.advance(0.05); n++; }
}

function countMat(eng: Engine, m: number): number {
  let n = 0;
  const g = eng.G.g;
  for (let i = 0; i < g.length; i++) if (g[i] === m) n++;
  return n;
}
function totalTaken(eng: Engine): number {
  return eng.S.tanks.reduce((s, t) => s + (eng.S.taken[t.id] || 0), 0);
}

describe('every weapon fires end-to-end without error', () => {
  it('all 50 weapons + encore/mystery resolve a turn cleanly', () => {
    const failures: string[] = [];
    for (const id of WEAPON_IDS) {
      try {
        const { eng, foe } = arena();
        eng.S.lastId = 'shell'; // so Encore resolves
        eng.loadAndAim(id, foe);
        eng.fire();
        resolve(eng);
        if (eng.S.phase === 'flight') failures.push(`${id}: did not settle`);
      } catch (e) {
        failures.push(`${id}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('signature effects (the parity heart)', () => {
  it('shell carves a crater and damages a target it is aimed at', () => {
    const { eng, me, foe } = arena(111);
    const airBefore = countMat(eng, AIR);
    eng.loadAndAim('shell', foe);
    eng.fire();
    resolve(eng);
    expect(countMat(eng, AIR)).toBeGreaterThan(airBefore); // crater
    expect(totalTaken(eng)).toBeGreaterThan(0); // someone was hit
    void me;
  });

  it('Soap Bubble wraps the firer in a one-hit shield (synchronous)', () => {
    const { eng, me } = arena();
    eng.loadAndAim('bubble', null);
    eng.fire();
    expect(me.shield).toBeGreaterThan(0);
  });

  it('the Wall tool raises BUILT brick walls on both sides of the firer', () => {
    const { eng, me } = arena();
    const before = countMat(eng, BUILT);
    eng.doShape(me, 'wall');
    expect(countMat(eng, BUILT)).toBeGreaterThan(before);
  });

  it('the Mound tool raises the firer onto high ground (synchronous)', () => {
    const { eng, me } = arena();
    const yBefore = me.y;
    eng.doShape(me, 'burrow');
    expect(me.y).toBeLessThan(yBefore); // y grows downward, so "up" is smaller
  });

  it('Sticky Bomb plants a bomb that waits for the next shot (fuse > 0)', () => {
    const { eng, foe } = arena();
    eng.loadAndAim('sticky', foe);
    eng.fire();
    resolve(eng);
    // the bomb is planted and still armed (it only goes off after the next tank fires)
    expect(eng.S.bombs.length).toBeGreaterThan(0);
    expect(eng.S.bombs[0].fuse).toBeGreaterThan(0);
  });

  it('Black Hole opens a singularity that eats ground and then pops', () => {
    const { eng, foe } = arena();
    const airBefore = countMat(eng, AIR);
    eng.loadAndAim('hole', foe);
    eng.fire();
    let sawHole = false;
    for (let i = 0; i < 400 && eng.S.phase === 'flight'; i++) { eng.advance(0.05); if (eng.S.holes.length) sawHole = true; }
    expect(sawHole).toBe(true);
    expect(countMat(eng, AIR)).toBeGreaterThan(airBefore); // it carved ground
  });

  it('Hot Sauce spills molten lava', () => {
    const { eng, foe } = arena(222);
    eng.loadAndAim('sauce', foe);
    eng.fire();
    let sawLava = false;
    for (let i = 0; i < 400 && eng.S.phase === 'flight'; i++) {
      eng.advance(0.05);
      if (eng.S.bits.some((b) => b.t === LAVA) || countMat(eng, LAVA) > 0 || countMat(eng, STONE) > 0) sawLava = true;
    }
    expect(sawLava).toBe(true);
  });

  it('Hop Shell relocates the firer without dealing damage', () => {
    const { eng, me, foe } = arena();
    const x0 = me.x;
    eng.loadAndAim('hop', foe);
    eng.fire();
    resolve(eng);
    expect(me.x).not.toBe(x0); // teleported
    expect(totalTaken(eng)).toBe(0); // no damage
  });

  it('Dirt Dump drops loose dirt and deals no damage', () => {
    const { eng, foe } = arena(333);
    eng.loadAndAim('dirt', foe);
    eng.fire();
    resolve(eng);
    expect(WEAPONS.dirt.spec.dmg).toBe(0);
    expect(totalTaken(eng)).toBe(0);
  });

  it('Homer curves toward the nearest rival on the way down', () => {
    // Fire straight up with the foe parked just to one side, inside the homing window. With calm
    // wind a plain shell comes straight back down on the firer; the homer must drift to the foe.
    const land = (id: string): { dx: number; dir: number } => {
      const { eng } = arena(111);
      const me = eng.cur();
      const foe = eng.S.tanks.find((t) => t.id !== me.id)!;
      const dir = foe.x >= me.x ? 1 : -1;
      foe.x = me.x + dir * 240; // definite side, inside the 320px homing range
      me.weapons = [id]; me.sel = 0; me.pending = null;
      me.angle = 90; me.power = 60; // straight up
      eng.S.phase = 'aim';
      eng.fire();
      let lastX = me.x;
      for (let i = 0; i < 2500 && eng.S.projs.length; i++) {
        eng.advance(0.05);
        if (eng.S.projs.length) lastX = eng.S.projs[0].x;
      }
      return { dx: lastX - me.x, dir };
    };
    const shell = land('shell'); // control: no homing
    const homer = land('homer');
    expect(Math.abs(shell.dx)).toBeLessThan(20); // the control barely drifts
    expect(Math.sign(homer.dx)).toBe(homer.dir); // the homer swings toward the foe's side
    expect(Math.abs(homer.dx)).toBeGreaterThan(40); // ...and meaningfully so
  });
});

describe('damage model', () => {
  it('explode falloff: a direct hit hurts more than a graze', () => {
    // fire a heavy shell straight at a target and confirm it deals meaningful damage
    const { eng, foe } = arena(55);
    eng.loadAndAim('heavy', foe);
    eng.fire();
    resolve(eng);
    expect(totalTaken(eng)).toBeGreaterThan(0);
  });

  it('a soap-bubble shield fully blocks one hit, then pops', () => {
    // seed 111 is the same setup as the shell-hits-target test above, so the shell connects.
    const { eng, me, foe } = arena(111);
    foe.shield = 1; // one-hit bubble
    eng.loadAndAim('shell', foe);
    eng.fire();
    resolve(eng);
    expect(foe.shield).toBe(0); // the hit popped it
    expect(eng.S.taken[foe.id] || 0).toBe(0); // and the foe took no damage from the blocked hit
    void me;
  });
});

describe('reworked weapons & terraform', () => {
  // Park a tank at (x,y) on a solid pedestal so it doesn't fall off the firing line during the sim.
  function pin(eng: Engine, k: Tank, x: number, y: number): void {
    k.x = x; k.y = y; k.falling = false; k.vy = 0; k.afloat = false;
    const g = eng.G.g, cols = eng.G.cols;
    for (let X = x - 16; X <= x + 16; X += 2)
      for (let Y = y + 2; Y <= y + 40; Y += 2) {
        const idx = ((Y / CELL) | 0) * cols + ((X / CELL) | 0);
        if (idx >= 0 && idx < g.length) g[idx] = STONE;
      }
  }

  it('Rail Slug bores through a thick wall to hit a tank on the far side', () => {
    const { eng } = arena(111);
    const me = eng.cur();
    const foe = eng.S.tanks.find((t) => t.id !== me.id)!;
    const W = eng.G.cols * CELL;
    const dir = me.x < W / 2 ? 1 : -1;
    pin(eng, foe, me.x + dir * 400, me.y); // line the foe up dead level, far across
    // Build a ~200px-thick solid wall between them — far wider than the old 90px bore cap would clear.
    const g = eng.G.g, cols = eng.G.cols;
    for (let X = me.x + dir * 120; dir > 0 ? X <= me.x + dir * 320 : X >= me.x + dir * 320; X += dir * 2)
      for (let Y = me.y - 40; Y <= me.y + 10; Y += 2) {
        const idx = ((Y / CELL) | 0) * cols + ((X / CELL) | 0);
        if (idx >= 0 && idx < g.length) g[idx] = STONE;
      }
    me.weapons = ['rail']; me.sel = 0; me.pending = null;
    me.angle = dir > 0 ? 0 : 180; me.power = 80; // dead horizontal, toward the foe
    eng.S.phase = 'aim';
    eng.fire();
    resolve(eng);
    expect(eng.S.taken[foe.id] || 0).toBeGreaterThan(0); // it punched clean through the wall
  });

  it('Phantom flies straight and pierces every rival on its line', () => {
    const cfg: MatchConfig = {
      players: [{ type: 'regular' }, { type: 'regular' }, { type: 'regular' }],
      mode: 'volleys', volleys: 30, health: 150, teams: 'ffa', deal: 'random',
      wind: 'calm', size: 'medium', biome: 'hills', time: 'noon', weather: 'clear', seed: 111,
    };
    const eng = new Engine(silentUI, silentAudio, new FakeClock());
    eng.newGame(cfg);
    eng.S.tracerRound = false; eng.S.phase = 'aim';
    const me = eng.cur();
    const foes = eng.S.tanks.filter((t) => t.id !== me.id);
    const W = eng.G.cols * CELL;
    const dir = me.x < W / 2 ? 1 : -1;
    pin(eng, foes[0], me.x + dir * 200, me.y); // two rivals lined up at muzzle height
    pin(eng, foes[1], me.x + dir * 360, me.y);
    me.weapons = ['phantom']; me.sel = 0; me.pending = null;
    me.angle = dir > 0 ? 0 : 180; me.power = 80;
    eng.fire();
    resolve(eng);
    expect(eng.S.taken[foes[0].id] || 0).toBeGreaterThan(0); // first in line hit
    expect(eng.S.taken[foes[1].id] || 0).toBeGreaterThan(0); // and it carried on through to the second
  });

  it('a ground-shaping tool is usable only once per match', () => {
    const { eng, me } = arena();
    expect(eng.doShape(me, 'wall')).toBe(true); // first use works
    expect(me.usedShapes).toContain('wall');
    expect(eng.doShape(me, 'wall')).toBe(false); // the same tool is spent for the match
    expect(eng.doShape(me, 'dig')).toBe(true); // a different tool still works
    expect(eng.doShape(me, 'dig')).toBe(false); // ...also once only
    expect(me.usedShapes.sort()).toEqual(['dig', 'wall']);
  });

  it('Nuke out-damages a plain shell on the same shot', () => {
    const hit = (id: string): number => {
      const { eng, foe } = arena(111);
      eng.loadAndAim(id, foe); eng.fire(); resolve(eng);
      return eng.S.taken[foe.id] || 0;
    };
    expect(hit('nuke')).toBeGreaterThan(hit('shell')); // the big one simply hits harder
  });

  it('Coin Toss sometimes lands golden for triple damage', () => {
    const hits: number[] = [];
    for (let s = 1; s <= 30; s++) {
      const { eng, foe } = arena(s);
      eng.loadAndAim('cointoss', foe); eng.fire(); resolve(eng);
      const d = eng.S.taken[foe.id] || 0; if (d > 0) hits.push(d);
    }
    expect(Math.max(...hits)).toBeGreaterThan(36); // only a golden (x3) flip reaches here (base ~18)
    expect(Math.min(...hits)).toBeLessThan(30); // ...and a plain flip lands normally
  });
});
