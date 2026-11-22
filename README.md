# Crater Club

An artillery game for two to eight tanks, played in the browser on ground you can dig, flood and rebuild. Play with friends on one keyboard, against the computer, or alone in the playground.

## Play

Open `index.html` in any modern browser. There is nothing to install and no build step.

## What is in the box

- 50 weapons, drafted in turn or dealt at random
- Ground made of real material: tunnels and overhangs hold, loose dirt piles up, water and lava flow
- A shape step every turn: dig, burrow, wall or bridge, then fire
- Two ways to win: most damage after a set number of volleys, or last tank standing
- Computer opponents at four skill levels
- Seven terrains, four times of day, six kinds of weather
- A playground with every weapon unlimited and targets that never shoot back

## Controls

| Key | Action |
| --- | --- |
| Left and right arrows | Turn the barrel |
| Up and down arrows | Set power |
| Q, E | Switch weapon |
| A, D | Drive |
| Z, X, C, V | Dig, burrow, wall, bridge |
| Space | Arm the shot, then confirm |
| Esc | Cancel an armed shot |
| W | Open the full weapon list (playground) |

Hold Shift for bigger steps. You can also drag from your tank to aim.

## Deploy

The whole game is the single file `index.html`. Upload it to any static host, for example GitHub Pages, Netlify or itch.io. The only outside request it makes is to Google Fonts for two typefaces, and it falls back to system fonts without them.

## Change the game

`index.html` is built from the parts in `src/`. Edit those, then rebuild:

```
python3 src/build.py
```

| File | What it holds |
| --- | --- |
| `src/a_core.js` | Constants, the 50 weapons, terrains, weather, settings |
| `src/b_world.js` | The ground: cells, falling dirt, water and lava, map generation |
| `src/c_play.js` | Turns, shaping, projectiles, blasts, tank movement |
| `src/d_ai_loop.js` | Computer opponents and the main loop |
| `src/e_draw.js` | Drawing |
| `src/f_ui.js` | Buttons, keyboard, weapon picker |
| `src/base.html` | Page markup and styles, plus the draft, icons, sound and setup screen |

The scripts in `tests/` play the game in a headless browser at high speed and report any errors. They need Python with Playwright:

```
pip install playwright && playwright install chromium
python3 tests/matches.py "$PWD/index.html"
python3 tests/playground.py "$PWD/index.html"
```

Set `CHROME` to a browser path to use an installed Chrome.

## License

MIT. See `LICENSE`.
