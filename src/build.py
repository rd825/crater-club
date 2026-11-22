"""Assemble index.html from the engine parts in this folder plus the page shell and shared pieces in base.html.

Run: python3 src/build.py
"""
import os, re, sys
V = os.path.dirname(os.path.abspath(__file__)) + os.sep
old = open(V + 'base.html').read()

def cut(a, b, src=old):
    i = src.index(a); j = src.index(b, i)
    return src[i:j]

def rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:70])
    return s.replace(a, b)

# ---------- page shell: styles and markup ----------
head = old[:old.index('<script>\n') + len('<script>\n')]
head = rep(head, 'An original artillery game for two to eight tanks, in the classic turn-based tradition.',
                 'An original artillery game for two to eight tanks, in the classic turn-based tradition,\n  played on ground you can dig, flood and rebuild.')
dock_a = head.index('<section class="dock" id="dock" aria-label="Controls">'); dock_b = head.index('</section>', dock_a) + len('</section>')
head = head[:dock_a] + '''<section class="dock" id="dock" aria-label="Controls">
  <div class="shape">
    <div class="lab"><strong>1. Shape the ground</strong><span id="shapeNote">One per turn, before you fire</span></div>
    <div class="toolrow">
      <button type="button" id="tool-dig">Dig</button>
      <button type="button" id="tool-burrow">Burrow</button>
      <button type="button" id="tool-wall">Wall</button>
      <button type="button" id="tool-bridge">Bridge</button>
    </div>
    <div class="driverow"><button type="button" id="mvL" aria-label="Drive left">◀</button><span id="fuel">2 moves left</span><button type="button" id="mvR" aria-label="Drive right">▶</button></div>
  </div>
  <div class="arsenal">
    <div class="lab"><strong id="arsenalLabel">Arsenal</strong><span id="wdesc"></span></div>
    <div class="chips" id="chips"></div>
    <div class="sandbar" id="sandbar" hidden><button type="button" id="btnAll">All 50 weapons</button><button type="button" id="btnNewMap">New map</button></div>
  </div>
  <div class="aim">
    <label for="angle">Angle <output id="angleOut" for="angle">60°</output></label>
    <div class="slide"><button type="button" id="angL" aria-label="Turn barrel left">◀</button><input type="range" id="angle" min="0" max="180" step="1" value="120"><button type="button" id="angR" aria-label="Turn barrel right">▶</button></div>
    <label for="power">Power <output id="powerOut" for="power">60</output></label>
    <div class="slide"><button type="button" id="powD" aria-label="Less power">−</button><input type="range" id="power" min="5" max="100" step="1" value="60"><button type="button" id="powU" aria-label="More power">+</button></div>
  </div>
  <div class="act">
    <button type="button" id="fire">Fire</button>
    <button type="button" id="cancelShot" hidden>Cancel</button>
  </div>
</section>''' + head[dock_b:]
head = rep(head, '.act{flex:1 1 190px;display:flex;gap:10px;align-items:stretch}',
 '''.shape{flex:1 1 250px;min-width:0;display:flex;flex-direction:column;gap:6px}
.toolrow{display:flex;flex-wrap:wrap;gap:6px}
.toolrow button{display:inline-flex;align-items:center;gap:5px;font-size:13px;padding:4px 10px 4px 7px}
.toolrow img{width:18px;height:18px;flex:none}
.driverow{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)}
.driverow button{padding:2px 10px;font-weight:700}
.act{flex:1 1 150px;display:flex;flex-direction:column;gap:6px}
#cancelShot{font-size:12px;padding:4px 8px}
.sandbar{display:flex;gap:6px}
.sandbar button{font-size:12px;padding:3px 10px}''')
head = rep(head, '.arsenal{flex:3 1 320px;', '.arsenal{flex:3 1 300px;')
head = rep(head, '.chips{display:flex;flex-wrap:wrap;gap:6px;max-height:74px;overflow-y:auto}', '.chips{display:flex;flex-wrap:wrap;gap:6px;max-height:78px;overflow-y:auto}')
head = rep(head, '<p class="lede">Tanks trade shots across ground that falls apart as you play.</p>',
                 '<p class="lede">Every turn you shape the ground, then fire across it. Dig tunnels, flood craters and bury your rivals.</p>')
