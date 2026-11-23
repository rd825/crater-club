const sfxSplash = () => noise(0.45, 0.28, 2600, 500);
const sfxSizzle = () => noise(0.7, 0.16, 5200, 1800);

/* ---------- interface ---------- */
function closeOverlays() { for (const id of ['menu', 'draft', 'over', 'picker']) $(id).classList.remove('open'); }
function buildCards() {
  const box = $('seats'); box.textContent = '';
  for (const t of S.tanks) {
    const c = document.createElement('div'); c.className = 'pcard'; c.id = 'pc' + t.id; c.style.setProperty('--c', t.color);
    c.innerHTML = '<div class="who"><div class="pname"><span class="dot"></span><span></span></div><small id="ps' + t.id + '"></small></div><div class="pscore" id="sc' + t.id + '">0</div>' +
      (S.health ? '<div class="hpbar"><i id="hb' + t.id + '"></i></div>' : '');
    c.querySelector('.pname span:last-child').textContent = t.name;
    box.appendChild(c);
  }
  fit();
}
function updateScores() {
  for (const t of S.tanks) {
    const el = $('sc' + t.id); if (!el) continue;
    el.textContent = S.health ? Math.max(0, Math.ceil(t.hp)) : S.sandbox && t.isAI ? (S.taken[t.id] || 0) : S.scores[t.id];
    if (S.health) { $('hb' + t.id).style.width = clamp(100 * t.hp / S.cfg.health, 0, 100) + '%'; $('pc' + t.id).classList.toggle('dead', t.dead); }
  }
  $('teamline').innerHTML = S.teams && !S.health ? 'Left <b>' + teamTotal(0) + '</b> · Right <b>' + teamTotal(1) + '</b>' : '';
}
function paintArm() {
  $('fire').textContent = armed ? 'Confirm' : 'Fire'; $('fire').classList.toggle('armed', armed);
  $('cancelShot').hidden = !armed;
}
function unarm() { if (armed) { armed = false; paintArm(); } }
function syncAim() {
  const t = cur();
  $('angle').value = 180 - Math.round(t.angle); $('angleOut').textContent = aimText(t.angle);
  $('power').value = Math.round(t.power); $('powerOut').textContent = Math.round(t.power);
}
function syncUI() {
  if (!S) return;
  const t = cur(), n = S.cfg.volleys, live = S.phase === 'aim' || S.phase === 'flight';
  let humans = 0;
  for (const k of S.tanks) {
    const who = k.isAI ? (S.sandbox ? 'Target · damage taken' : LEVELS[k.level].label + ' computer') : 'Player ' + (++humans) + (S.sandbox ? ' · damage dealt' : '');
    $('ps' + k.id).textContent = k.dead ? 'Out' : S.health || S.sandbox ? who : who + ' · ' + S.shots[k.id] + ' left';
    $('pc' + k.id).classList.toggle('active', live && k === t);
  }
  updateScores();
  const shotNo = clamp(n - S.shots[t.id] + (S.phase === 'aim' ? 1 : 0), 1, n);
  $('round').innerHTML = S.phase === 'draft' ? 'Weapon draft' : S.phase === 'over' ? 'Final result' : S.sandbox ? 'Playground' : S.tracerRound ? 'Tracer round' : S.health ? 'Round <b>' + S.round + '</b>' : 'Volley <b>' + shotNo + '</b> of ' + n;
  const w = S.wind;
  $('wind').innerHTML = w === 0 ? 'No wind' : 'Wind <b>' + (w < 0 ? '← ' : '') + Math.abs(w) + (w > 0 ? ' →' : '') + '</b>';
  $('env').textContent = [S.pal.label, S.sky.label, S.env.weather === 'clear' ? '' : WEATHER[S.env.weather].label].filter(Boolean).join(' · ');
  const mine = canHuman();
  $('arsenalLabel').textContent = t.name + "'s arsenal"; $('arsenalLabel').style.color = t.color;
  const box = $('chips'); box.textContent = '';
  const tracer = S.tracerRound && S.phase !== 'draft';
  if (tracer) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.id = 'chip-tracer'; b.append(iconImg('tracer', 16), TRACER.name); b.setAttribute('aria-pressed', 'true'); b.disabled = !mine;
    box.appendChild(b);
  } else t.weapons.forEach((id, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.id = 'chip-' + i; b.append(iconImg(id, 16), chipName(t, id)); b.title = WEAPONS[id].desc;
    b.setAttribute('aria-pressed', i === t.sel ? 'true' : 'false'); b.disabled = !mine;
    b.addEventListener('click', () => { if (canHuman()) { armed = false; cur().sel = i; syncUI(); } });
    box.appendChild(b);
  });
  const selId = t.weapons[t.sel];
  $('wdesc').textContent = tracer ? TRACER.desc : selId ? WEAPONS[selId].desc : (S.phase === 'over' ? '' : 'No weapons left.');
  for (const id of ['angle', 'power', 'angL', 'angR', 'powD', 'powU', 'fire']) $(id).disabled = !mine;
  const bur = isBuried(t), canShape = mine && (!t.shaped || S.sandbox) && !tracer, free = S.sandbox;
  $('sandbar').hidden = !free;
  if (free) { const el = $('chip-' + t.sel); if (el) box.scrollTop = Math.max(0, el.offsetTop - box.offsetTop - 28); }
  for (const k in SHAPES) $('tool-' + k).disabled = !canShape;
  $('shapeNote').textContent = free ? 'As often as you like here' : tracer ? 'Opens after the tracer round' : t.shaped ? 'Done for this turn' : bur ? 'Buried: Dig gets you out' : 'One per turn, before you fire';
  $('mvL').disabled = $('mvR').disabled = !mine || (t.fuel <= 0 && !free) || bur;
  $('fuel').textContent = bur ? 'Buried' : free ? 'Free driving' : t.fuel + (t.fuel === 1 ? ' move left' : ' moves left');
  if (!mine) { armed = false; preview = null; }
  paintArm(); syncAim();
}
function nudge(dA, dP) { if (!canHuman()) return; unarm(); const t = cur(); t.angle = clamp(Math.round(t.angle) + dA, 0, 180); t.power = clamp(Math.round(t.power) + dP, 5, 100); syncAim(); }
function cycle(d) { if (!canHuman() || S.tracerRound) return; const t = cur(), n = t.weapons.length; if (n) { armed = false; t.sel = (t.sel + d + n) % n; syncUI(); } }
function drive(d) { if (!canHuman()) return; unarm(); if (startMove(cur(), d)) syncUI(); }
function shapeNow(tool) { if (!canHuman()) return; unarm(); doShape(cur(), tool); }
function pressFire() {
  wake(); if (!canHuman()) return;
  if (settings.confirm === 'off' || armed) fire();
  else { armed = true; sfxArm(); paintArm(); }
}

