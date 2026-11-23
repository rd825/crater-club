#!/usr/bin/env node
// Visual-diff harness: side-by-side screenshots of the ORIGINAL vanilla build
// (legacy/index.html, loaded via file://) and the NEW React build (served by a
// throwaway Vite dev server), across a small biome/time/weather matrix, plus a
// dependency-free pixel-difference metric computed inside the browser.
//
// This is a BASELINE / REPORTING tool, not a pass/fail gate: the two builds use
// independent RNG streams and timing, so exact pixel parity is impossible. The
// metric is meant to catch GROSS regressions (sky gradient, terrain palette,
// overall layout, tank sprites) — not to converge to zero. It always exits 0.
//
// Run from the repo root:   node tests/visual/visual-diff.mjs        (full matrix)
//                           node tests/visual/visual-diff.mjs 1      (first combo only)
// Env:  CHROME=/path/to/chrome   use an installed browser instead of Playwright's
//       VISUAL_PORT=5199         dev-server port (strict)
//       VISUAL_LIMIT=1           limit number of combos (same as the positional arg)

import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..', '..'); //       .../crater-club (repo root = the app)
const oldIndex = join(projectRoot, 'legacy', 'index.html'); // archived original vanilla build
const outDir = join(__dirname, 'out');

const PORT = Number(process.env.VISUAL_PORT || 5199);
const NEW_URL = `http://localhost:${PORT}/`;

// Small matrix chosen to vary sky gradient (time), palette (biome) and precip (weather).
const MATRIX = [
  { key: 'hills-noon-clear', biome: 'hills', time: 'noon', weather: 'clear' },
  { key: 'caldera-night-clear', biome: 'caldera', time: 'night', weather: 'clear' },
  { key: 'peaks-dawn-snow', biome: 'peaks', time: 'dawn', weather: 'snow' },
];
const limit = Number(process.env.VISUAL_LIMIT || process.argv[2] || MATRIX.length);
const combos = MATRIX.slice(0, Math.max(1, limit));

const VW = 1180, VH = 820; //          viewport (matches tests/matches.py)
const SEED = 1234; //                  fixed seed for the NEW build (old build is unseeded)
const THRESH = 32; //                  per-channel delta that counts a pixel as "different"
const DW = 640, DH = 320; //           common canvas size the diff resamples both shots to (2:1)

const log = (...a) => console.log(...a);

// ---------------------------------------------------------------- dev server
function startDevServer() {
  // Spawn the project's local Vite in dev mode (serves src/ directly, never touches dist/).
  const child = spawn('npx vite --port ' + PORT + ' --strictPort', {
    cwd: projectRoot,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  return child;
}

function killTree(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === 'win32') execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGTERM');
  } catch { /* best effort */ }
}

async function waitForServer(url, ms = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url, { method: 'GET' });
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ---------------------------------------------------------------- screenshots
async function captureField(page, path) {
  // Prefer the game canvas (isolates sky/terrain/sprites from surrounding chrome);
  // fall back to the full viewport if it is not present.
  try {
    const el = page.locator('#field').first();
    if (await el.count()) { await el.screenshot({ path }); return true; }
  } catch { /* fall through */ }
  await page.screenshot({ path });
  return true;
}

async function captureOld(browser, combo, path) {
  // The original build has no scripting hook, so drive its DOM setup screen the
  // same way tests/matches.py does: pick biome/time/weather, then Start.
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  try {
    await page.goto(pathToFileURL(oldIndex).href, { waitUntil: 'load' });
    await page.waitForSelector('#set-biome', { timeout: 15000 });
    const sel = async (id, val) => { try { await page.selectOption('#' + id, val); } catch { /* option may not exist */ } };
    await sel('set-mode', 'volleys');
    await sel('set-deal', 'random');
    await sel('set-biome', combo.biome);
    await sel('set-time', combo.time);
    await sel('set-weather', combo.weather);
    await sel('ptype-0', 'human'); //   human P0 keeps the match parked at the aim phase
    await sel('ptype-1', 'veteran');
    await page.click('#btnStart');
    await page.waitForTimeout(1600); // let the opening banner clear into a steady aim frame
  } catch (e) {
    log('   [old] setup/start failed, capturing whatever is on screen:', String(e).split('\n')[0]);
  }
  await captureField(page, path);
  await page.close();
}

async function captureNew(page, combo, path) {
  await page.evaluate(({ c, seed }) => {
    const g = window.__crater;
    g.engine.newGame(
      { mode: 'volleys', volleys: 3, health: 150, teams: 'ffa', deal: 'random', wind: 'calm', size: 'small',
        biome: c.biome, time: c.time, weather: c.weather, seed,
        players: [{ type: 'human' }, { type: 'veteran' }] },
      false,
    );
    g.store.overlay = null;
    g.store.bump();
  }, { c: combo, seed: SEED });
  await page.waitForTimeout(1400);
  await captureField(page, path);
}

