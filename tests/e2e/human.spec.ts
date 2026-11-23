import { test, expect } from '@playwright/test';
import { FAST, startMatch, captureErrors } from './helpers.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Drives a human player through the real React dock (clicking Fire), proving the UI → engine path.
test('a human can play a match via the Fire button', async ({ page }) => {
  await page.addInitScript(FAST);
  const cap = captureErrors(page);
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__crater);

  // confirm off so a single Fire click shoots
  await page.evaluate(() => {
    const g = (window as any).__crater;
    g.settings = { ...g.settings, confirm: 'off' };
  });

  await startMatch(page, { players: [{ type: 'human' }, { type: 'regular' }], volleys: 4, biome: 'hills', time: 'noon', seed: 11 });

  const fireBtn = page.locator('.act .fire');
  for (let i = 0; i < 80; i++) {
    const done = await page.evaluate(() => (window as any).__crater.engine.S.phase === 'over');
    if (done) break;
    // when it's the human's turn, click Fire
    const human = await page.evaluate(() => (window as any).__crater.engine.canHuman());
    if (human) {
      await fireBtn.click({ timeout: 5000 }).catch(() => {});
      // wait for the shot to resolve back to someone's aim or game over
      await page.waitForFunction(() => {
        const S = (window as any).__crater.engine.S;
        return S.phase === 'over' || (S.phase === 'aim' && !(window as any).__crater.engine.canHuman()) || ((window as any).__crater.engine.canHuman());
      }, null, { timeout: 15_000 }).catch(() => {});
    } else {
      // AI turn: let it play out
      await page.waitForFunction(() => {
        const g = (window as any).__crater;
        return g.engine.S.phase === 'over' || g.engine.canHuman();
      }, null, { timeout: 20_000 }).catch(() => {});
    }
  }

  const phase = await page.evaluate(() => (window as any).__crater.engine.S.phase);
  expect(phase).toBe('over');
  expect(cap.errors).toEqual([]);
});
