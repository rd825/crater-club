/* ---------- turn flow ---------- */
function later(g, ms, fn, phase) { setTimeout(() => { if (S === g && g.phase === (phase || 'aim')) fn(); }, ms); }
function startAim() {
  S.phase = 'aim'; S.settleT = 0; S.aiPlan = null; armed = false; preview = null;
  const t = cur(); t.shaped = false; t.fuel = 2;   // two short drives and one shape action every turn
  if (S.health && !t.weapons.length) { t.weapons = shuffle(WEAPON_IDS.slice()).slice(0, ARSENAL); t.sel = 0; floatText(t, 'resupplied', t.color); }
  t.sel = clamp(t.sel, 0, Math.max(0, t.weapons.length - 1));
  S.banner = S.sandbox ? (S.shotDmg > 0 ? { text: S.shotDmg + ' damage', t: 0, c: t.color } : null) : { text: (t.isAI ? t.name + ' takes aim' : t.name + "'s turn"), t: 0, c: t.color };
  syncUI(); saveStable();
  if (t.isAI) planAI();
}
function endTurn() {
  S.traces[S.turn] = S.curTrace; S.curTrace = []; cur().hitLast = 0;
  const n = S.tanks.length, prev = S.turn;
  if (S.sandbox) {   // the playground never ends: the turn goes to the next player, or straight back to you
    for (const m of S.smokes) m.turns--;
    S.smokes = S.smokes.filter(m => m.turns > 0);
    for (let i = 1; i <= n; i++) { const k = (prev + i) % n; if (!S.tanks[k].isAI) { S.turn = k; break; } }
    S.round++; rollWind(true); startAim(); return;
  }
  if (S.tracerRound) {   // everyone gets one free ranging volley, then the match starts from the first tank with the same wind
    if (prev + 1 < n) S.turn = prev + 1; else { S.tracerRound = false; S.turn = 0; }
    startAim(); return;
  }
  for (const m of S.smokes) m.turns--;
  S.smokes = S.smokes.filter(m => m.turns > 0);
  if (S.health ? new Set(S.live.map(t => S.teamOf[t.id])).size <= 1 : S.shots.every(v => v === 0)) return gameOver();
  let next = -1;
  for (let i = 1; i <= n; i++) { const k = (prev + i) % n; if (!S.tanks[k].dead && (S.health || S.shots[k] > 0)) { next = k; break; } }
  if (next < 0) return gameOver();
  S.turn = next; if (next <= prev) S.round++;
  rollWind(next <= prev); startAim();
}
function hazard() {
  S.hazardDone = true;
  const w = S.env.weather;
  if (w === 'storm' && Math.random() < 0.4) {
    const x = rand(40, W - 40), y = surfaceY(x);
    bolt(x + rand(-90, 90), -10, x, y, '#ffffff'); S.flash = 1;
    explode(x, y, 38, 18, -1); sfxThunder(); return true;
  }
  if (w === 'meteors' && Math.random() < 0.55) {
    const n = 1 + (Math.random() * 3 | 0);
    for (let i = 0; i < n; i++) after(i * 0.25, () => spawn({ x: rand(80, W - 80), y: -30, vx: rand(-130, 130), vy: rand(160, 240), owner: -1, age: 1, r: 36, dmg: 18 }));
    return true;
  }
  return false;
}
const teamTotal = k => S.tanks.reduce((n, t) => n + (S.teamOf[t.id] === k ? S.scores[t.id] : 0), 0);
const teamNames = k => listNames(S.tanks.filter(t => S.teamOf[t.id] === k).map(t => t.name));
function gameOver() {
  S.phase = 'over'; stable = {}; armed = false; syncUI();
  const g = S;
  if (g.demo) { setTimeout(() => { if (S === g) newGame(demoCfg(), true); }, 2600); return; }
  let order, title, color = '';
  if (g.health) {
    order = g.tanks.slice().sort((a, b) => (a.dead - b.dead) || (b.hp - a.hp) || (g.scores[b.id] - g.scores[a.id]));
    if (!g.live.length) title = 'Nobody is left standing';
    else if (g.teams) { const k = g.teamOf[g.live[0].id]; title = teamNames(k) + ' win'; color = g.live[0].color; }
    else { title = g.live[0].name + ' wins'; color = g.live[0].color; }
  } else {
    order = g.tanks.slice().sort((a, b) => g.scores[b.id] - g.scores[a.id]);
    if (g.teams) {
      const a = teamTotal(0), b = teamTotal(1);
      if (a === b) title = 'Dead heat';
      else { const k = a > b ? 0 : 1; title = teamNames(k) + ' win ' + Math.max(a, b) + ' to ' + Math.min(a, b); color = g.tanks.find(t => g.teamOf[t.id] === k).color; }
    } else if (g.scores[order[0].id] === g.scores[order[1].id]) title = 'Dead heat';
    else { title = order[0].name + ' wins'; color = order[0].color; }
  }
  $('overTitle').textContent = title; $('overTitle').style.color = color;
  const box = $('finals'); box.textContent = '';
  for (const t of order) {
    const row = document.createElement('div'); row.style.setProperty('--c', t.color);
    const nm = document.createElement('b'); nm.textContent = t.name;
    const sm = document.createElement('small'); sm.textContent = (t.isAI ? 'computer' : 'player') + (g.health ? ' · ' + g.scores[t.id] + ' damage dealt' : '');
    nm.appendChild(sm);
    const sc = document.createElement('span'); sc.textContent = g.health ? (t.dead ? 'out' : Math.ceil(t.hp)) : g.scores[t.id];
    row.append(nm, sc); box.appendChild(row);
  }
  setTimeout(() => { if (S === g) $('over').classList.add('open'); }, 900);
}
function saveStable() {
  if (S.demo) { stable = {}; return; }
  stable = { v: 5, cfg: S.cfg, env: S.env, tracer: S.tracerRound, marks: S.marks, grid: encodeGrid(), scores: S.scores.slice(), turn: S.turn, round: S.round,
    shots: S.shots.slice(), wind: S.wind, props: S.props, bombs: S.bombs, smokes: S.smokes, lastId: S.lastId,
    tanks: S.tanks.map(t => ({ x: t.x, y: t.y, angle: t.angle, power: t.power, weapons: t.weapons.slice(), sel: t.sel, fuel: t.fuel, hp: t.hp, dead: t.dead, shield: t.shield, hiccup: t.hiccup })) };
}
function restore(d) {
  W = d.env.W || REF;
  S = baseGame(d.cfg, false, d.env); paused = false; armed = false; S.tracerRound = !!d.tracer;
  mkGrid(); decodeGrid(d.grid); G.act = [0, 0, G.cols - 1, G.rows - 1];
  S.scores = d.scores; S.turn = d.turn; S.round = d.round || 1; S.shots = d.shots; S.wind = d.wind; S.props = d.props || [];
  S.bombs = d.bombs || []; S.smokes = d.smokes || []; S.lastId = d.lastId || null;
  S.tanks = d.tanks.map((t, i) => Object.assign(mkTank(i, t.x, d.cfg.players[i].type, d.cfg.health), t));
  S.live = S.tanks.filter(t => !t.dead);
  S.traces = S.tanks.map(() => null); S.marks = S.tanks.map((t, i) => d.marks && Array.isArray(d.marks[i]) ? d.marks[i] : null);
  buildTables(); shade(0, 0, G.cols - 1, G.rows - 1);
  closeOverlays(); buildCards(); startAim();
}
function playCfg() {   // playground setup: the players from the setup screen, at least two targets, the chosen battlefield
  const humans = settings.players.filter(p => p.type === 'human').map(() => ({ type: 'human' }));
  if (!humans.length) humans.push({ type: 'human' });
  const targets = clamp(Math.max(2, settings.players.length - humans.length), 0, MAXP - humans.length);
  return { sandbox: true, players: humans.concat(Array.from({ length: targets }, () => ({ type: 'target' }))), mode: 'volleys', volleys: 99, health: 150, teams: 'ffa', deal: 'random',
    wind: settings.wind, size: settings.size, biome: settings.biome, time: settings.time, weather: settings.weather };
}
const demoCfg = () => ({ players: [{ type: 'veteran' }, { type: 'regular' }, { type: 'ace' }, { type: 'regular' }], mode: 'volleys', volleys: 5, health: 150, teams: 'ffa', deal: 'random',
  wind: 'breeze', size: 'medium', biome: 'random', time: 'random', weather: 'random' });