$('angle').addEventListener('input', e => { if (canHuman()) { unarm(); cur().angle = 180 - +e.target.value; syncAim(); } });
$('power').addEventListener('input', e => { if (canHuman()) { unarm(); cur().power = +e.target.value; syncAim(); } });
$('angL').addEventListener('click', () => nudge(1, 0)); $('angR').addEventListener('click', () => nudge(-1, 0));
$('powD').addEventListener('click', () => nudge(0, -1)); $('powU').addEventListener('click', () => nudge(0, 1));
$('mvL').addEventListener('click', () => drive(-1)); $('mvR').addEventListener('click', () => drive(1));
$('fire').addEventListener('click', pressFire);

/* playground: a grid of every weapon to pick from, and a fresh map on demand */
function openPicker() {
  if (!S || !S.sandbox || !canHuman()) return;
  const t = cur(), box = $('pickCards'); box.textContent = '';
  t.weapons.forEach((id, i) => {
    const w = WEAPONS[id], b = document.createElement('button');
    b.type = 'button'; b.className = 'card'; b.id = 'pick-' + id;
    if (i === t.sel) { b.dataset.by = t.id; b.style.setProperty('--c', t.color); }
    const nm = document.createElement('b'); nm.textContent = w.name;
    const ds = document.createElement('small'); ds.textContent = w.desc;
    b.append(iconImg(id, 32), nm, ds);
    b.addEventListener('click', () => { t.sel = i; closePicker(); });
    box.appendChild(b);
  });
  armed = false; paused = true; $('picker').classList.add('open');
}
function closePicker() { if (!$('picker').classList.contains('open')) return; $('picker').classList.remove('open'); paused = false; syncUI(); }
$('btnAll').addEventListener('click', openPicker);
$('btnPickClose').addEventListener('click', closePicker);
$('btnNewMap').addEventListener('click', () => { if (S && S.sandbox) newGame(S.cfg, false); });
$('btnPlay').addEventListener('click', () => { wake(); newGame(playCfg(), false); });
window.addEventListener('keydown', e => { if (e.key === 'Escape') closePicker(); });
$('cancelShot').addEventListener('click', unarm);
for (const k in SHAPES) {
  const b = $('tool-' + k);
  b.prepend(iconImg(k, 18)); b.title = SHAPES[k].desc + ' (' + SHAPES[k].key + ')';
  b.addEventListener('click', () => shapeNow(k));
  const show = () => { if (canHuman() && !cur().shaped) { preview = k; $('shapeNote').textContent = SHAPES[k].desc; } };
  const hide = () => { if (preview === k) { preview = null; if (S) syncUI(); } };
  b.addEventListener('pointerenter', show); b.addEventListener('focus', show);
  b.addEventListener('pointerleave', hide); b.addEventListener('blur', hide);
}

