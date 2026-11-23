# Crater Club — backlog

Follow-ups for the React + TypeScript rebuild (`app/`). All but the final cleanup decision are
done; `npm run typecheck`, `npm run test` (64 unit tests), `npm run test:e2e`, and `npm run build`
are green.

## Performance
- [x] **AI `aiSolve` speed — profiled; no behavior change shipped.** Both coarsening the search
      grid (3°→4°) and an early-out on the first hits were tried and **reverted**: they perturb
      match outcomes (which exact-hit solution is picked) for negligible gain. The perf probe shows
      AI-planning frames peak at **~5 ms** and are *not* the e2e bottleneck — match length is (the
      per-test timeout is bound by long health-mode matches, not solve CPU). If solve ever needs to
      come off the main thread, a Web Worker is the no-outcome-change path. Object pooling (below)
      is the real GC win that shipped.
- [x] Object-pool particles / bits / booms. `Part` freelist + in-place compaction of the per-frame
      transient arrays (parts/puffs/booms/bolts/floats/projs) — no per-frame array allocation.
      (`bits` already compacted in place in `stepBits`.)

## Parity hardening
- [x] **Visual diff harness.** `app/tests/visual/visual-diff.mjs` screenshots the new build vs. the
      original root `index.html` across a biome/time/weather matrix and prints a per-combo pixel
      diff. Gross-regression check (exact parity is impossible across independent RNG streams —
      documented in `app/tests/visual/README.md`).
- [x] Audit the rarer weapon visuals (parachute canopy, buzzsaw teeth, prism rays, black-hole
      swirl, smoke screens). Verdict: all five are faithful ports of the original `draw()` /
      sprites — no fixes needed.
- [x] Port `tests/perf.py` → `app/tests/e2e/perf.spec.ts` (frame-time avg/p95/max under an 8-tank
      load; logs a baseline and asserts generous CI-safe guardrails). Baseline on this machine:
      avg 0.8 ms, p95 1.1 ms, max 6.1 ms.
- [x] Targeted unit tests — `app/tests/unit/mechanics.test.ts`: `encore`/`mystery` resolution,
      `hiccup` off-line fire, lava burn at the end of a tank's own turn, health-mode resupply.

## Product / UX
- [x] **Resume-match button** on the menu. Each turn's `v:5` snapshot mirrors to `localStorage`;
      the menu offers "Resume last match" (and a Discard); cleared on game-over. The
      `window.claude.hot` host bridge still takes precedence on boot.
- [x] Persist the sound on/off choice in `localStorage`.
- [x] Touch pass: `touch-action: none` on the canvas (drag-to-aim never scrolls), `viewport-fit`
      safe-area insets, coarse-pointer tap targets (~44 px), no tap highlight.
- [x] Accessibility: `role="dialog"`/`aria-modal` overlays, `:focus-visible` rings, `aria-pressed`
      on weapon chips + sound, labelled aim sliders (reduced-motion already wired).

## Build / infra
- [x] **CI**: `.github/workflows/ci.yml` runs typecheck, vitest, playwright, and build on push/PR,
      caching npm + the Playwright browser.
- [x] Guard the `window.__crater` test hook: attached only in `vite dev` and the e2e build
      (`npm run build:e2e` / `vite build --mode e2e`), never in a production `vite build`.
- [x] Single-file output via `vite-plugin-singlefile`: `npm run build:single` → one
      `dist/index.html` (JS+CSS inlined; the two self-hosted woff2 fonts sit beside it).
- [x] Self-host the Google Fonts (Bowlby One, Bricolage Grotesque as a single variable file) under
      `app/public/fonts/`, preloaded — the app now makes **zero** external network requests.

## Cleanup
- [ ] **Decide the fate of the original vanilla game at the repo root** (`index.html`, `src/*.js`,
      `tests/*.py`). Kept for side-by-side parity checks, which are now automated (visual-diff
      harness + the weapon audit signed off parity). Options: (a) archive it under `legacy/`;
      (b) make `app/` the repo root and drop the vanilla copy; (c) keep as-is. This is a repo
      restructuring with irreversible moves, so it's left for an explicit decision rather than done
      unilaterally.