/* ---------- shaping the ground: one action a turn, before the shot ---------- */
const facing = t => t.angle <= 90 ? 1 : -1;
function shapeBox(t, tool) {   // where a wall or bridge would go, so the preview and the build agree
  const d = facing(t);
  if (tool === 'wall') { const x0 = t.x + d * 26, f = Math.min(t.y + 60, solidBelow(x0 + d * 6, t.y - 30)); return [Math.min(x0, x0 + d * 12), f - 46, Math.max(x0, x0 + d * 12), f + 1]; }
  if (tool === 'bridge') return [Math.min(t.x + d * 14, t.x + d * 132), t.y, Math.max(t.x + d * 14, t.x + d * 132), t.y + 5];
  return [t.x - 17, t.y, t.x + 17, t.y + 46];   // burrow
}
function doShape(t, tool) {
  if ((t.shaped && !S.sandbox) || S.phase !== 'aim' || S.tracerRound || t.moveLeft > 0) return false;
  if (tool === 'dig') {
    const a = t.angle * Math.PI / 180;
    for (let s = 0; s <= 104; s += 6) carve(t.x + Math.cos(a) * s, t.y - 9 - Math.sin(a) * s, 11, 0.1);
  } else {
    const b = shapeBox(t, tool);
    if (tool === 'burrow') fillCells(b[0], b[1], b[2], b[3], AIR, () => true);
    else fillCells(b[0], b[1], b[2], b[3], BUILT, notSolid);
  }
  t.shaped = !S.sandbox; preview = null;
  for (const k of S.tanks) k.rangeN = 0;
  S.puffs.length < 60 && smokePuff(t.x, t.y - 8, 12, false);
  sfxThud(); syncUI(); return true;
}

