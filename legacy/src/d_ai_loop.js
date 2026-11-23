/* ---------- computer opponent ---------- */
function simShot(t, ang, pw, spec) {
  const a = ang * Math.PI / 180, sp = spec.straight ? 900 : pw * S.vel, wind = S.wind, g = S.g;
  const q = { x: t.x + Math.cos(a) * 18, y: t.y - 12 - Math.sin(a) * 18, vx: Math.cos(a) * sp, vy: -Math.sin(a) * sp };
  let age = 0, bore = spec.bore || 0;
  for (let i = 0; i < 2400; i++) {
    age += DT; fly(q, spec, wind, g);
    const hit = hitAt(q.x, q.y, age, t.id, false);
    if (hit === OOB) return null;
    if (hit === GROUND || hit === LIQ) {
      if (spec.ghost) continue;
      if (hit === GROUND && bore > 0) { bore -= Math.hypot(q.vx, q.vy) * DT; continue; }
      return { x: q.x, y: q.y, tank: null };
    }
    if (hit) return { x: hit.x, y: hit.y - 7, tank: hit };
  }
  return null;
}
function aiSolve(me, tx, ty, foe, spec) {
  const hits = [], safe = (spec.danger || spec.r || 25) + 30;
  let best = { a: me.angle, p: me.power, miss: 1e9 };
  const consider = (a, p) => {
    const r = simShot(me, a, p, spec); let miss = 5000;
    if (r) {
      miss = foe && r.tank === foe ? 0 : Math.hypot(r.x - tx, r.y - ty);
      if (r.tank && r.tank !== foe && !sameTeam(r.tank.id, me.id)) miss = Math.min(miss, 2);
      if (spec.kind !== 'hop') for (const k of S.live) if (sameTeam(k.id, me.id) && Math.hypot(r.x - k.x, r.y - (k.y - 7)) < safe) miss += 800;
    }
    if (miss === 0) hits.push({ a, p, miss });
    if (miss < best.miss) best = { a, p, miss };
  };
  if (spec.straight) {
    const d = Math.atan2((me.y - 12) - ty, tx - me.x) * 180 / Math.PI;
    for (let o = -4; o <= 4; o += 0.5) consider(clamp(d + o, 0, 180), 100);
    return best;
  }
  for (let a = 6; a <= 174; a += 3) for (let p = 16; p <= 100; p += 3) consider(a, p);
  if (hits.length) return pickOne(hits);
  const c = best;
  for (let a = c.a - 3; a <= c.a + 3; a += 0.5) for (let p = c.p - 3; p <= c.p + 3; p += 0.5) consider(clamp(a, 0, 180), clamp(p, 5, 100));
  return best;
}
const specOf = (t, id) => WEAPONS[id === 'encore' ? (S.lastId || 'shell') : id === 'mystery' ? (t.pending || 'shell') : id].spec;
function aiPickWeapon(me, foe, L) {
  const inv = me.weapons; if (inv.length < 2) return 0;
  if (L.smart === 0) return (Math.random() * inv.length) | 0;
  const sl = surfaceY(clamp(foe.x - 44, 0, W - 1)), sr = surfaceY(clamp(foe.x + 44, 0, W - 1));
  const pit = sl < foe.y - 24 && sr < foe.y - 24, hill = sl > foe.y + 16 && sr > foe.y + 16;
  const covered = isBuried(foe) || solidTop(foe.x) < foe.y - 26;   // dirt or a roof over the target
  const d = Math.atan2((me.y - 12) - (foe.y - 7), foe.x - me.x) * 180 / Math.PI;
  const r = simShot(me, clamp(d, 0, 180), 100, WEAPONS.rail.spec), los = !!(r && r.tank === foe);
  const crowd = S.live.some(k => k !== foe && !sameTeam(k.id, me.id) && Math.abs(k.x - foe.x) < 380);
  let bi = 0, bv = -1e9;
  inv.forEach((id, i) => {
    const s = specOf(me, id); let v = rand(0, 3 * (1.2 - L.smart) + 0.8);
    if (s.straight) v += los ? 4 : -6;
    if (s.kind === 'drill') v += pit || covered ? 3 : 0;
    if (s.roll || s.kind === 'sauce' || s.kind === 'geyser') v += pit ? 2 : hill ? -3 : 0;
    if (s.kind === 'dirt') v += covered ? -4 : 1.5;
    if (covered) v += s.kind === 'drill' || s.pierce || s.ghost || s.kind === 'mole' || s.bore ? 3 : s.r >= 60 ? 1.5 : -1.5;
    if (s.plumb || s.ghost) v += pit ? 2.5 : 0;
    if (s.kind === 'arc' || s.kind === 'hole') v += crowd ? 2.5 : 0;
    if (s.kind === 'steal') v += S.health || S.scores[foe.id] >= 15 ? 1.5 : -1;
    if (s.self === 'bubble') v += me.hitLast >= 14 && !me.shield ? 4 : -3;
    else if (s.self || s.kind === 'hop' || s.kind === 'smoke') v -= 4;
    if (v > bv) { bv = v; bi = i; }
  });
  return bi;
}
function planAI() {
  const g = S, me = cur(), L = LEVELS[me.level];
  const aimAtFoe = (foe, el) => { me.angle = foe.x >= me.x ? el : 180 - el; };
  const think = () => {
    const foes = S.live.filter(k => !sameTeam(k.id, me.id)), shell = WEAPONS.shell.spec, tracer = S.tracerRound;
    const near = nearestRival(me.id, me.x) || foes[0] || me;
    // shape the ground first: dig out when buried, sometimes wall up after a bad round
    if (!tracer && !me.shaped) {
      if (isBuried(me)) { aimAtFoe(near, 62); doShape(me, 'dig'); }
      else if (L.smart > 0 && me.hitLast >= 20 && Math.random() < L.dodge * 0.7) { aimAtFoe(near, 60); doShape(me, 'wall'); }
    }
    const solveAll = () => {
      let foe = foes[0] || me, sol = null;
      if (L.smart === 0) { foe = pickOne(foes); sol = aiSolve(me, foe.x, foe.y - 7, foe, shell); }
      else { let bv = 1e9; for (const f of foes) { const s = aiSolve(me, f.x, f.y - 7, f, shell), v = s.miss - (S.health ? (S.cfg.health - f.hp) * 0.12 : S.scores[f.id] * 0.15) + rand(0, 10); if (v < bv) { bv = v; foe = f; sol = s; } } }
      return [foe, sol];
    };
    let [foe, sol] = solveAll();
    const boxed = solidTop(me.x) < me.y - 24 || (solidAt(me.x - 26, me.y - 22) && solidAt(me.x + 26, me.y - 22));
    if (!tracer && !me.shaped && L.smart > 0 && sol.miss > 80 && boxed && !isBuried(me)) {   // boxed in: cut a firing lane toward the target and look again
      aimAtFoe(foe, clamp(sol.a <= 90 ? sol.a : 180 - sol.a, 25, 75)); doShape(me, 'dig'); [foe, sol] = solveAll();
    }
    let a = me.angle, p = me.power;
    if (!tracer) {
      me.sel = aiPickWeapon(me, foe, L);
      if (me.weapons[me.sel] === 'mystery') me.pending = pickOne(MYSTERY_POOL);
    }
    const spec = tracer ? TRACER.spec : specOf(me, me.weapons[me.sel]);
    if (!spec.self) {
      if (spec.kind === 'hop') {
        let tx = rand(60, W - 60);
        for (let i = 0; i < 8 && S.live.some(k => Math.abs(k.x - tx) < 90); i++) tx = rand(60, W - 60);
        sol = aiSolve(me, tx, surfaceY(tx), null, spec);
      } else if (spec.straight || spec.boom || spec.plumb || spec.chute || spec.walls || spec.ghost || spec.bore) {
        const s2 = aiSolve(me, foe.x, foe.y - 7, foe, spec); if (s2.miss < 4000) sol = s2;
      }
      if (me.lastFoe !== foe.id) { me.rangeN = 0; me.lastFoe = foe.id; }
      const k = Math.max(L.floor, Math.pow(L.learn, me.rangeN)), blind = S.smokes.some(m => Math.abs(m.x - foe.x) < m.r) ? 3.5 : 0;
      a = clamp(sol.a + gauss() * (L.sa * k * (spec.straight ? 0.5 : 1) + blind), 0, 180);
      p = clamp(sol.p + gauss() * (L.sp * k + blind), 5, 100);
      me.rangeN++;
    }
    g.aiPlan = { a0: me.angle, p0: me.power, a, p, t: 0, dur: g.demo ? 0.6 : 1 };
    syncUI();
  };
  const step = tries => {
    const bomb = L.smart > 0 && S.bombs.find(b => b.tank !== me.id && Math.abs(b.x - me.x) < b.r + 14);
    const hot = inLava(me), flinch = tries === 0 && me.hitLast >= 16 && Math.random() < L.dodge;
    if ((bomb || hot || flinch) && tries < 2 && me.fuel > 0 && !isBuried(me)) {
      const dir = bomb ? (me.x >= bomb.x ? 1 : -1) : me.x < 90 ? 1 : me.x > W - 90 ? -1 : Math.random() < 0.5 ? -1 : 1;
      if (startMove(me, dir)) { syncUI(); later(g, 900, () => step(tries + 1)); return; }
    }
    think();
  };
  later(g, g.demo ? 350 : 700, () => step(0));
}

