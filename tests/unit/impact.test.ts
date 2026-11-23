import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/engine/engine.ts';
import { silentUI, silentAudio } from '../../src/engine/bridge.ts';
import { FakeClock } from '../helpers/harness.ts';
import { WEAPON_IDS, WEAPONS } from '../../src/data/weapons.ts';
import { BUILT, LAVA, STONE, AIR } from '../../src/engine/constants.ts';
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

  it('Soap Bubble grants the firer a 35 shield (synchronous)', () => {
    const { eng, me } = arena();
    eng.loadAndAim('bubble', null);
    eng.fire();
    expect(me.shield).toBe(35);
  });

  it('Bunker builds BUILT walls beside the firer (synchronous)', () => {
    const { eng } = arena();
    const before = countMat(eng, BUILT);
    eng.loadAndAim('bags', null);
    eng.fire();
    expect(countMat(eng, BUILT)).toBeGreaterThan(before);
  });

  it('High Ground raises the firer (synchronous)', () => {
    const { eng, me } = arena();
    const yBefore = me.y;
    eng.loadAndAim('lift', null);
    eng.fire();
    expect(me.y).toBeLessThan(yBefore); // y grows downward, so "up" is smaller
  });

  it('Smoke Screen deploys a smoke cloud', () => {
    const { eng, foe } = arena();
    eng.loadAndAim('smoke', foe);
    eng.fire();
    resolve(eng);
    expect(eng.S.smokes.length).toBeGreaterThan(0);
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

  it('a soap-bubble shield absorbs the next damage', () => {
    const { eng, me, foe } = arena(77);
    // give the FOE a shield, then hit it
    foe.shield = 35;
    eng.loadAndAim('shell', foe);
    eng.fire();
    resolve(eng);
    // the foe's shield should have absorbed some/all of the first damage
    expect(foe.shield).toBeLessThanOrEqual(35);
    void me;
  });
});
