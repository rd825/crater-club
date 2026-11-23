# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

Crater Club is a browser artillery game. This repository is the **React + TypeScript rebuild**: a
standard Vite project rooted here. It has a pure, DOM-free, deterministic game engine with a hybrid
render path (imperative canvas, React only for the shell) and thorough automated tests.

The original single-file vanilla game is **archived under [`legacy/`](legacy/)** (its own
`index.html`, `src/*.js` + `build.py`, Python tests, and a separate `CLAUDE.md`). It is not built
or shipped — it's kept for historical reference and side-by-side parity comparison. Don't edit it
for behavior changes; the live game is the React app at the root.

## Commands

```
npm install
npm run dev          # Vite dev server
npm run build        # typecheck + production bundle → dist/
npm run build:e2e    # production build with the __crater test hook exposed (used by Playwright)
npm run build:single # one-file dist/index.html (JS+CSS inlined) for a server-less static deploy
npm run preview      # serve the built bundle
npm run typecheck    # tsc --noEmit (strict)
npm run test         # Vitest: pure-engine unit + integration tests
npm run test:e2e     # Playwright: match matrix, playground, human input, resume, perf probe
```

One-time Playwright setup: `npx playwright install chromium`. CI runs typecheck + unit + e2e +
build on push/PR (`.github/workflows/ci.yml`).

## Architecture

The engine is **pure, DOM-free, and deterministic** (seeded PRNG); the browser layers plug into it
through injected bridges, which is what lets a whole match run headless. The 120 Hz sim + canvas
render loop is imperative — React never re-renders in the hot loop.

```
src/
  data/      typed content tables (weapons, biomes, times, weather, levels, shapes, options)
  engine/    pure engine — constants, rng, math, grid, sim, mapgen, color, types, bridge, and
             engine.ts: ONE Engine class = port of the vanilla c_play.js (turns, firing,
             projectiles, impact, damage, tanks, save/restore) + d_ai_loop.js (AI + sim loop) +
             b_world.js setup. Two module-level globals in the original (S = game, G = grid) are
             the engine's `S` / `G` fields.
  render/    imperative canvas: terrain.ts (shade cache), sprites.ts (+ weapon-icon DSL), draw.ts
  audio/     WebAudio sfx (implements AudioBridge)
  game/      controller.ts (owns engine + renderer + rAF loop + input + settings + resume),
             store.ts (useSyncExternalStore)
  ui/        React shell: App, Hud (score bar + dock), Menu, Draft, Picker, GameOver
tests/
  unit/      Vitest — data, rng, grid, sim, impact (per-weapon), match, mechanics, resume
  e2e/       Playwright — match matrix, playground, human, resume, perf (FAST time-warp shim)
  visual/    visual-diff.mjs — screenshots this build vs legacy/index.html; reporting tool
  helpers/   headless match harness (FakeClock + runMatch)
```

### Key points to know before editing

- **Decoupling:** the engine calls `UIBridge` / `AudioBridge` / `Scheduler` (`engine/bridge.ts`)
  instead of touching the DOM, canvas, WebAudio, or wall-clock timers. Keep it that way — tests
  pass silent stubs. Content/tuning changes go in the `data/` tables, not code paths.
- **Determinism:** all randomness draws from a per-match seeded `Rng`. A fixed seed reproduces a
  match (asserted by `tests/unit/match.test.ts`). When changing engine code, preserve the exact
  order of RNG draws, or you'll perturb every seeded match.
- **Snapshot format `v: 5`:** `saveStable()` captures a resumable turn snapshot (grid RLE + tanks).
  `controller.ts` mirrors it to `localStorage` (menu "Resume last match") and also honors the
  `window.claude.hot` host bridge on boot.
- **Test hook:** `window.__crater` (the controller) is exposed only in `vite dev` and the e2e build
  (`import.meta.env.DEV || import.meta.env.MODE === 'e2e'`), never in a plain production `vite
  build`. The e2e `webServer` builds with `npm run build:e2e`.
- **e2e timing:** Playwright uses a FAST time-warp shim; long multi-tank *health* matches are the
  slow part (match length, not AI CPU — the AI solver was profiled at ~5 ms/frame). The per-test
  timeout is 300s for that reason.
- **Rebuild/retest after engine changes:** `npm run typecheck && npm run test` is the fast gate;
  the per-weapon impact test + the determinism test catch most regressions.

## Build model

Plain Vite — no custom build step. Path aliases (`@engine`, `@data`, `@render`, `@game`) are in
`vite.config.ts` + `tsconfig.json`. `public/fonts/` holds the self-hosted woff2 fonts (zero
external requests). `vite build --mode single` swaps in `vite-plugin-singlefile`.
