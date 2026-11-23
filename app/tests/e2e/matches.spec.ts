import { test, expect } from '@playwright/test';
import { FAST, startMatch, waitForOver, captureErrors } from './helpers.ts';

// Mirrors the RUNS matrix of the original tests/matches.py, adapted to the React build.
const RUNS: { key: string; cfg: Parameters<typeof startMatch>[1] }[] = [
  { key: 'A', cfg: { players: [{ type: 'veteran' }, { type: 'veteran' }], volleys: 6, deal: 'random', biome: 'hills', time: 'noon', weather: 'clear', wind: 'calm', seed: 1 } },
  // B is a 6-tank health/storm/islands crash smoke test. health:24 (vs the matrix's original 60)
  // keeps the same surface but resolves in ~2900 sim frames instead of ~6200, so it finishes well
  // inside the e2e timeout in-browser (60 HP ran > 3 min of real time on slower hardware).
  { key: 'B', cfg: { players: Array.from({ length: 6 }, (_, i) => ({ type: ['regular', 'veteran', 'ace', 'rookie', 'regular', 'veteran'][i] })), mode: 'health', health: 24, biome: 'islands', time: 'dusk', weather: 'storm', seed: 2 } },
  { key: 'C', cfg: { players: Array.from({ length: 8 }, () => ({ type: 'regular' })), volleys: 2, deal: 'draft', biome: 'caldera', time: 'night', weather: 'clear', size: 'large', seed: 3 } },
  { key: 'D', cfg: { players: [{ type: 'ace' }, { type: 'veteran' }], volleys: 4, biome: 'canyon', time: 'dawn', weather: 'rain', wind: 'breeze', seed: 4 } },
  { key: 'E', cfg: { players: [{ type: 'veteran' }, { type: 'veteran' }, { type: 'regular' }], volleys: 3, biome: 'moon', weather: 'meteors', size: 'large', seed: 5 } },
  { key: 'F', cfg: { players: [{ type: 'veteran' }, { type: 'veteran' }, { type: 'regular' }, { type: 'regular' }], mode: 'health', health: 80, deal: 'draft', teams: 'teams', biome: 'peaks', weather: 'snow', size: 'small', seed: 6 } },
  { key: 'G', cfg: { players: [{ type: 'regular' }, { type: 'ace' }], volleys: 3, biome: 'mesa', time: 'dusk', weather: 'fog', wind: 'gusty', seed: 7 } },
];

for (const run of RUNS) {
  test(`match ${run.key} reaches game over without errors`, async ({ page }) => {
    await page.addInitScript(FAST);
    const cap = captureErrors(page);
    await page.goto('/');
    await page.waitForFunction(() => !!(window as unknown as { __crater?: unknown }).__crater);
    await startMatch(page, run.cfg);
    // Health-mode matches on many tanks (e.g. run B) legitimately run a couple of minutes in the
    // browser — bound by match length (turns × settling + render), not AI solve CPU (well under a
    // frame). Generous room so slower CI runners stay green, under the 300s per-test timeout.
    await waitForOver(page, 270_000);
    expect(cap.errors).toEqual([]);
  });
}
