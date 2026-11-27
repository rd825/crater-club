// Targeted unit tests for mechanics that the per-weapon impact suite and the full-match runs
// don't isolate: Encore/Mystery resolution, hiccup off-line fire, lava burn at the end of a
// tank's own turn, and health-mode resupply. (backlog: "Targeted unit tests")

import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/engine/engine.ts';
import { silentUI, silentAudio } from '../../src/engine/bridge.ts';
import { FakeClock } from '../helpers/harness.ts';
import { CELL, LAVA, ROCK, ARSENAL } from '../../src/engine/constants.ts';
import type { Engine as EngineT } from '../../src/engine/engine.ts';
import type { MatchConfig } from '../../src/engine/types.ts';

function makeEng(over: Partial<MatchConfig> = {}): EngineT {
  const cfg: MatchConfig = {
    players: [{ type: 'human' }, { type: 'regular' }],
    mode: 'volleys', volleys: 30, health: 150, teams: 'ffa', deal: 'random',
    wind: 'calm', size: 'medium', biome: 'hills', time: 'noon', weather: 'clear', seed: 999,
    ...over,
  };
  const eng = new Engine(silentUI, silentAudio, new FakeClock());
  eng.newGame(cfg);
  eng.S.tracerRound = false; // skip the ranging volley; fire live immediately
  eng.S.phase = 'aim';
  eng.S.turn = 0; // the human seat — so fire() runs without the AI planner
  return eng;
}

function resolve(eng: EngineT, cap = 2500): void {
  let n = 0;
  while (eng.S.phase === 'flight' && n < cap) { eng.advance(0.05); n++; }
}

describe('Encore / Mystery resolution', () => {
  it('Encore replays the last weapon fired (resolves to S.lastId)', () => {
    const eng = makeEng();
    const me = eng.S.tanks[0];
    eng.S.lastId = 'bubble'; // last weapon was Soap Bubble (a synchronous self-shield)
    me.weapons = ['encore']; me.sel = 0; me.shield = 0;
    eng.fire();
    // Encore resolved to 'bubble' and ran its effect this turn (one-hit shield up).
    expect(me.shield).toBeGreaterThan(0);
    expect(eng.S.lastId).toBe('bubble');
  });

  it('Mystery fires the pending weapon and clears it', () => {
    const eng = makeEng();
    const me = eng.S.tanks[0];
    me.weapons = ['mystery']; me.sel = 0; me.pending = 'bubble'; me.shield = 0;
    eng.fire();
    expect(me.shield).toBeGreaterThan(0); // the pending Soap Bubble ran
    expect(me.pending).toBeNull(); // pending is consumed
    expect(eng.S.lastId).toBe('bubble'); // and recorded as the last weapon
  });
});

describe('Hiccup', () => {
  it('a hiccup fires the next shot inverted (mirrored angle, flipped power) and then clears', () => {
    const eng = makeEng();
    const me = eng.S.tanks[0];
    me.weapons = ['shell']; me.sel = 0; me.angle = 70; me.power = 60;
    me.hiccup = true;
    eng.fire();
    expect(me.hiccup).toBe(false); // consumed
    expect(me.angle).toBe(110); // mirrored across vertical: 180 - 70
    expect(me.power).toBe(45); // flipped within [5,100]: 105 - 60
    const p = eng.S.projs[0];
    expect(p).toBeTruthy();
    const launchDeg = (Math.atan2(-p.vy, p.vx) * 180) / Math.PI;
    expect(Math.abs(launchDeg - 110)).toBeLessThan(1); // the slug leaves on the mirrored line
  });

  it('without a hiccup the shot launches on the aimed line', () => {
    const eng = makeEng();
    const me = eng.S.tanks[0];
    me.weapons = ['shell']; me.sel = 0; me.angle = 70; me.power = 60;
    me.hiccup = false;
    eng.fire();
    const p = eng.S.projs[0];
    const launchDeg = (Math.atan2(-p.vy, p.vx) * 180) / Math.PI;
    expect(Math.abs(launchDeg - 70)).toBeLessThan(1);
  });
});

describe('Lava burn at the end of a tank\'s own turn', () => {
  it('a tank standing in lava when its turn settles takes burn damage', () => {
    const eng = makeEng({ mode: 'health', health: 120 }); // hp only drops in health mode
    const me = eng.S.tanks[0];
    // Carve a lava puddle around the current tank: clear air above, a THIN lava band over its body
    // (a thick band would make the tank float on top, out of the lava), and a rock floor just below
    // so it rests in the lava. Writing cells directly leaves the sim asleep (G.act stays null), so
    // the lava neither flows away nor the tank floats up before the turn settles.
    const g = eng.G.g, cols = eng.G.cols;
    const col0 = Math.max(0, ((me.x - 14) / CELL) | 0), col1 = ((me.x + 14) / CELL) | 0;
    const row = (wy: number) => (wy / CELL) | 0;
    const airR0 = row(me.y - 30), lavaR0 = row(me.y - 4), lavaR1 = row(me.y + 2), rockR1 = row(me.y + 26);
    for (let c = col0; c <= col1; c++) {
      for (let r = airR0; r < lavaR0; r++) g[r * cols + c] = 0; // AIR above
      for (let r = lavaR0; r <= lavaR1; r++) g[r * cols + c] = LAVA;
      for (let r = lavaR1 + 1; r <= rockR1; r++) g[r * cols + c] = ROCK;
    }
    expect(eng.isBuried(me)).toBe(false);
    const hp0 = me.hp;
    // End the turn with Bunker: synchronous, builds walls 34px away (clear of the puddle), and —
    // unlike Soap Bubble — gives the firer no shield that would absorb the burn.
    me.weapons = ['bags']; me.sel = 0;
    eng.fire();
    resolve(eng);
    expect(eng.inLava(me)).toBe(true); // still standing in the lava when the turn settled
    expect(me.hp).toBeLessThan(hp0); // burned on its way out of the turn
  });
});

describe('Health-mode resupply', () => {
  it('a tank that runs out of weapons is resupplied a fresh arsenal at the start of its turn', () => {
    const eng = makeEng({ mode: 'health', health: 120 });
    expect(eng.S.health).toBe(true);
    eng.S.turn = 0;
    const me = eng.S.tanks[0];
    me.weapons = []; // spent everything
    eng.startAim();
    expect(me.weapons.length).toBe(ARSENAL);
  });
});