/* ---------- simulation loop ---------- */
function stepBits() {   // flying dirt, water and lava: each lands and becomes part of the ground again
  const bits = S.bits, gr = S.g * 1.25, holes = S.holes; let w = 0;
  for (let i = 0; i < bits.length; i++) {
    const b = bits[i]; b.vy += gr * DT; if (!b.rain) b.vx += S.wind * 0.3 * DT;
    let eaten = false;
    for (const hl of holes) { const dx = hl.x - b.x, dy = hl.y - b.y, d = Math.hypot(dx, dy); if (d < 16) { eaten = true; break; } if (d < 240) { b.vx += dx / d * 1500 * DT; b.vy += dy / d * 1500 * DT; } }
    if (eaten) continue;
    const nx = b.x + b.vx * DT, ny = b.y + b.vy * DT;
    if (nx < 0 || nx >= W || ny >= H) continue;
    if (ny >= 0 && cellAt(nx, ny) !== AIR) { deposit(b.x, b.y, b.t); continue; }
    b.x = nx; b.y = ny; bits[w++] = b;
  }
  bits.length = w;
}
function tick() {
  S.time += DT; S.tickN++;
  for (let i = S.events.length - 1; i >= 0; i--) if (S.events[i].t <= S.time) S.events.splice(i, 1)[0].fn();
  for (let i = S.projs.length - 1; i >= 0; i--) { const p = S.projs[i]; if (p && !p.dead) stepProj(p); }
  S.projs = S.projs.filter(p => !p.dead);
  if (S.holes.length) {
    for (const hl of S.holes) {   // a black hole eats a growing ball of ground and drags tanks toward it
      hl.t += DT;
      if (S.tickN % 6 === 0) carve(hl.x, hl.y, 14 + hl.t * 23, 0);
      for (const k of S.live) { const dx = hl.x - k.x; if (Math.abs(dx) < 240 && Math.abs(dx) > 14 && !isBuried(k)) { k.moveDir = Math.sign(dx); k.moveLeft = Math.max(k.moveLeft, 1.5); S.traces[k.id] = null; } }
      if (S.tickN % 3 === 0 && S.parts.length < 480) { const a = rand(0, 6.28), d = rand(40, 130); S.parts.push({ x: hl.x + Math.cos(a) * d, y: hl.y + Math.sin(a) * d, vx: -Math.cos(a) * d * 2.2, vy: -Math.sin(a) * d * 2.2 - 120, t: 0, life: 0.42, c: '#c4a1ff', s: 2.5 }); }
    }
    const done = S.holes.filter(hl => hl.t >= 2);
    if (done.length) {
      S.holes = S.holes.filter(hl => hl.t < 2);
      for (const hl of done) explode(hl.x, hl.y, hl.r, hl.dmg, hl.owner);
      for (const k of S.tanks) k.rangeN = 0;
    }
  }
  for (const b of S.bombs) { const k = b.tank >= 0 ? S.tanks[b.tank] : null; if (k && !k.dead) { b.x = k.x; b.y = k.y - 10; } else { b.tank = -1; b.y = floorBelow(clamp(b.x, 0, W - 1), Math.max(0, b.y - 6)) - 4; } }
  if (S.bits.length) stepBits();
  simStep();
  for (const t of S.tanks) stepTank(t);
  if (S.tickN % 30 === 0) S.props = S.props.filter(p => solidAt(p.x, p.y0 + 2));
  if (S.precip === 'rain' && S.tickN % (S.env.weather === 'storm' ? 10 : 20) === 0 && S.bits.length < 1400) S.bits.push({ x: rand(4, W - 4), y: 1, vx: S.wind * 1.5, vy: 430, t: WATER, rain: true });
  if (S.phase === 'flight') {
    const busy = S.projs.length || S.events.length || S.holes.length || S.tanks.some(k => (k.falling && k.fallT > 0.15) || k.moveLeft > 0) || S.bits.some(b => !b.rain);   // a tank bobbing on water is not a fall
    if (busy) { S.settleT = 0; S.flowT = 0; }
    else if (G.act && (S.flowT += DT) < 1.6) S.settleT = 0;   // give loose dirt and liquid a moment to come to rest
    else if ((S.settleT += DT) > 0.7) {
      if (!S.health && !S.tracerRound && S.shots.every(v => v === 0)) for (const b of S.bombs) b.fuse = 0;
      const due = S.bombs.filter(b => b.fuse <= 0);
      if (due.length) { S.bombs = S.bombs.filter(b => b.fuse > 0); for (const b of due) explode(b.x, b.y, b.r, b.dmg, b.owner); S.settleT = 0; }
      else if (!S.hazardDone && hazard()) S.settleT = 0;
      else if (!S.burnDone) {   // a tank that ends its own turn still sitting in lava burns: it had the turn to drive, dig or bridge out
        S.burnDone = true; const k = cur();
        if (!k.dead && inLava(k)) { hurt(k, 16, -1); smokePuff(k.x, k.y - 12, 12, true); sfxSizzle(); S.settleT = 0.2; } else endTurn();
      }
      else endTurn();
    }
  }
}
const FOG = Array.from({ length: 9 }, () => ({ x: rand(0, SIZES.large), y: rand(250, 520), w: rand(440, 720), h: rand(120, 200), v: rand(6, 16) * (Math.random() < 0.5 ? -1 : 1) }));
const CLOUDS = Array.from({ length: 8 }, () => ({ x: rand(0, SIZES.large), y: rand(40, 200), v: rand(3, 9),
  parts: Array.from({ length: 4 }, (q, i) => ({ dx: (i - 1.5) * rand(48, 72), dy: rand(-14, 12), w: rand(150, 250), h: rand(50, 88) })) }));
