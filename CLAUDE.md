# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Crater Club is a browser artillery game that ships as a **single self-contained file, `index.html`** (no runtime dependencies, no server; the only network request is to Google Fonts, with a system-font fallback). `index.html` is a **build artifact** — it is committed, but never edit it by hand. Edit the sources in `src/` and rebuild.

## Commands

```
python3 src/build.py          # assemble index.html from src/*.js + src/base.html
```

Tests drive the built `index.html` in headless Chromium via Playwright (one-time setup: `pip install playwright && playwright install chromium`). Rebuild before testing. Pass the absolute path to `index.html`:

```
python3 tests/matches.py   "$PWD/index.html"        # full matches across biomes/weather/modes; runs all scenarios
python3 tests/matches.py   "$PWD/index.html" C F     # only named scenarios (keys in RUNS)
python3 tests/playground.py "$PWD/index.html"        # fires every weapon once in the playground
python3 tests/resume.py    "$PWD/index.html"         # snapshot + reload mid-match, verify state restores
python3 tests/perf.py      "$PWD/index.html"         # frame-time stats under heavy load
```

Set `CHROME=/path/to/chrome` to use an installed browser instead of Playwright's. Tests pass when the printed error lists are empty and matches reach "over". `matches.py`/`playground.py` inject a time-warp shim (`FAST`) that shrinks timers so a match finishes in seconds; screenshots are written to `/tmp`.

## The build model (read before editing)

Everything runs inside **one IIFE in one shared scope** — no modules, imports, exports, or bundler. `src/a_core.js` opens `(() => { 'use strict';` and `src/base.html`'s tail closes it with `})()`. `build.py` is just ordered string concatenation plus surgical text patches. The pieces are glued in this fixed order:

```
head(base.html)                              ← page shell: <head>, CSS, body markup, up to first <script>
a_core.js  b_world.js  [draft]  c_play.js  d_ai_loop.js  [sprites+helpers]  e_draw.js  [drawTank]  [sound]  f_ui.js  [setup]
tail(base.html)                              ← /* sizing */ + boot
```

Bracketed pieces are **cut out of `src/base.html`** by `build.py` (see the `cut(...)` calls). So editing rules are:

- **Game engine** (constants, weapons, world/material sim, turns, projectiles, AI, main `draw()`, UI/input) → edit `src/*.js`.
- **Page shell, styles, and these specific fragments** — the draft screen, sprite/drawing helpers, `drawTank()`, sound, the setup screen, and sizing/boot — → edit `src/base.html`.
- **`src/base.html` also contains a complete older standalone copy of the engine** (its own turn-flow/world/AI sections and its own `draw()`/interface). `build.py` does **not** include those regions — they're superseded by `src/*.js`. Editing the engine inside `base.html` has no effect on the built game.

### `build.py` is fragile by design

`cut(a, b)` locates fragments by the exact `/* ---------- name ---------- */` section-comment markers and by exact function signatures (e.g. `function rr(x, y, w, h, r)`, `function draw() {`, `function drawTank(t) {`). `rep(s, a, b, n)` asserts the literal string `a` appears exactly `n` times before replacing it — these patches rewrite specific markup/CSS/boot strings and **bump the save-format version** (e.g. the inline snapshot check from `v === 3`/`data.h` to `v === 5`/`data.grid`).

Therefore: if you edit a marker comment, a cut function's signature, or any literal string that a `rep(...)` targets in `src/base.html`, **the build crashes with an AssertionError or ValueError**. When changing shell markup/CSS, check `src/build.py` first to see whether that exact text is a patch target, and update the patch string in lockstep.

## Engine architecture

Two module-level globals hold everything: **`S`** (the current game — tanks, projectiles, scores, environment, phase) and **`G`** (the ground grid). `cur()` is the active tank; `S.phase` is the turn state machine (`draft` → `aim` → `flight` → ...).

- **`a_core.js`** — constants, helpers, and the game's **data tables**: `WEAPONS` (50, each a `spec` of blast/damage/behavior flags), `SHAPES`, `LEVELS` (AI skill), `BIOMES`, `TIMES`, `WEATHER`, plus settings load/validate from `localStorage`. Add or tune content by editing these tables, not code paths.
- **`b_world.js`** — the ground is a **grid of 2px cells**, each a material (`AIR/DIRT/ROCK/LOOSE/WATER/LAVA/TURF/BUILT/STONE`; `SOLID[]` marks which block). Static dirt holds (tunnels/overhangs/caves persist); `LOOSE`, `WATER`, `LAVA` flow each step via `simStep()`/`levelWater()` until they settle, then the sim **sleeps** (`G.act` tracks the dirty box). Also map generation (`newGame`, `features`), `carve`/`deposit`, grid RLE `encodeGrid`/`decodeGrid`, and `shade`/`buildTables` (render caches).
- **`c_play.js`** — turn flow (`startAim`/`endTurn`/`gameOver`), ground shaping (`doShape`), firing and the projectile integrator (`fly`, `stepProj`), the big **`impact()`** dispatch (switches on weapon `spec.kind`/flags — this is where per-weapon effects live), damage/`explode`, tank movement, and snapshot save/restore (`saveStable`/`restore`, format `v: 5`).
- **`d_ai_loop.js`** — computer opponents and the frame loop. The AI aims by running the **same `fly()` integrator** as live play (`simShot`), so its predictions match real physics; `planAI` picks weapon and solves angle/power by skill level. `tick()` is the fixed-step sim (`DT = 1/120`), `frame()` the rAF driver (with slow-mo and a time accumulator).
- **`e_draw.js`** — the single `draw()` function (full-scene canvas render).
- **`f_ui.js`** — buttons, keyboard handlers, drag-to-aim, weapon picker.

### Resume / test hook

Boot reads an optional `window.claude.hot` bridge: `hot.snapshot(fn)` registers a state getter, `hot.ready(cb)`/`hot.data` supply a saved snapshot to restore on load. `tests/resume.py` stubs this to serialize mid-match and verify the game restores after reload. `saveStable()` captures a resumable snapshot at the start of each turn.
