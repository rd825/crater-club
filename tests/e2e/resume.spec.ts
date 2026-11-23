import { test, expect } from '@playwright/test';
import { FAST, startMatch, captureErrors } from './helpers.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */

test('snapshot + reload restores the match via window.claude.hot', async ({ page }) => {
  await page.addInitScript(FAST);
  // stub the host bridge: on load, restore from a snapshot stashed in sessionStorage
  await page.addInitScript(() => {
    (window as any).claude = {
      hot: {
        snapshot: (f: () => unknown) => { (window as any).__snap = f; },
        ready: (f: (d: unknown) => void) => f(JSON.parse(sessionStorage.getItem('snap') || '{}')),
      },
    };
  });
  const cap = captureErrors(page);
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__crater);

  await startMatch(page, { players: [{ type: 'regular' }, { type: 'veteran' }], volleys: 6, biome: 'canyon', time: 'dusk', weather: 'clear', seed: 9 });

  // play into at least round 2 so terrain and scores have evolved
  await page.waitForFunction(() => {
    const S = (window as any).__crater.engine.S;
    return S.round >= 2 || S.phase === 'over';
  }, null, { timeout: 60_000 });

  const before = await page.evaluate(() => {
    const g = (window as any).__crater, S = g.engine.S;
    sessionStorage.setItem('snap', JSON.stringify((window as any).__snap()));
    return { round: S.round, turn: S.turn, scores: [...S.scores], biome: S.env.biome, grid: g.engine.stable.grid.length };
  });

  await page.reload();
  await page.waitForFunction(() => {
    const g = (window as any).__crater;
    return g && g.engine.S && g.engine.S.phase !== 'over';
  }, null, { timeout: 30_000 });

  const after = await page.evaluate(() => {
    const g = (window as any).__crater, S = g.engine.S;
    return { round: S.round, turn: S.turn, scores: [...S.scores], biome: S.env.biome, overlay: g.store.overlay };
  });

  expect(after.biome).toBe(before.biome);
  expect(after.round).toBe(before.round);
  expect(after.scores).toEqual(before.scores);
  expect(after.overlay).not.toBe('menu'); // it restored rather than showing the menu
  expect(cap.errors).toEqual([]);
});