/* ---------- firing and projectiles ---------- */
function launch(t, ang, pw, spec) {
  const a = ang * Math.PI / 180, sp = spec.straight ? 900 : pw * S.vel;
  return Object.assign({ x: t.x + Math.cos(a) * 18, y: t.y - 12 - Math.sin(a) * 18, vx: Math.cos(a) * sp, vy: -Math.sin(a) * sp,
    owner: t.id, age: 0, trail: [] }, spec);
}
function spawn(p, primary) { p.primary = !!primary; if (!p.trail) p.trail = []; S.projs.push(p); return p; }
function after(delay, fn) { S.events.push({ t: S.time + delay, fn }); }
function fire() {
  if (!S || S.phase !== 'aim') return;
  const t = cur(); if (t.moveLeft > 0 || !t.weapons.length) return;
  armed = false; preview = null; S.burnDone = false; S.flowT = 0;
  if (S.tracerRound) {
    S.phase = 'flight'; S.settleT = 0; S.curTrace = []; S.aiPlan = null; S.hazardDone = true; S.burnDone = true;
    S.marks[t.id] = []; t.recoil = 1;
    const up = facing(t);   // offsets are in the degrees shown on the angle readout: plus raises the barrel
    for (const d of TRACER.fan) spawn(launch(t, clamp(t.angle + d * up, 0, 180), t.power, Object.assign({ lab: d }, TRACER.spec)), d === 0);
    sfxPop(); S.banner = { text: 'Tracer', t: 0.5, c: t.color }; syncUI(); return;
  }
  S.marks[t.id] = null;
  for (const b of S.bombs) b.fuse--;
  let id = S.sandbox ? t.weapons[t.sel] : t.weapons.splice(t.sel, 1)[0], via = '';   // nothing runs out in the playground
  S.shotDmg = 0;
  if (id === 'mystery') { via = 'Mystery Box: '; id = t.pending || pickOne(MYSTERY_POOL); }
  if (id === 'encore') { via = 'Encore: '; id = S.lastId || 'shell'; }
  t.pending = null; S.lastId = id;
  const w = WEAPONS[id], sp = w.spec;
  t.sel = clamp(t.sel, 0, Math.max(0, t.weapons.length - 1));
  if (!S.health && !S.sandbox) S.shots[t.id]--;
  S.phase = 'flight'; S.settleT = 0; S.curTrace = []; S.aiPlan = null; S.hazardDone = false;
  let off = 0;
  if (t.hiccup) { t.hiccup = false; off = rand(6, 13) * (Math.random() < 0.5 ? -1 : 1); floatText(t, 'hic!', '#a6e86a'); }
  if (sp.self === 'bags') {
    for (const d of [-1, 1]) { const x0 = t.x + d * 34, f = Math.min(t.y + 60, solidBelow(x0 + d * 6, t.y - 30)); fillCells(Math.min(x0, x0 + d * 12), f - 52, Math.max(x0, x0 + d * 12), f + 1, BUILT, notSolid); smokePuff(x0, f - 20, 14, false); }
    sfxThud();
  } else if (sp.self === 'bubble') {
    t.shield = 35; S.booms.push({ x: t.x, y: t.y - 8, r: 26, t: 0, c: '#bfe8ff', soft: true }); sfxPop();
  } else if (sp.self === 'lift') {   // a plateau rises under the tank: fill every column from the new height down to whatever is solid
    const ny = Math.max(80, t.y - 70), g = G.g, cols = G.cols, rows = G.rows, r0 = Math.round(ny / CELL);
    for (let c = Math.max(0, ((t.x - 32) / CELL) | 0); c <= Math.min(cols - 1, ((t.x + 32) / CELL) | 0); c++)
      for (let r = r0; r < rows - 5 && !SOLID[g[r * cols + c]]; r++) g[r * cols + c] = r < r0 + 3 ? TURF : DIRT;
    touch(((t.x - 34) / CELL) | 0, r0 - 1, ((t.x + 34) / CELL) | 0, rows - 1);
    t.y = r0 * CELL; debris(t.x, t.y + 30, 44, S.pal.dust); sfxThud();
    for (const k of S.tanks) k.rangeN = 0;
  } else {
    const shoot = first => {
      if (t.dead) return;
      const j = off + (first ? 0 : rand(-1, 1) * (w.jitter || 0));
      const ma = (t.angle + j) * Math.PI / 180, mx = t.x + Math.cos(ma) * 24, my = t.y - 12.5 - Math.sin(ma) * 24;
      S.booms.push({ x: mx, y: my, r: 12, t: 0.3, c: '#fff1c4', soft: true }); smokePuff(mx, my, 9, false); t.recoil = 1;
      if (w.fan) w.fan.forEach(o => spawn(launch(t, t.angle + j + o, t.power, sp), first && o === w.fan[w.fan.length >> 1]));
      else if (w.pellets) for (let i = 0; i < w.pellets; i++) spawn(launch(t, t.angle + j + (i ? rand(-5, 5) : 0), t.power * (i ? rand(0.94, 1.06) : 1), sp), i === 0);
      else spawn(launch(t, t.angle + j, t.power, sp), first);
      sfxFire();
    };
    shoot(true);
    for (let i = 1; i < (w.repeat || 1); i++) after(i * w.gap, () => shoot(false));
  }
  S.banner = { text: via + w.name, t: 0.5, c: t.color };
  syncUI();
}
function fly(p, spec, wind, g) {   // shared by the live game and the computer's aiming, so both agree exactly
  const pvy = p.vy;
  if (!spec.straight) { p.vy += g * DT; p.vx += wind * DT; }
  if (pvy < 0 && p.vy >= 0) { if (spec.boom) p.vx = -p.vx; if (spec.plumb) p.vx = 0; }
  if (spec.chute && p.vy > 0) { if (p.vy > 75) p.vy = 75; p.vx += wind * 2 * DT; p.vx *= 1 - 0.8 * DT; }
  p.x += p.vx * DT; p.y += p.vy * DT;
  if (spec.walls) { if (p.x < 0 && p.vx < 0) { p.x = -p.x; p.vx *= -0.9; } else if (p.x > W && p.vx > 0) { p.x = 2 * W - p.x; p.vx *= -0.9; } }
}
function hitAt(x, y, age, owner, safeAll) {
  if (x < -150 || x > W + 150 || y > H + 50 || y < -1500) return OOB;
  for (const k of S.live) {
    if (safeAll ? age < 0.35 : (k.id === owner && age < 0.25)) continue;
    const dx = x - k.x, dy = y - (k.y - 7);
    if (dx * dx + dy * dy < 144) return k;
  }
  if (x >= 0 && x < W && y >= 0) {
    const t = y >= H ? ROCK : G.g[((y / CELL) | 0) * G.cols + ((x / CELL) | 0)];
    if (SOLID[t]) return GROUND;
    if (t !== AIR) return LIQ;
  }
  return null;
}
function normalAt(x, y) {   // which way the ground faces at a point, from where the solid cells around it are
  let nx = 0, ny = 0;
  for (let a = 0; a < 8; a++) { const dx = Math.cos(a * 0.7854), dy = Math.sin(a * 0.7854); if (solidAt(x + dx * 7, y + dy * 7)) { nx -= dx; ny -= dy; } }
  const l = Math.hypot(nx, ny);
  return l < 0.01 ? [0, -1] : [nx / l, ny / l];
}
function stepProj(p) {
  p.age += DT;
  if (p.rolling) return rollStep(p);
  if (p.moling) return moleStep(p);
  if (p.seek) return seekStep(p);
  const pvy = p.vy;
  if (p.homing && p.vy > 0) {
    const k = nearestRival(p.owner, p.x), dx = k ? k.x - p.x : 1e9;
    if (Math.abs(dx) < 320 && Math.abs(dx) > 4) p.vx = clamp(p.vx + Math.sign(dx) * 340 * DT, -440, 440);
  }
  fly(p, p, S.wind, S.g);
  if (p.primary && S.tickN % 4 === 0) S.curTrace.push(p.x, p.y);
  if (p.split && pvy < 0 && p.vy >= 0) {
    p.dead = true; S.booms.push({ x: p.x, y: p.y, r: 20, t: 0, c: colorOf(p.owner), soft: true });
    for (const o of [-95, -57, -19, 19, 57, 95]) spawn({ x: p.x, y: p.y, vx: p.vx + o, vy: p.vy, owner: p.owner, age: p.age, r: p.r, dmg: p.dmg }, o === 19);
    sfxPop(); return;
  }
  if (p.burst && p.vy > 0 && p.age > 0.3 && p.x >= 0 && p.x < W && floorBelow(p.x, Math.max(0, p.y)) - p.y < 70) {
    p.dead = true; S.booms.push({ x: p.x, y: p.y, r: 22, t: 0, c: colorOf(p.owner), soft: true });
    for (let i = -4; i <= 4; i++) spawn({ x: p.x, y: p.y, vx: p.vx * 0.35 + i * 38, vy: Math.max(130, p.vy * 0.5), owner: p.owner, age: 1, r: p.r, dmg: p.dmg });
    sfxPop(); return;
  }
  let hit = hitAt(p.x, p.y, p.age, p.owner, p.safeAll);
  if (hit === OOB) { p.dead = true; return; }
  if (p.ghost && (hit === GROUND || hit === LIQ)) hit = null;
  if (hit === GROUND && p.bore > 0) {   // boring rounds chew through a set length of ground before they stop
    carve(p.x, p.y, p.boreR || 5, 0.2); p.bore -= Math.hypot(p.vx, p.vy) * DT; return;
  }
  if (p.pierceT > 0) {             // underground: only a tank stops it early
    p.pierceT -= DT; carve(p.x, p.y, 7, 0.15);
    if (hit && hit !== GROUND && hit !== LIQ) impact(p, hit);
    else if (p.pierceT <= 0) { p.dead = true; explode(p.x, p.y, p.r, p.dmg, p.owner); }
    return;
  }
  if (hit) impact(p, hit);
}
function rollStep(p) {
  p.rollT += DT;
  const f0 = floorBelow(clamp(p.x - 3, 0, W - 1), p.y - 8), f1 = floorBelow(clamp(p.x + 3, 0, W - 1), p.y - 8), slope = clamp((f1 - f0) / 6, -2.5, 2.5);
  p.rv += slope * 520 * DT; p.rv *= 1 - (S.env.weather === 'snow' ? 2.4 : 0.6) * DT;
  const nx = p.x + p.rv * DT, dir = Math.sign(p.rv) || 1;
  if (nx < 2 || nx > W - 3) { p.dead = true; return; }
  if (solidAt(nx + dir * 4, p.y - 7)) p.rv *= -0.4; else p.x = nx;
  const f = floorBelow(p.x, p.y - 8);
  if (liquidAt(p.x, f + 1)) { p.dead = true; explode(p.x, f, p.r, p.dmg, p.owner); return; }
  p.y = f - 3 < p.y ? f - 3 : Math.min(f - 3, p.y + 340 * DT);
  for (const k of S.live) {
    if (Math.abs(p.x - k.x) < 13 && Math.abs(p.y - (k.y - 7)) < 14) { p.dead = true; explode(k.x, k.y - 7, p.r, p.dmg, p.owner); return; }
  }
  if (p.rollT > (p.life || 4) || (p.rollT > 0.6 && Math.abs(p.rv) < 6 && p.y >= f - 4)) { p.dead = true; explode(p.x, p.y, p.r, p.dmg, p.owner); }
}
function moleStep(p) {   // the Mole tunnels level through the ground; the Buzzsaw rides the surface and cuts whatever is in front
  const saw = p.kind === 'saw';
  p.moleT += DT; p.x += p.dir * (saw ? 200 : 230) * DT;
  if (p.x < 3 || p.x > W - 4) { p.dead = true; return; }
  if (saw) {
    if (solidAt(p.x + p.dir * 6, p.y - 6)) carve(p.x + p.dir * 6, p.y - 4, 12, 0.3);   // wall ahead: cut through it
    else { const f = floorBelow(clamp(p.x + p.dir * 14, 0, W - 1), p.y - 14); p.y = f - 4 < p.y ? f - 4 : Math.min(f - 4, p.y + 300 * DT); }   // ride the uncut ground just ahead
    if (S.tickN % 2 === 0) carve(p.x - p.dir * 2, p.y + 8, 11, 0.35);
  } else {
    if (p.y < p.deep) p.y = Math.min(p.deep, p.y + 130 * DT);
    carve(p.x, p.y, 8, 0.12);
  }
  if (liquidAt(p.x + p.dir * 4, p.y)) { p.dead = true; explode(p.x, p.y, saw ? 20 : p.r, saw ? 10 : p.dmg, p.owner); return; }
  if (S.tickN % 4 === 0 && S.parts.length < 420) S.parts.push({ x: p.x, y: saw ? p.y : surfaceY(p.x), vx: rand(-30, 30) - p.dir * 40, vy: -rand(40, 120), t: 0, life: 0.4, c: saw ? '#ffe9a8' : S.pal.dust, s: 2.5, spark: saw });
  for (const k of S.live) {
    if (k.id === p.owner && p.moleT < 0.3) continue;
    if (Math.abs(p.x - k.x) < (saw ? 13 : 8) && Math.abs(p.y - (k.y - 6)) < (saw ? 20 : 46)) { p.dead = true; explode(saw ? k.x : p.x, saw ? k.y - 6 : Math.min(p.y, k.y + 14), p.r, p.dmg, p.owner); return; }
  }
  if (p.moleT > (saw ? 1.6 : 1.3)) { p.dead = true; explode(p.x, p.y, saw ? 20 : p.r, saw ? 10 : p.dmg, p.owner); }
}
function seekStep(p) {   // hornets: steer toward the nearest rival with a wobble; any ground stops them
  p.life -= DT;
  let tg = null, bd = 1e9;
  for (const k of S.live) if (!sameTeam(k.id, p.owner)) { const d = Math.hypot(k.x - p.x, k.y - 7 - p.y); if (d < bd) { bd = d; tg = k; } }
  if (tg) { let da = Math.atan2(tg.y - 7 - p.y, tg.x - p.x) - p.ang; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; p.ang += clamp(da, -3.4 * DT, 3.4 * DT); }
  const a = p.ang + Math.sin(p.age * 13 + p.ph) * 0.6;
  p.x += Math.cos(a) * p.sp * DT; p.y += Math.sin(a) * p.sp * DT;
  const hit = hitAt(p.x, p.y, p.age, p.owner, true);
  if (hit === OOB || p.life <= 0) { p.dead = true; return; }
  if (!hit) return;
  p.dead = true;
  if (hit !== GROUND && hit !== LIQ) explode(hit.x, hit.y - 7, p.r, p.dmg, p.owner, true);
}
function impact(p, hit) {
  const tank = hit !== GROUND && hit !== LIQ ? hit : null, wet = hit === LIQ;
  const x = tank ? tank.x : p.x, y = tank ? tank.y - 7 : p.y, o = p.owner;
  if (p.tracer) {
    p.dead = true; (S.marks[o] || (S.marks[o] = [])).push({ x, y: tank ? tank.y : y, lab: p.lab });
    debris(x, y, 6, colorOf(o)); if (p.lab === 0) sfxPop();
    if (tank && !sameTeam(tank.id, o)) S.floats.push({ x: tank.x, y: tank.y - 40 - (S.floats.length % 3) * 18, t: 0, text: offsetLabel(p.lab) + ' on target', c: colorOf(o) });
    return;
  }
  if (!tank) {
    if (p.skip > 0 || (p.bounce > 0 && !wet) || (p.hops > 0 && !wet)) {
      const n = wet ? [0, -1] : normalAt(p.x, p.y), dot = p.vx * n[0] + p.vy * n[1];
      if (p.bounce > 0) { explode(x, y, p.r, p.dmg, o); p.bounce--; p.r += p.grow || 0; p.dmg += 2; }
      else if (p.hops > 0) { explode(x, y, 18, 6, o); p.hops--; }
      else { p.skip--; if (wet) debris(x, y, 12, WATERC); else carve(x, y, 16, 0.5); sfxPop(); }
      if (p.hops != null && !p.skip && !p.bounce) {   // the Frog aims each hop at the nearest rival
        const k = nearestRival(o, p.x), dx = k ? k.x - p.x : 0;
        p.vx = clamp(dx * 0.6, -80, 80); p.vy = -0.83 * S.g;
      } else {
        const e = p.skip != null ? 0.74 : 0.62;
        if (dot < 0) { p.vx -= 2 * dot * n[0]; p.vy -= 2 * dot * n[1]; }
        p.vx *= e; p.vy *= e; if (p.vy > -130) p.vy = -130;
      }
      p.x += n[0] * 5; p.y += n[1] * 5; p.age = 1; return;
    }
    if (!wet) {
      if (p.roll) { p.rolling = true; p.rollT = 0; p.rv = clamp(p.vx * 0.6, -280, 280); p.y = floorBelow(p.x, p.y - 8) - 3; return; }
      if (p.pierce && !p.pierced) { p.pierced = true; p.pierceT = 0.2; p.vx *= 0.6; p.vy *= 0.6; return; }
      if (p.kind === 'mole' || p.kind === 'saw') { p.moling = true; p.moleT = 0; p.dir = Math.sign(p.vx) || 1; p.deep = p.y + 26; if (p.kind === 'saw') p.y -= 4; return; }
    }
  }
  p.dead = true;
  const boom = () => explode(x, y, p.r, p.dmg, o, p.ghost);
  const lightning = (bx, r, d) => { const by = surfaceY(bx); bolt(bx + rand(-60, 60), -10, bx, by, '#ffffff'); S.flash = Math.max(S.flash, 0.6); explode(bx, by, r, d, o); sfxThunder(); };
  switch (p.kind) {
    case 'drill':   // a shaft straight down, then a cave at the bottom
      if (wet) { boom(); break; }
      for (let i = 0; i < 14; i++) after(i * 0.07, () => explode(x, y + i * 15, 11, 5, o));
      after(14 * 0.07 + 0.12, () => explode(x, Math.min(H - 30, y + 14 * 15), p.r, p.dmg, o));
      break;
    case 'dirt':   // a mass of loose dirt appears overhead and pours down
      blob(x, Math.max(40, y - 74), 50, 46, LOOSE, t => t === AIR); debris(x, y - 60, 40, S.pal.dust); sfxThud();
      break;
    case 'strike':
      boom();
      for (let i = -3; i <= 3; i++) after(0.3 + (i + 3) * 0.11, () => spawn({ x: clamp(x + i * 38 + rand(-8, 8), 4, W - 4), y: -20, vx: 0, vy: 300, owner: o, age: 1, r: 34, dmg: 15 }));
      break;
    case 'fountain':
      boom();
      for (let i = 0; i < 8; i++) spawn({ x, y: y - 8, vx: rand(-150, 150), vy: -rand(260, 420), owner: o, age: 0, safeAll: true, r: 28, dmg: 11 });
      break;
    case 'cracker': {
      const dir = Math.sign(p.vx) || 1;
      for (let i = 0; i < 7; i++) after(i * 0.1, () => { const ex = clamp(x + dir * i * 34, 0, W - 1); explode(ex, i === 0 ? y : floorBelow(ex, Math.max(0, y - 60)), p.r, p.dmg, o); });
      break;
    }
    case 'sauce': {   // real lava: it lands, runs downhill and pools
      boom();
      const n = S.precip === 'rain' ? 80 : 140;
      for (let i = 0; i < n; i++) S.bits.push({ x: x + rand(-6, 6), y: y - 6 - rand(0, 10), vx: rand(-110, 110), vy: -rand(60, 240), t: LAVA });
      sfxSizzle();
      break;
    }
    case 'sink':   // the ground under it goes away
      blob(x, y + 14, 92, 62, AIR, () => true); explode(x, y, p.r, p.dmg, o, true); sfxThud();
      break;
    case 'thump':
      explode(x, y, p.r, p.dmg, o, true);
      for (const k of S.live) {
        const d = Math.abs(k.x - x);
        if (d < 180 && !isBuried(k)) { k.moveDir = k.x >= x ? 1 : -1; k.moveLeft = Math.max(k.moveLeft, 14 + 46 * (1 - d / 180)); S.traces[k.id] = null; }
      }
      for (const k of S.tanks) k.rangeN = 0;
      break;
    case 'level': {   // every column in reach is cut or filled toward the average height
      const g = G.g, cols = G.cols, rows = G.rows, c0 = Math.max(0, ((x - 150) / CELL) | 0), c1 = Math.min(cols - 1, ((x + 150) / CELL) | 0), tops = [];
      let s = 0;
      for (let c = c0; c <= c1; c++) { let r = 0; while (r < rows && !SOLID[g[r * cols + c]]) r++; tops.push(r); s += r; }
      const avg = s / tops.length;
      for (let c = c0; c <= c1; c++) {
        const top = tops[c - c0], k = 0.9 * (0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, Math.abs(c * CELL - x) / 150))), tgt = Math.round(top + (avg - top) * k);
        if (top < tgt) { for (let r = top; r < tgt; r++) if (g[r * cols + c] !== ROCK) g[r * cols + c] = AIR; }
        else for (let r = tgt; r < top && r < rows - 5; r++) g[r * cols + c] = DIRT;
      }
      touch(c0 - 1, 0, c1 + 1, rows - 1);
      explode(x, y, p.r, p.dmg, o, true); sfxThud();
      break;
    }
    case 'arc': {   // the spark jumps twice, each time to the nearest tank it has not touched
      boom();
      const done = new Set([o]); if (tank) done.add(tank.id);
      let fx = x, fy = y;
      for (let j = 0; j < 2; j++) {
        let best = null, bd = 380;
        for (const k of S.live) { if (done.has(k.id)) continue; const d = Math.hypot(k.x - fx, k.y - 7 - fy); if (d < bd && d > 20) { bd = d; best = k; } }
        if (!best) break;
        done.add(best.id);
        const ax = fx, ay = fy, amt = j ? 10 : 14; fx = best.x; fy = best.y - 7;
        after(0.16 + j * 0.2, () => { if (best.dead) return; bolt(ax, ay, best.x, best.y - 7, '#bfe8ff'); hurt(best, amt, o); sfxZap(); });
      }
      break;
    }
    case 'steal':
      if (tank && !sameTeam(tank.id, o)) {
        const me = S.tanks[o];
        if (S.health) { if (!me.dead) { me.hp = Math.min(S.cfg.health, me.hp + 15); floatText(me, '+15', me.color); } hurt(tank, 15, o); }
        else { S.scores[tank.id] -= 15; S.scores[o] += 15; S.floats.push({ x: tank.x, y: tank.y - 52, t: 0, text: '15 swiped', c: colorOf(o) }); updateScores(); }
      }
      boom();
      break;
    case 'hop': {
      const me = S.tanks[o]; if (me.dead) break;
      S.booms.push({ x: me.x, y: me.y - 7, r: 26, t: 0, c: me.color, soft: true });
      if (tank && tank !== me) { [me.x, tank.x] = [tank.x, me.x]; [me.y, tank.y] = [tank.y, me.y]; S.traces[tank.id] = null; }
      else if (!tank) {
        let nx = clamp(x, 20, W - 20);
        for (const k of S.live) if (k !== me && Math.abs(nx - k.x) < 30) nx = clamp(k.x + (nx >= k.x ? 32 : -32), 20, W - 20);
        carve(nx, y - 8, 15, 0);   // it arrives with a pop that clears room to stand
        me.x = nx; me.y = y - 6; me.vy = 0;
      }
      S.booms.push({ x: me.x, y: me.y - 7, r: 26, t: 0, c: me.color, soft: true });
      for (const k of S.tanks) k.rangeN = 0;
      S.traces[o] = null; sfxPop();
      break;
    }
    case 'hole':
      S.holes.push({ x, y: y - 6, t: 0, owner: o, r: p.r, dmg: p.dmg }); sfxZap();
      break;
    case 'swarm':
      boom();
      for (let i = 0; i < 8; i++) spawn({ x, y: y - 10, vx: 0, vy: 0, seek: true, ang: -Math.PI / 2 + rand(-1.2, 1.2), sp: rand(135, 170), life: rand(2.4, 3.1), ph: rand(0, 6.28), owner: o, age: 0, r: 14, dmg: 5 });
      break;
    case 'hiccup':
      boom(); S.booms.push({ x, y, r: 70, t: 0, c: '#a6e86a', soft: true });
      for (const k of S.live) if (Math.hypot(k.x - x, k.y - 7 - y) < 72) { k.hiccup = true; floatText(k, 'hic!', '#a6e86a'); }
      break;
    case 'geyser':   // real water erupts, floods the hole and throws whoever is on top of it
      boom();
      for (const k of S.live) if (Math.abs(k.x - x) < 44 && Math.abs(k.y - 7 - y) < 54 && !isBuried(k)) {
        k.y -= 3; k.vy = -rand(320, 390); k.moveDir = Math.abs(k.x - x) < 2 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(k.x - x); k.moveLeft = rand(60, 110); S.traces[k.id] = null;
      }
      for (const k of S.tanks) k.rangeN = 0;
      for (let j = 0; j < 5; j++) after(j * 0.09, () => { for (let i = 0; i < 46; i++) S.bits.push({ x: x + rand(-8, 8), y: y - 4 - rand(0, 8), vx: rand(-70, 70), vy: -rand(220, 520), t: WATER }); });
      sfxSplash();
      break;
    case 'thunder':
      boom();
      for (let i = 0; i < 4; i++) after(0.3 + i * 0.3, () => lightning(clamp(x + rand(-125, 125), 6, W - 6), 34, 15));
      break;
    case 'smoke':
      S.smokes.push({ x, y: y - 34, r: 150, turns: S.live.length * 2, puffs: Array.from({ length: 16 }, () => ({ dx: rand(-120, 120), dy: rand(-50, 34), w: rand(170, 260), h: rand(100, 150) })) });
      sfxThud();
      break;
    case 'prism': {   // nine rays fan down from a point above the impact and burn into whatever they reach
      const ex = x, ey = Math.max(30, y - 90);
      S.booms.push({ x: ex, y: ey, r: 18, t: 0, c: colorOf(o), soft: true }); sfxZap();
      for (let i = 0; i < 9; i++) after(0.25 + i * 0.06, () => {
        const a = (200 + i * 140 / 8) * Math.PI / 180, cx = Math.cos(a), cy = -Math.sin(a);
        let rx = ex, ry = ey, ht = null;
        for (let d = 0; d < 480 && !ht; d += 4) { rx += cx * 4; ry += cy * 4; ht = hitAt(rx, ry, 1, -1, false); }
        bolt(ex, ey, rx, ry, colorOf(o), true);
        if (ht && ht !== OOB) { const tk = ht !== GROUND && ht !== LIQ ? ht : null; explode(tk ? tk.x : rx + cx * 6, tk ? tk.y - 7 : ry + cy * 6, p.r, p.dmg, o); }
      });
      break;
    }
    case 'sticky':
      S.bombs.push({ x, y, tank: tank ? tank.id : -1, fuse: 1, owner: o, r: p.r, dmg: p.dmg }); sfxPop();
      break;
    default: boom();
  }
}
function drama(x, y) {   // a beat of slow motion and a push in on the big moments
  if (reduced || S.time < S.dramaAt) return;
  S.slowT = 0.55; S.zx = clamp(x, W * 0.2, W * 0.8); S.zy = clamp(y, H * 0.3, H * 0.8); S.dramaAt = S.time + 1.2;
}
function kill(k) {
  if (k.dead) return;
  k.dead = true; k.hp = 0; k.shield = 0; k.moveLeft = 0; S.live = S.tanks.filter(t => !t.dead); S.marks[k.id] = null;
  S.booms.push({ x: k.x, y: k.y - 7, r: 60, t: 0, c: k.color }); debris(k.x, k.y - 7, 70, k.color); debris(k.x, k.y - 7, 50, '#3a3340');
  for (let i = 0; i < 6; i++) smokePuff(k.x + rand(-14, 14), k.y - 10 - rand(0, 16), rand(12, 22), true);
  S.floats.push({ x: k.x, y: k.y - 56, t: 0, text: k.name + ' is out', c: k.color });
  S.shake = Math.min(18, S.shake + 9); S.flash = Math.max(S.flash, 0.5); sfxBoom(90); drama(k.x, k.y);
}
function hurt(k, amt, owner) {
  if (k.dead) return;
  amt = Math.max(1, Math.round(amt));
  if (k.shield > 0) { const a = Math.min(k.shield, amt); k.shield -= a; amt -= a; floatText(k, 'blocked', '#bfe8ff'); if (amt <= 0) return; }
  k.hitLast += amt;
  if (amt >= 30) drama(k.x, k.y - 10);
  const friendly = owner >= 0 && sameTeam(k.id, owner);
  if (owner >= 0 && !friendly) S.shotDmg += amt;
  S.taken[k.id] = (S.taken[k.id] || 0) + amt;
  if (S.health) {
    k.hp -= amt; if (owner >= 0 && !friendly) S.scores[owner] += amt;
    floatText(k, '−' + amt, k.color);
    if (k.hp <= 0) kill(k);
  } else {
    const who = owner < 0 ? k.id : owner, gain = owner >= 0 && !friendly;
    S.scores[who] += gain ? amt : -amt;
    floatText(k, (gain ? '+' : '−') + amt, S.tanks[who].color);
  }
  updateScores();
}
function explode(x, y, r, dmg, owner, noCarve) {
  const wet = liquidAt(x, y) || liquidAt(x, y + 4);
  if (!noCarve) carve(x, y, r, 0.3, r >= 20);
  if (dmg > 0) for (const k of S.live) {
    const d = Math.hypot(x - k.x, y - (k.y - 7)), reach = r + 12;
    if (d < reach) hurt(k, dmg * (1 - Math.pow(d / reach, 1.5)), owner);
  }
  S.booms.push({ x, y, r, t: 0, c: colorOf(owner) });
  debris(x, y, r, wet ? WATERC : S.pal.dust);
  for (let i = 0, n = clamp(r / 10 | 0, 2, 9); i < n; i++) smokePuff(x + rand(-r, r) * 0.5, y + rand(-r, r) * 0.3, rand(0.3, 0.6) * r + 6, !wet);
  if (!wet) for (let i = 0, n = Math.min(22, r / 3 | 0); i < n && S.parts.length < 480; i++) {
    const a = rand(Math.PI, 2 * Math.PI), sp = rand(120, 200 + r * 4);
    S.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: rand(0.25, 0.7), c: '#ffd98a', s: 1.6, spark: true });
  }
  if (r >= 40) S.flash = Math.max(S.flash, Math.min(0.7, r / 160));
  S.shake = Math.min(18, S.shake + r * 0.14);
  if (r >= 76) drama(x, y);
  if (wet) sfxSplash(); sfxBoom(r);
}
function smokePuff(x, y, r, dark) { if (S.puffs.length < 90) S.puffs.push({ x, y, vx: rand(-14, 14), vy: -rand(12, 32), t: 0, life: rand(0.9, 1.9), r, dark }); }
function debris(x, y, r, c) {
  const n = Math.min(18, 4 + r / 5 | 0);
  for (let i = 0; i < n && S.parts.length < 480; i++) {
    const a = rand(Math.PI, 2 * Math.PI), s = rand(40, 60 + r * 3);
    S.parts.push({ x: x + rand(-r, r) * 0.4, y: y + rand(-r, r) * 0.3, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rand(0.4, 1), c, s: rand(1.5, 3.5) });
  }
}
function bolt(x0, y0, x1, y1, c, straight) {
  const n = straight ? 1 : Math.max(4, Math.hypot(x1 - x0, y1 - y0) / 26 | 0), pts = [x0, y0];
  for (let i = 1; i < n; i++) pts.push(lerp(x0, x1, i / n) + rand(-12, 12), lerp(y0, y1, i / n) + rand(-8, 8));
  pts.push(x1, y1); S.bolts.push({ pts, t: 0, c });
}

