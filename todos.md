# Crater Club — backlog

Follow-ups for the React + TypeScript rebuild (`app/`). The engine, renderer, audio, React shell,
and test suites are complete and green (`npm run typecheck`, `npm run test`, `npm run test:e2e`,
`npm run build`). Items below are improvements and parity hardening, roughly in priority order.

## Performance
- [ ] **AI `aiSolve` speed.** Each solve runs ~1,600 `simShot` trajectories (up to 2,400 steps
      each) per foe — real CPU that the e2e FAST shim can't compress (hence the 240s test timeout).
      Coarsen the search grid, cache per-foe solutions across a turn, early-out on a found hit, or
      move it to a Web Worker.
- [ ] Object-pool particles / bits / booms to cut per-frame GC in heavy scenes (dirty-rect terrain
      repaint is already in place).

## Parity hardening
- [ ] **Visual diff harness.** Screenshot the new renderer vs. the original `index.html` across
      biomes/times/weather and diff, to confirm pixel-level parity of `draw()` and `drawTank`.
- [ ] Audit the rarer weapon visuals end-to-end (parachute canopy, buzzsaw teeth, prism rays,
      black-hole swirl, smoke screens) against the original.
- [ ] Port `tests/perf.py` → a Playwright perf probe (frame-time avg/p95/max under load) with a
      budget asserted against a baseline measured on the old build.
- [ ] Targeted unit tests for `encore`/`mystery` resolution, `hiccup` off-line fire, lava burn at
      end of a tank's own turn, and health-mode resupply.

## Product / UX
- [ ] **Resume-match button** on the menu (persist the last `saveStable` snapshot to localStorage;
      today resume works only through the `window.claude.hot` host bridge).
- [ ] Persist the sound on/off choice in localStorage.
- [ ] Touch pass: verify drag-to-aim and the dock on phones/tablets; honor `viewport-fit` safe areas.
- [ ] Accessibility: focus order, aria labels on sliders/chips/tools (reduced-motion already wired).

## Build / infra
- [ ] **CI**: GitHub Actions running `typecheck`, `vitest run`, `playwright test`, and `vite build`
      (cache `node_modules` and the Playwright browser).
- [ ] Guard the `window.__crater` test hook behind `import.meta.env.DEV` (or keep intentionally for
      debugging and document it).
- [ ] Optional single-file output via `vite-plugin-singlefile` if a zero-dependency static deploy is
      wanted later (the original shipped as one `index.html`).
- [ ] Self-host or preload the Google Fonts (Bowlby One, Bricolage Grotesque) to avoid FOUT and the
      only external network request.

## Cleanup
- [ ] Decide the fate of the original vanilla game at the repo root. It's kept for side-by-side
      parity checks; once parity is signed off, either archive it or make `app/` the root.
