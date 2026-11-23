# Visual-diff harness

`visual-diff.mjs` captures paired screenshots of the **original** vanilla build
and the **new** React build across a small biome/time/weather matrix, then
prints a dependency-free pixel-difference metric for each pair.

It is a **baseline / reporting tool, not a pass/fail gate** — it always exits 0.

## What it does

1. Launches headless Chromium (Playwright's bundled browser, or `CHROME` if set;
   always with `--no-sandbox`).
2. **Original build** — loads the committed `index.html` at the repo root over
   `file://`, drives its DOM setup screen (`#set-biome` / `#set-time` /
   `#set-weather`, player 0 = human, then `#btnStart`) and screenshots the game
   canvas (`#field`).
3. **New build** — spawns the project's own Vite **dev** server on a throwaway
   port (`5199` by default, `--strictPort`, cwd `app/`, so it never collides with
   the e2e preview on `4173` and never writes to `app/dist`), waits for it, loads
   `http://localhost:5199/`, starts a match through the `window.__crater`
   controller hook (`engine.newGame({ biome, time, weather, seed, ... }, false)`)
   and screenshots the same `#field` canvas.
4. Writes each pair to `out/<combo>-old.png` and `out/<combo>-new.png`.
5. Computes the metric **in the browser**: both PNGs are resampled onto a
   640×320 canvas, `getImageData` is read back, and it reports
   - **%different** — fraction of pixels whose max per-channel delta exceeds 32, and
   - **meanDelta** — mean of that max per-channel delta over all pixels.
6. Prints a summary table.

No npm dependencies are added (no `pixelmatch`/`sharp`); the diff is plain canvas
math.

## How to run

From the `app/` directory:

```
node tests/visual/visual-diff.mjs        # full matrix
node tests/visual/visual-diff.mjs 1       # first combo only (quick smoke run)
```

Environment variables:

- `CHROME=/path/to/chrome` — use an installed browser instead of Playwright's.
- `VISUAL_PORT=5199` — dev-server port (strict).
- `VISUAL_LIMIT=1` — limit the number of combos (same as the positional arg).

Outputs land in `app/tests/visual/out/` (git-ignore this if you don't want the
PNGs committed).

## The RNG / timing caveat — read this before trusting a number

The two builds have **independent RNG streams and independent frame timing**, so
even with the same biome/time/weather the terrain shape, tank placement, wind and
animation phase differ. **Pixel-exact parity is impossible**, and a high
`%different` is normal and expected.

So don't chase the number to zero. Use the harness to catch **gross
regressions**, by opening the paired PNGs and eyeballing:

- **Sky** — gradient direction and colour stops; sun/moon orb; stars at night.
- **Terrain palette** — dirt/rock/turf/water/lava colours and the back-wall shade.
- **Weather** — rain streaks / snow / embers / fog present and roughly right.
- **Layout** — ground silhouette filling the canvas, horizon in the same band.
- **Tank sprites** — body, turret, barrel, treads read the same.

A combo jumping from (say) ~40% to ~95%, or a palette/layout that is obviously
wrong side-by-side, is the signal worth investigating.

## Fallback

If the Vite dev server fails to come up after three attempts, the harness still
runs: it captures the **original** build only, prints `n/a` in the new-build
column, and tells you to start the dev server yourself (`cd app && npm run dev`)
and re-run. The diff math works given any two PNG paths.