window.addEventListener('keydown', e => {
  if (!canHuman() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest && e.target.closest('.tools')) return;
  const big = e.shiftKey ? 5 : 1, k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  let used = true;
  if (k === 'ArrowLeft') nudge(big, 0); else if (k === 'ArrowRight') nudge(-big, 0);
  else if (k === 'ArrowUp') nudge(0, big); else if (k === 'ArrowDown') nudge(0, -big);
  else if (k === 'q' || k === '[') cycle(-1); else if (k === 'e' || k === ']') cycle(1);
  else if (k === 'a') drive(-1); else if (k === 'd') drive(1);
  else if (k === 'w') openPicker();
  else if (k === 'z') shapeNow('dig'); else if (k === 'x') shapeNow('burrow'); else if (k === 'c') shapeNow('wall'); else if (k === 'v') shapeNow('bridge');
  else if (k === ' ' || k === 'Enter') { if (!e.repeat) pressFire(); }
  else if (k === 'Escape') unarm();
  else used = false;
  if (used) e.preventDefault();
});
window.addEventListener('keyup', e => { if (e.key === ' ' && !(e.target.closest && e.target.closest('.tools, .overlay')) && S && !S.demo && !paused && (S.phase === 'aim' || S.phase === 'flight')) e.preventDefault(); });

/* drag to aim: only from the tank itself or from the ring at the end of the aim line, so a stray click cannot change the shot */
let dragging = false;
function worldPt(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
function nearHandle(e) {
  const q = worldPt(e), t = cur(), a = t.angle * Math.PI / 180, px = t.x, py = t.y - 12;
  return Math.hypot(q.x - px, q.y - py) < 70 || Math.hypot(q.x - (px + Math.cos(a) * t.power * 3.2), q.y - (py - Math.sin(a) * t.power * 3.2)) < 46;
}
function aimAt(e) {
  const q = worldPt(e), t = cur(), dx = q.x - t.x, dy = (t.y - 12) - q.y;
  let a = Math.atan2(dy, dx) * 180 / Math.PI; if (a < 0) a = dx < 0 ? 180 : 0;
  unarm(); t.angle = Math.round(clamp(a, 0, 180)); t.power = Math.round(clamp(Math.hypot(dx, dy) / 3.2, 5, 100)); syncAim();
}
cv.addEventListener('pointerdown', e => { if (!canHuman() || !nearHandle(e)) return; dragging = true; try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
cv.addEventListener('pointermove', e => { if (dragging && canHuman()) aimAt(e); else cv.style.cursor = canHuman() && nearHandle(e) ? 'grab' : 'default'; });
const endDrag = () => { dragging = false; };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

