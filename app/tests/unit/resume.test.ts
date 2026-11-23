import { describe, it, expect } from 'vitest';
import { Engine } from '../../src/engine/engine.ts';
import { silentUI, silentAudio } from '../../src/engine/bridge.ts';
import { encodeGrid } from '../../src/engine/grid.ts';
import { FakeClock, stepFrames } from '../helpers/harness.ts';
import type { MatchConfig } from '../../src/engine/types.ts';

function playAWhile(seed = 2024): { eng: Engine; snap: Record<string, unknown> } {
  const cfg: MatchConfig = {
    players: [{ type: 'regular' }, { type: 'veteran' }, { type: 'regular' }],
    mode: 'volleys', volleys: 6, health: 150, teams: 'ffa', deal: 'random',
    wind: 'breeze', size: 'medium', biome: 'canyon', time: 'dusk', weather: 'rain', seed,
  };
  const clock = new FakeClock();
  const eng = new Engine(silentUI, silentAudio, clock);
  eng.newGame(cfg);
  // play through the tracer round and a few real turns so the terrain and scores evolve
  let guard = 0;
  while ((eng.S.tracerRound || eng.S.round < 2) && eng.S.phase !== 'over' && guard++ < 4000) {
    stepFrames(eng, clock, 1);
  }
  // snapshot is taken at the start of each turn; serialize it like the host would
  const snap = JSON.parse(JSON.stringify(eng.stable)) as Record<string, unknown>;
  return { eng, snap };
}

describe('snapshot / restore (v:5)', () => {
  it('saveStable emits a v:5 snapshot with an RLE grid', () => {
    const { snap } = playAWhile();
    expect(snap.v).toBe(5);
    expect(Array.isArray(snap.grid)).toBe(true);
    // RLE pairs sum to the full grid
    const grid = snap.grid as number[];
    let total = 0;
    for (let i = 1; i < grid.length; i += 2) total += grid[i];
    expect(total).toBeGreaterThan(0);
    expect(Array.isArray(snap.tanks)).toBe(true);
    expect(Array.isArray(snap.scores)).toBe(true);
  });

  it('restore reconstructs the exact grid, scores, round and tanks', () => {
    const { snap } = playAWhile();
    const fresh = new Engine(silentUI, silentAudio, new FakeClock());
    fresh.restore({ ...snap });

    // grid matches bit-for-bit
    expect(encodeGrid(fresh.G)).toEqual(snap.grid);
    // scalar match
    expect(fresh.S.scores).toEqual(snap.scores);
    expect(fresh.S.round).toBe(snap.round);
    expect(fresh.S.turn).toBe(snap.turn);
    expect(fresh.S.wind).toBe(snap.wind);
    // tanks restored
    const savedTanks = snap.tanks as { x: number; hp: number; weapons: string[] }[];
    fresh.S.tanks.forEach((t, i) => {
      expect(t.x).toBeCloseTo(savedTanks[i].x, 5);
      expect(t.weapons).toEqual(savedTanks[i].weapons);
    });
    // and it comes back into a playable aim phase
    expect(fresh.S.phase).toBe('aim');
  });

  it('a restored match keeps playing without error', () => {
    const { snap } = playAWhile(7);
    const clock = new FakeClock();
    const fresh = new Engine(silentUI, silentAudio, clock);
    fresh.restore({ ...snap });
    let err: string | null = null;
    try {
      stepFrames(fresh, clock, 1500);
    } catch (e) {
      err = (e as Error).message;
    }
    expect(err).toBeNull();
  });
});