function update(dt) {
  for (const p of S.projs) { p.trail.push(p.x, p.y); if (p.trail.length > (p.seek ? 10 : 32)) p.trail.splice(0, 2); }
  for (const q of S.parts) { q.t += dt; q.vy += 520 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
  S.parts = S.parts.filter(q => q.t < q.life);
  for (const q of S.puffs) { q.t += dt; q.x += (q.vx + S.wind * 0.3) * dt; q.y += q.vy * dt; q.r += 12 * dt; }
  S.puffs = S.puffs.filter(q => q.t < q.life);
  for (const t of S.tanks) {   // recoil settles; wrecks and badly hurt tanks trail smoke
    t.recoil *= Math.pow(0.002, dt);
    if (t.dead ? Math.random() < dt * 2.5 : S.health && t.hp < S.cfg.health * 0.35 && Math.random() < dt * 5) smokePuff(t.x + rand(-4, 4), t.y - 14, rand(5, 9), true);
  }
  for (const b of S.booms) b.t += dt * 2.3;
  S.booms = S.booms.filter(b => b.t < 1);
  for (const b of S.bolts) b.t += dt * 3.2;
  S.bolts = S.bolts.filter(b => b.t < 1);
  for (const f of S.floats) { f.t += dt; f.y -= 26 * dt; }
  S.floats = S.floats.filter(f => f.t < 1.5);
  if (S.banner) { S.banner.t += dt; if (S.banner.t > 1.9) S.banner = null; }
  S.shake *= Math.pow(0.004, dt); S.flash *= Math.pow(0.004, dt);
  for (const d of S.drops) {
    if (S.precip === 'rain') { d.y += (600 + d.s * 220) * dt; d.x += (S.wind * 4 - 50) * dt; if (d.y > H) { d.y = -12; d.x = rand(0, W + 100); } }
    else if (S.precip === 'snow') { d.y += (48 + d.s * 44) * dt; d.x += (S.wind * 2 + Math.sin(S.time * 1.5 + d.s * 9) * 18) * dt; if (d.y > H) { d.y = -6; d.x = rand(0, W); } }
    else { d.y -= (28 + d.s * 40) * dt; d.x += Math.sin(S.time * 2 + d.s * 9) * 14 * dt; if (d.y < 150 + d.s * 200) { d.x = rand(0, W); d.y = surfaceY(d.x); } }
    if (d.x < -20) d.x += W + 40; else if (d.x > W + 20) d.x -= W + 40;
  }
  if (Math.random() < dt * 16 && S.parts.length < 480) {   // open lava spits the odd spark
    const x = rand(0, W - 1), y = surfaceY(x);
    if (cellAt(x, y + 1) === LAVA) S.parts.push({ x, y, vx: rand(-14, 14), vy: -rand(50, 130), t: 0, life: rand(0.5, 1), c: '#ffb347', s: 1.6, spark: true });
  }
  for (const f of FOG) { f.x += f.v * dt; if (f.x < -400) f.x = W + 400; else if (f.x > W + 400) f.x = -400; }
  for (const c of CLOUDS) { c.x += c.v * dt; if (c.x > W + 340) c.x = -340; }
  const pl = S.aiPlan;
  if (pl && S.phase === 'aim' && !(cur().moveLeft > 0)) {
    pl.t += dt; const me = cur(), k = clamp(pl.t / pl.dur, 0, 1), e = k * k * (3 - 2 * k);
    me.angle = lerp(pl.a0, pl.a, e); me.power = lerp(pl.p0, pl.p, e); syncAim();
    if (pl.t > pl.dur + 0.3) fire();
  }
}
let last = 0, acc = 0;
function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000 || 0); last = now;
  if (S) {
    if (!paused) {
      let scale = 1;
      if (S.slowT > 0) { S.slowT -= real; scale = 0.3; }   // slow motion on the big moments
      S.z += ((S.slowT > 0 ? 1.14 : 1) - S.z) * Math.min(1, real * 7);
      const dt = real * scale;
      acc += dt; let n = 0; while (acc >= DT && n++ < 12) { tick(); acc -= DT; } if (acc > DT) acc = 0;
      update(dt);
    }
    draw();
  }
  requestAnimationFrame(frame);
}

