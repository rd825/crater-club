import type { Page } from '@playwright/test';

/** The FAST time-warp shim (port of tests/matches.py:6-8): rAF → 0-delay timer advancing a
 *  fake clock +50ms/frame, and setTimeout compressed 12×, so a full match finishes in seconds. */
export const FAST = `
  let ft = 0; const st = window.setTimeout.bind(window);
  window.requestAnimationFrame = cb => st(() => { ft += 50; cb(ft); }, 0);
  window.setTimeout = (f, ms, ...a) => st(f, (ms || 0) / 12, ...a);
`;

export interface MatchConfigLike {
  players: { type: string }[];
  mode?: string; volleys?: number; health?: number; teams?: string; deal?: string;
  wind?: string; size?: string; biome?: string; time?: string; weather?: string; seed?: number;
}

/** Start a match directly through the exposed controller with a fixed config. */
export async function startMatch(page: Page, cfg: MatchConfigLike): Promise<void> {
  await page.evaluate((c) => {
    const g = (window as unknown as { __crater: { engine: { newGame: (cfg: unknown, demo: boolean) => void }; store: { overlay: unknown; bump: () => void } } }).__crater;
    g.engine.newGame({ mode: 'volleys', volleys: 3, health: 150, teams: 'ffa', deal: 'random', wind: 'calm', size: 'small', biome: 'hills', time: 'noon', weather: 'clear', ...c }, false);
    g.store.overlay = null;
    g.store.bump();
  }, cfg);
}

export async function phase(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { __crater: { engine: { S: { phase: string } } } }).__crater.engine.S.phase);
}

/** Wait until the match reaches game-over (phase 'over'), polling via the exposed engine. */
export async function waitForOver(page: Page, timeout = 60_000): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __crater: { engine: { S?: { phase: string } } } }).__crater?.engine?.S?.phase === 'over', null, { timeout, polling: 100 });
}

export interface ConsoleCapture { errors: string[] }

export function captureErrors(page: Page): ConsoleCapture {
  const cap: ConsoleCapture = { errors: [] };
  page.on('pageerror', (e) => cap.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') cap.errors.push(m.text()); });
  return cap;
}
