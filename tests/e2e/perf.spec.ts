/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';
import { startMatch, captureErrors } from './helpers.ts';

/**
 * Perf probe — port of the old Python tests/perf.py to the React build's e2e harness.
 *
 * It measures REAL requestAnimationFrame frame durations (the synchronous cost of each
 * frame callback: engine.advance + renderer.draw) under a heavy, realistic scene. It must
 * NOT use the FAST shim: FAST replaces rAF with a 0-delay timer and compresses setTimeout
 * 12×, which is for finishing matches fast and destroys real frame timing.
 *
 * The measurement HOOK (ported from perf.py lines 4-5) wraps rAF so each frame records
 * performance.now() delta around the callback, and is installed via addInitScript BEFORE
 * page.goto so it wraps rAF before the controller's loop starts.
 */

// Ported from perf.py's HOOK: record the synchronous cost of each rAF callback into window.__ft.
const PERF_HOOK = `
  window.__ft = [];
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(t => { const a = performance.now(); cb(t); window.__ft.push(performance.now() - a); });
`;

test('renders a heavy 8-tank scene within frame budget', async ({ page }) => {
  // Real frames run at ~60fps; 12s of load plus warm-up needs plenty of headroom.
  test.setTimeout(120_000);

  // 1. Install the rAF measurement hook before anything loads, and capture page/console errors.
  await page.addInitScript(PERF_HOOK);
  const cap = captureErrors(page);

  // 2. Boot and wait for the controller hook.
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__crater);

  // 3. Start the heaviest realistic scene: 8 AI veterans, large map, busy weather, long match.
  //    (Mirrors perf.py's 'islands'/'storm'/8-tanks/'large' stress row.)
  await startMatch(page, {
    players: Array.from({ length: 8 }, () => ({ type: 'veteran' })),
    mode: 'volleys',
    volleys: 4,
    deal: 'random',
    teams: 'ffa',
    size: 'large',
    biome: 'islands',
    time: 'noon',
    weather: 'meteors',
    wind: 'breeze',
    seed: 12345,
  });

  // 4. Drop boot/startup frames: let it warm up ~1s of real time, then clear the sample buffer.
  await page.waitForTimeout(1000);
  await page.evaluate(() => { (window as any).__ft.length = 0; });

  // 5. Run under load for a fixed real-time window (12s of real rAF frames; well under the test timeout).
  await page.waitForTimeout(12000);

  // 6. Collect stats (port of perf.py's `stats`): count, avg, p95, max over sorted frame durations.
  const r = await page.evaluate(() => {
    const a: number[] = ((window as any).__ft as number[]).slice();
    a.sort((x, y) => x - y);
    const n = a.length;
    if (!n) return { frames: 0, avg: 0, p95: 0, max: 0 };
    return {
      frames: n,
      avg: a.reduce((s, v) => s + v, 0) / n,
      p95: a[Math.floor(n * 0.95)],
      max: a[n - 1],
    };
  });
  const { frames, avg, p95, max } = r;

  // 7. Log a readable line so the baseline shows up in the Playwright `list` reporter output.
  console.log(
    `perf: 8 veterans, islands/meteors, large — frames ${frames}  avg ${avg.toFixed(1)} ms  p95 ${p95.toFixed(1)} ms  max ${max.toFixed(1)} ms`,
  );

  // 8. Assertions — intentionally LENIENT and CI-safe. CI hardware varies wildly, so these are
  //    generous guardrails that catch gross regressions (a stalled or runaway frame loop), NOT
  //    tight performance budgets. The intended tight baseline: the old build targeted well under
  //    one 60fps frame (16.7 ms) average on a dev machine. If a future machine/CI baseline is
  //    reliably fast, tighten `avg`/`p95` toward that 16.7 ms target.
  expect(cap.errors).toEqual([]);
  expect(frames).toBeGreaterThan(50); // it actually rendered many real frames
  expect(avg).toBeLessThan(25); // generous: ~1.5× a 60fps frame budget
  expect(p95).toBeLessThan(60); // generous: allows occasional heavy frames under weather/sim load
});