/* ---------- tanks ---------- */
const isBuried = t => solidAt(t.x, t.y - 9);
function solidFloor(x, y) { let f = 1e9; for (const d of [-8, 0, 8]) { const v = solidBelow(x + d, y - 9); if (v < f) f = v; } return f; }
function restY(t) {   // where this tank comes to rest: on solid ground, or afloat when the liquid over that ground is deep enough to carry it
  const f = solidFloor(t.x, t.y), g = G.g, cols = G.cols, c = clamp((t.x / CELL) | 0, 0, cols - 1), rEnd = Math.min(G.rows - 1, (f / CELL) | 0);
  const wet = k => { const v = g[k * cols + c]; return v === WATER || v === LAVA; };
  let r = clamp(((t.y - 6) / CELL) | 0, 0, G.rows - 1);
  if (wet(r)) { for (let up = 0; r > 0 && up < 30 && wet(r - 1); up++) r--; } else while (r < rEnd && !wet(r)) r++;
  let n = 0; while (r + n < rEnd && wet(r + n)) n++;
  t.afloat = n >= 5;   // a film of rain or a trickle does not lift a tank
  return t.afloat ? Math.min(f, r * CELL + 4) : f;
}
function tiltOf(t) { return isBuried(t) || t.afloat || t.falling ? 0 : clamp(Math.atan2(solidBelow(t.x + 9, t.y - 9) - solidBelow(t.x - 9, t.y - 9), 18), -0.6, 0.6); }
function inLava(t) { for (const dx of [-9, 0, 9]) for (const dy of [-3, 1]) if (cellAt(clamp(t.x + dx, 0, W - 1), t.y + dy) === LAVA) return true; return false; }
function startMove(t, dir) {
  if ((t.fuel <= 0 && !S.sandbox) || t.moveLeft > 0 || isBuried(t)) return false;
  if (!S.sandbox) t.fuel--;
  t.moveLeft = 40; t.moveDir = dir;
  for (const k of S.tanks) k.rangeN = 0;
  S.traces[t.id] = null;
  return true;
}
function stepTank(t) {
  if (t.moveLeft > 0) {
    const step = Math.min(t.moveLeft, 70 * DT), nx = t.x + t.moveDir * step;
    const blocked = S.live.some(o => o !== t && Math.abs(nx - o.x) < 30 && Math.abs(nx - o.x) < Math.abs(t.x - o.x));
    if (nx < 20 || nx > W - 20 || blocked || isBuried(t) || solidAt(nx + t.moveDir * 9, t.y - 10)) { t.moveLeft = 0; syncUI(); }
    else { t.x = nx; const g = solidFloor(nx, t.y); if (g < t.y) t.y = g; t.moveLeft -= step; if (t.moveLeft <= 0) { t.moveLeft = 0; syncUI(); } }
  }
  if (isBuried(t)) { t.vy = 0; t.falling = false; t.fallT = 0; t.afloat = false; return; }
  const g = restY(t);
  if (t.afloat && t.vy >= 0) {   // ride the waterline: rise with a flood, settle with a drain, and never count as falling
    if (t.y > g + 0.5) { if (!solidAt(t.x, t.y - 20)) t.y = Math.max(g, t.y - 60 * DT); t.vy = 0; t.falling = false; t.fallT = 0; return; }
    if (t.y >= g - 8) { t.y = Math.min(g, t.y + 40 * DT); t.vy = 0; t.falling = false; t.fallT = 0; return; }
  }
  if (t.y < g - 0.5) { t.vy += 700 * DT; t.y = Math.min(g, t.y + t.vy * DT); t.falling = true; t.fallT += DT; }
  else { if (g < t.y) t.y = g; t.vy = 0; t.falling = false; t.fallT = 0; }
}