head = rep(head, '''      <p><kbd>Space</kbd> arms the shot''', '''      <p>Each turn has two steps. First shape the ground if you want to: <kbd>Z</kbd> digs a tunnel along your barrel, <kbd>X</kbd> burrows into a foxhole, <kbd>C</kbd> builds a wall, <kbd>V</kbd> lays a bridge. Then fire.</p>
      <p>The ground is real material. Tunnels and overhangs hold, loose dirt pours and piles up, and water floods low ground and floats tanks. A tank that ends its own turn sitting in lava burns, so drive, dig or bridge your way out first. Water turns lava to stone.</p>
      <p><kbd>Space</kbd> arms the shot''')

head = rep(head, '<button type="button" class="ghost" id="btnResume" hidden>Resume match</button>',
                 '<button type="button" class="ghost" id="btnPlay">Playground</button>\n      <button type="button" class="ghost" id="btnResume" hidden>Resume match</button>')
head = rep(head, '<div class="overlay" id="over">', '''<div class="overlay" id="picker">
  <div class="sheet wide">
    <h2>All 50 weapons</h2>
    <p class="lede">Pick one to load it. Nothing runs out in the playground.</p>
    <div class="cards" id="pickCards"></div>
    <div class="go"><button type="button" class="ghost" id="btnPickClose">Close</button></div>
  </div>
</div>

<div class="overlay" id="over">''')
head = rep(head, '      <p>Free to copy and change under the MIT License.</p>',
                 '      <p>The playground gives you every weapon with nothing running out, targets that never shoot back, and free digging and driving. <kbd>W</kbd> opens the full weapon list there.</p>\n      <p>Free to copy and change under the MIT License.</p>')
# ---------- script: reused pieces ----------
draft = cut('/* ---------- draft ---------- */', '/* ---------- turn flow ---------- */')
sprites = cut('/* ---------- drawing ---------- */', 'function rr(x, y, w, h, r)')
sprites = rep(sprites, "  const out = {}; for (const k in D) out[k] = render(D[k]); return out;", '''  Object.assign(D, {
    dig:    i => i.ln(2, 21, 22, 21).w(3).ln(5, 17, 16, 7).w(1.7).col(A).poly(13, 3, 21, 3, 21, 11),
    burrow: i => i.ln(2, 8, 7, 8).ln(7, 8, 7, 20, 17, 20, 17, 8).ln(17, 8, 22, 8).col(A).ln(12, 2, 12, 13).poly(9.2, 12, 14.8, 12, 12, 16.5),
    wall:   i => i.col(A).box(8, 4, 8, 17).col(K).w(1).ln(8, 9, 16, 9).ln(8, 14, 16, 14).ln(12, 4, 12, 9).ln(10, 9, 10, 14).ln(14, 14, 14, 21).col(C).w(1.7).ln(2, 21, 22, 21),
    bridge: i => i.ln(5, 10, 5, 21).ln(19, 10, 19, 21).col(A).w(2.6).ln(2, 10, 22, 10).w(1.3).col(B).q(6, 20, 9, 17, 12, 20).q(12, 20, 15, 17, 18, 20),
  });
  const out = {}; for (const k in D) out[k] = render(D[k]); return out;''')
helpers = cut('function rr(x, y, w, h, r)', 'function draw() {')
tank = cut('function drawTank(t) {', '/* ---------- sound ---------- */')
tank = rep(tank, 'afloat = S.sea && t.y >= S.sea;', 'afloat = t.afloat;')
tank = rep(tank, 'const tilt = isBuried(t) || afloat ? 0 : clamp(Math.atan2(floorY(t.x + 9) - floorY(t.x - 9), 18), -0.6, 0.6);', 'const tilt = tiltOf(t);')
sound = cut('/* ---------- sound ---------- */', '/* ---------- interface ---------- */')
setup = cut('/* setup screen */', '/* sizing */')
tail = old[old.index('/* sizing */'):]
tail = rep(tail, 'data.v === 3 && data.h && data.tanks && data.env', 'data.v === 5 && data.grid && data.tanks && data.env')

part = lambda n: open(V + n).read()
js = (part('a_core.js') + part('b_world.js') + draft + part('c_play.js') + part('d_ai_loop.js') + sprites + helpers +
      part('e_draw.js') + tank + sound + part('f_ui.js') + setup)
out = head + js + tail
open(os.path.join(V, os.pardir, 'index.html'), 'w').write(out)
print('bytes', len(out), 'emdash', out.count('—'))
