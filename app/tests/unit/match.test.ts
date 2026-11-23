import { describe, it, expect } from 'vitest';
import { runMatch } from '../helpers/harness.ts';
import type { MatchConfig } from '../../src/engine/types.ts';

function cfg(over: Partial<MatchConfig> = {}): MatchConfig {
  return {
    players: [{ type: 'veteran' }, { type: 'regular' }],
    mode: 'volleys',
    volleys: 3,
    health: 150,
    teams: 'ffa',
    deal: 'random',
    wind: 'calm',
    size: 'small',
    biome: 'hills',
    time: 'noon',
    weather: 'clear',
    seed: 12345,
    ...over,
  };
}

describe('full match runs headless (parity milestone)', () => {
  it('a 2-AI volleys match reaches game over with no errors', () => {
    const r = runMatch(cfg());
    expect(r.errors).toEqual([]);
    expect(r.eng.S.phase).toBe('over');
    expect(r.over).not.toBeNull();
    expect(typeof r.over!.title).toBe('string');
    // every shot was spent
    expect(r.eng.S.shots.every((v) => v === 0)).toBe(true);
  });

  it('is deterministic for a fixed seed', () => {
    const a = runMatch(cfg());
    const b = runMatch(cfg());
    expect(a.eng.S.scores).toEqual(b.eng.S.scores);
    expect(a.over!.title).toBe(b.over!.title);
  });

  it('different seeds generally diverge', () => {
    const a = runMatch(cfg({ seed: 1 }));
    const b = runMatch(cfg({ seed: 2 }));
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    // not a hard guarantee, but scores should differ for different worlds
    expect(a.eng.S.scores).not.toEqual(b.eng.S.scores);
  });

  it('draft deal completes (all-AI auto-draft) and plays out', () => {
    const r = runMatch(cfg({ deal: 'draft', players: [{ type: 'ace' }, { type: 'veteran' }, { type: 'regular' }], volleys: 2 }));
    expect(r.errors).toEqual([]);
    expect(r.eng.S.phase).toBe('over');
  });

  it('8-AI match on a complex biome runs clean', () => {
    const r = runMatch(
      cfg({
        players: Array.from({ length: 8 }, () => ({ type: 'regular' as const })),
        volleys: 2,
        size: 'large',
        biome: 'caldera',
        time: 'night',
        weather: 'clear',
        seed: 777,
      }),
    );
    expect(r.errors).toEqual([]);
    expect(r.eng.S.phase).toBe('over');
  });

  it('teams mode resolves a winner or dead heat', () => {
    const r = runMatch(
      cfg({
        players: [{ type: 'veteran' }, { type: 'veteran' }, { type: 'regular' }, { type: 'regular' }],
        teams: 'teams',
        volleys: 3,
        seed: 42,
      }),
    );
    expect(r.errors).toEqual([]);
    expect(r.eng.S.phase).toBe('over');
    expect(r.over!.title.length).toBeGreaterThan(0);
  });

  it('health mode (last tank standing) terminates with ace shooters', () => {
    const r = runMatch(
      cfg({ mode: 'health', health: 60, players: [{ type: 'ace' }, { type: 'ace' }], biome: 'mesa', seed: 5 }),
      300_000,
    );
    expect(r.errors).toEqual([]);
    expect(r.eng.S.phase).toBe('over');
    // at most one team left alive
    const teamsAlive = new Set(r.eng.S.live.map((t) => r.eng.S.teamOf[t.id]));
    expect(teamsAlive.size).toBeLessThanOrEqual(1);
  });
});