// ---------------------------------------------------------------- diff metric
// Dependency-free: resample both PNGs to DWxDH on an in-browser canvas, read the
// pixels, and report (a) the fraction whose max per-channel delta exceeds THRESH
// and (b) the mean of that max-delta across all pixels.
async function diffMetric(page, oldPath, newPath) {
  if (!existsSync(oldPath) || !existsSync(newPath)) return null;
  const dataUrl = (p) => 'data:image/png;base64,' + readFileSync(p).toString('base64');
  return page.evaluate(
    async ({ a, b, DW, DH, THRESH }) => {
      const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const pixels = (im) => {
        const c = document.createElement('canvas'); c.width = DW; c.height = DH;
        const x = c.getContext('2d'); x.drawImage(im, 0, 0, DW, DH);
        return x.getImageData(0, 0, DW, DH).data;
      };
      const da = pixels(ia), db = pixels(ib), n = DW * DH;
      let over = 0, sum = 0;
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        const mx = Math.max(Math.abs(da[o] - db[o]), Math.abs(da[o + 1] - db[o + 1]), Math.abs(da[o + 2] - db[o + 2]));
        sum += mx; if (mx > THRESH) over++;
      }
      return { pct: +((100 * over) / n).toFixed(1), mean: +(sum / n).toFixed(1) };
    },
    { a: dataUrl(oldPath), b: dataUrl(newPath), DW, DH, THRESH },
  );
}

// ---------------------------------------------------------------- main
(async () => {
  mkdirSync(outDir, { recursive: true });
  log(`Visual-diff harness — ${combos.length} combo(s), out → ${outDir}`);

  const browser = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    args: ['--no-sandbox'],
  });

  // Bring up the new build's dev server (a few attempts before giving up).
  let dev = null, newOk = false;
  for (let attempt = 1; attempt <= 3 && !newOk; attempt++) {
    log(`Starting Vite dev server on ${PORT} (attempt ${attempt})...`);
    dev = startDevServer();
    newOk = await waitForServer(NEW_URL);
    if (!newOk) { killTree(dev); dev = null; }
  }

  let newPage = null;
  if (newOk) {
    log('Dev server ready.');
    newPage = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
    await newPage.goto(NEW_URL, { waitUntil: 'load' });
    try { await newPage.waitForFunction(() => !!window.__crater, null, { timeout: 15000 }); }
    catch { log('   [new] window.__crater never appeared; skipping new-build capture.'); newOk = false; }
  } else {
    log('Dev server did not come up. Falling back to OLD-build screenshots only.');
    log('To capture the new build, start it yourself (npm run dev) and re-run.');
  }

  const diffPage = await browser.newPage(); // blank page used only for the diff math
  const rows = [];

  for (const combo of combos) {
    log(`\n• ${combo.key}`);
    const oldPath = join(outDir, `${combo.key}-old.png`);
    const newPath = join(outDir, `${combo.key}-new.png`);

    try { await captureOld(browser, combo, oldPath); log(`   old → ${oldPath}`); }
    catch (e) { log('   old capture error:', String(e).split('\n')[0]); }

    if (newOk) {
      try { await captureNew(newPage, combo, newPath); log(`   new → ${newPath}`); }
      catch (e) { log('   new capture error:', String(e).split('\n')[0]); }
    }

    let metric = null;
    try { metric = await diffMetric(diffPage, oldPath, newPath); }
    catch (e) { log('   diff error:', String(e).split('\n')[0]); }
    rows.push({ combo: combo.key, metric });
  }

  // Summary table.
  log('\n================ SUMMARY ================');
  log('combo'.padEnd(24), '%different'.padStart(11), 'meanDelta'.padStart(11));
  for (const r of rows) {
    const pct = r.metric ? r.metric.pct + '%' : 'n/a';
    const mean = r.metric ? String(r.metric.mean) : 'n/a';
    log(r.combo.padEnd(24), pct.padStart(11), mean.padStart(11));
  }
  log('========================================');
  log('Note: high %different is EXPECTED (independent RNG/terrain). Open the paired');
  log('PNGs in out/ and eyeball sky gradient, palette, layout and tank sprites.');
  if (!newOk) log('New-build column is n/a: dev server unavailable (see message above).');

  await diffPage.close();
  if (newPage) await newPage.close();
  await browser.close();
  killTree(dev);
  process.exit(0);
})().catch((e) => {
  console.error('Fatal:', e);
  process.exit(0); // reporting tool: never fail the caller
});
