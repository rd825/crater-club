# Crater Club — React + TypeScript rebuild

A ground-up rewrite of Crater Club (originally a single hand-assembled `index.html`) into an
efficient, low-latency React + TypeScript app, with a pure, deterministic game engine and
thorough automated test coverage. Full feature parity with the original: 50 weapons, the
cellular terrain/fluid sim, 7 biomes × 5 times × 6 weather, 4 AI tiers, volleys/health modes,
teams, draft/random deal, the playground, and snapshot/resume.

## Commands

```
npm install
npm run dev         # Vite dev server
npm run build       # typecheck + production bundle → dist/
npm run preview     # serve the built bundle
npm run typecheck   # tsc --noEmit (strict)
npm run test        # Vitest: pure-engine unit + integration tests
npm run test:e2e    # Playwright: full-match matrix, playground, human input, resume
```

One-time Playwright setup: `npx playwright install chromium`.

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
- **Resume bridge:** `window.claude.hot` (`snapshot`/`ready`/`data`) is preserved so the engine's
  `v:5` grid-RLE snapshot restores after reload — exercised by `tests/e2e/resume.spec.ts`.

The original vanilla game remains at the repo root (`index.html`, `src/*.js`) for side-by-side
parity comparison.
