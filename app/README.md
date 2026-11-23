# Crater Club — React + TypeScript rebuild

A ground-up rewrite of Crater Club (originally a single hand-assembled `index.html`) into an
efficient, low-latency React + TypeScript app, with a pure, deterministic game engine and
thorough automated test coverage. Full feature parity with the original: 50 weapons, the
cellular terrain/fluid sim, 7 biomes × 5 times × 6 weather, 4 AI tiers, volleys/health modes,
teams, draft/random deal, the playground, and snapshot/resume.

## Commands

```
npm install
npm run dev          # Vite dev server
npm run build        # typecheck + production bundle → dist/
npm run build:single # one-file dist/index.html (JS+CSS inlined) for a server-less static deploy
npm run preview      # serve the built bundle
npm run typecheck    # tsc --noEmit (strict)
npm run test         # Vitest: pure-engine unit + integration tests
npm run test:e2e     # Playwright: match matrix, playground, human input, resume, perf probe
```

One-time Playwright setup: `npx playwright install chromium`.

CI runs typecheck + unit + e2e + build on every push/PR (`.github/workflows/ci.yml`).

### Extra tooling

- `node tests/visual/visual-diff.mjs` — screenshots the new build vs. the original root
  `index.html` across a biome/time/weather matrix and prints a per-combo pixel-diff metric
  (a gross-regression check; exact parity is impossible across independent RNG streams — see
  `tests/visual/README.md`).
- The e2e preview is built with `npm run build:e2e` (`vite build --mode e2e`), which is the
  only build that exposes the `window.__crater` test hook. A plain `npm run build` (production)
  omits it, so real deploys don't ship the hook.

## Architecture

The engine is **pure, DOM-free, and deterministic** (seeded PRNG); the browser layers plug into
it through injected bridges. React owns only the shell — the 120 Hz sim + canvas render path is
imperative, so there is no React re-render in the hot loop.

```
src/
  data/      typed content tables (weapons, biomes, times, weather, levels, shapes, options)
  engine/    pure engine — constants, rng, math, grid, sim, mapgen, color, types, bridge,
             and engine.ts (turns, firing, projectiles, impact, damage, tanks, AI, loop, save)
  render/    imperative canvas: terrain cache (shade), sprites + weapon icons, draw() scene
  audio/     WebAudio sfx (implements AudioBridge)
  game/      controller (owns engine + renderer + rAF loop + input + settings + resume bridge),
             store (useSyncExternalStore)
  ui/        React shell: App, Hud (score bar + dock), Menu, Draft, Picker, GameOver
tests/
  unit/      Vitest — data, rng, grid, sim, impact (per-weapon), match, resume
  e2e/       Playwright — matches A–G, playground, human, resume (FAST time-warp shim)
```

### Key decisions

- **Decoupling:** the engine calls `UIBridge` / `AudioBridge` / `Scheduler` instead of touching
  the DOM, canvas, WebAudio, or wall-clock timers. This is what lets a whole match run headless.
- **Seeded RNG:** all randomness draws from a per-match `Rng`; a seed reproduces a match. The
  seed is stored in the `v:5` snapshot.
- **Resume:** each turn's `v:5` grid-RLE snapshot is mirrored to `localStorage`, so the menu
  offers **Resume last match** after a reload or a trip back to the menu; the `window.claude.hot`
  (`snapshot`/`ready`/`data`) host bridge is also preserved and takes precedence on boot. The
  snapshot is cleared when a match ends. Exercised by `tests/e2e/resume.spec.ts`.
- **Self-hosted fonts:** Bowlby One + Bricolage Grotesque ship as local woff2 under
  `public/fonts/` (preloaded, `font-display: swap`), so the app makes **zero** external requests.
- **Perf:** particles use a freelist and the per-frame transient arrays (parts/puffs/booms/bolts/
  floats/projs) compact in place, cutting GC in heavy scenes. `tests/e2e/perf.spec.ts` logs a
  frame-time baseline (avg ~0.8 ms); it confirmed AI planning peaks at ~5 ms/frame, so the AI
  solver was left behavior-identical rather than perturbing match outcomes for no real gain.

The original vanilla game remains at the repo root (`index.html`, `src/*.js`) for side-by-side
parity comparison (see **Cleanup** in `todos.md` — its fate is the last open decision).
