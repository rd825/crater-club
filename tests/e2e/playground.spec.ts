import { test, expect } from '@playwright/test';
import { FAST, captureErrors } from './helpers.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */

test('every weapon fires in the playground', async ({ page }) => {
  await page.addInitScript(FAST);
  const cap = captureErrors(page);
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__crater);

  // boot the playground directly
  await page.evaluate(() => {
    const g = (window as any).__crater;
    g.engine.newGame(g.engine.playCfg(g.settings), false);
    g.store.overlay = null;
    g.store.bump();
  });

  const ids: string[] = await page.evaluate(() => {
    const eng = (window as any).__crater.engine;
    eng.S.tracerRound = false;
    return eng.S.tanks[eng.S.turn].weapons.slice();
  });
  expect(ids.length).toBe(50);

  let fired = 0;
  for (const id of ids) {
    await page.evaluate((wid) => {
      const eng = (window as any).__crater.engine;
      const me = eng.cur();
      const foe = eng.S.tanks.find((t: any) => t !== me) || me;
      eng.S.tracerRound = false;
      eng.S.phase = 'aim';
      eng.loadAndAim(wid, foe);
      eng.fire();
    }, id);
    await page.waitForFunction(() => (window as any).__crater.engine.S.phase === 'aim', null, { timeout: 20_000 });
    fired++;
  }

  expect(fired).toBe(50);
  expect(cap.errors).toEqual([]);
});
