/* ---------- the ground: a grid of 2 pixel cells ---------- */
/* Static dirt stays where it is, so tunnels, caves and overhangs hold. Loose dirt, water and lava move every step until they
   come to rest. G.act is the box of cells that moved last step; when nothing moves the simulation sleeps. */
const cellAt = (x, y) => { if (y < 0 || x < 0 || x >= W) return AIR; if (y >= H) return ROCK; return G.g[((y / CELL) | 0) * G.cols + ((x / CELL) | 0)]; };
const solidAt = (x, y) => SOLID[cellAt(x, y)] === 1;
const liquidAt = (x, y) => { const t = cellAt(x, y); return t === WATER || t === LAVA; };
function floorBelow(x, y) {   // top of the first thing that is not air at or below y (liquid counts: tanks float)
  if (x < 0 || x >= W) return H;
  const g = G.g, cols = G.cols, rows = G.rows, c = (x / CELL) | 0; let r = Math.max(0, (y / CELL) | 0);
  while (r < rows && g[r * cols + c] === AIR) r++;
  return r * CELL;
}
function solidTop(x) {        // top of the first solid cell coming down from the sky
  const g = G.g, cols = G.cols, rows = G.rows, c = clamp((x / CELL) | 0, 0, cols - 1); let r = 0;
  while (r < rows && !SOLID[g[r * cols + c]]) r++;
  return r * CELL;
}
const surfaceY = x => floorBelow(clamp(x, 0, W - 1), 0);
function solidBelow(x, y) {   // top of the first solid cell at or below y, looking through water and lava
  const g = G.g, cols = G.cols, rows = G.rows, c = clamp((x / CELL) | 0, 0, cols - 1); let r = Math.max(0, (y / CELL) | 0);
  while (r < rows && !SOLID[g[r * cols + c]]) r++;
  return r * CELL;
}
function touch(c0, r0, c1, r1) {   // these cells changed: repaint them and wake the simulation there
  let d = G.dirty;
  if (!d) G.dirty = [c0, r0, c1, r1]; else { if (c0 < d[0]) d[0] = c0; if (r0 < d[1]) d[1] = r0; if (c1 > d[2]) d[2] = c1; if (r1 > d[3]) d[3] = r1; }
  d = G.act;
  if (!d) G.act = [c0, r0, c1, r1]; else { if (c0 < d[0]) d[0] = c0; if (r0 < d[1]) d[1] = r0; if (c1 > d[2]) d[2] = c1; if (r1 > d[3]) d[3] = r1; }
}
function fling(px, py, dx, dy, r, t) {   // a carved cell becomes a flying bit that lands as loose dirt or liquid
  if (S.bits.length > 1500) return;
  const d = Math.hypot(dx, dy) || 1, sp = rand(0.4, 1.1) * (80 + r * 2.4);
  S.bits.push({ x: px, y: py, vx: dx / d * sp, vy: dy / d * sp * 0.6 - rand(70, 190) - r, t: t === WATER || t === LAVA ? t : LOOSE });
}
function carve(cx, cy, r, ej, crumble) {   // remove everything but bedrock in a circle; ej is the share thrown out as debris.
  // With crumble, a thin shell of ground around the hole is shaken loose, so crater walls slump and thin roofs fall in.
  const g = G.g, cols = G.cols, rows = G.rows, rr2 = r * r;
  const c0 = Math.max(0, Math.floor((cx - r) / CELL)), c1 = Math.min(cols - 1, Math.ceil((cx + r) / CELL));
  const r0 = Math.max(0, Math.floor((cy - r) / CELL)), r1 = Math.min(rows - 1, Math.ceil((cy + r) / CELL));
  if (c1 < c0 || r1 < r0) return 0;
  const every = ej > 0 ? Math.max(1, Math.round(1 / ej)) : 0; let n = 0;
  if (crumble) {
    const R = r + 7, R2 = R * R, d0 = Math.max(0, Math.floor((cx - R) / CELL)), d1 = Math.min(cols - 1, Math.ceil((cx + R) / CELL)), e0 = Math.max(0, Math.floor((cy - R) / CELL)), e1 = Math.min(rows - 6, Math.ceil((cy + R) / CELL));
    for (let rw = e0; rw <= e1; rw++) {
      const y = rw * CELL + 1 - cy;
      for (let c = d0; c <= d1; c++) { const x = c * CELL + 1 - cx, q = x * x + y * y; if (q <= rr2 || q > R2) continue; const i = rw * cols + c; if (g[i] === DIRT || g[i] === TURF) g[i] = LOOSE; }
    }
    touch(d0 - 1, e0 - 1, d1 + 1, e1 + 1);
  }
  for (let rw = r0; rw <= r1; rw++) {
    const y = rw * CELL + 1 - cy;
    for (let c = c0; c <= c1; c++) {
      const x = c * CELL + 1 - cx; if (x * x + y * y > rr2) continue;
      const i = rw * cols + c, t = g[i]; if (t === AIR || t === ROCK) continue;
      g[i] = AIR; n++;
      if (every && (t === WATER || t === LAVA ? n % 2 === 0 : n % every === 0)) fling(cx + x, cy + y, x, y, r, t);
    }
  }
  touch(c0 - 1, r0 - 1, c1 + 1, r1 + 1);
  return n;
}
function deposit(x, y, t) {   // a flying bit lands: it takes the nearest free cell at or above where it stopped
  const g = G.g, cols = G.cols, c = clamp((x / CELL) | 0, 0, cols - 1); let r = Math.min(G.rows - 2, (y / CELL) | 0);
  for (let k = 0; k < 10 && r >= 0; k++, r--) if (g[r * cols + c] === AIR) { g[r * cols + c] = t; touch(c, r, c, r); return; }
}
function fillCells(x0, y0, x1, y1, t, only) {   // paint a box; only = function(cellType) that says which cells may be replaced
  const g = G.g, cols = G.cols, c0 = Math.max(0, (x0 / CELL) | 0), c1 = Math.min(cols - 1, (x1 / CELL) | 0), r0 = Math.max(0, (y0 / CELL) | 0), r1 = Math.min(G.rows - 6, (y1 / CELL) | 0);
  if (c1 < c0 || r1 < r0) return;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const i = r * cols + c; if (g[i] !== ROCK && only(g[i])) g[i] = t; }
  touch(c0 - 1, r0 - 1, c1 + 1, r1 + 1);
}
const notSolid = t => !SOLID[t];
function blob(cx, cy, rx, ry, t, only) {   // paint an ellipse
  const g = G.g, cols = G.cols, c0 = Math.max(0, Math.floor((cx - rx) / CELL)), c1 = Math.min(cols - 1, Math.ceil((cx + rx) / CELL));
  const r0 = Math.max(0, Math.floor((cy - ry) / CELL)), r1 = Math.min(G.rows - 6, Math.ceil((cy + ry) / CELL));
  if (c1 < c0 || r1 < r0) return;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const dx = (c * CELL + 1 - cx) / rx, dy = (r * CELL + 1 - cy) / ry, i = r * cols + c;
    if (dx * dx + dy * dy <= 1 && g[i] !== ROCK && only(g[i])) g[i] = t;
  }
  touch(c0 - 1, r0 - 1, c1 + 1, r1 + 1);
}

function levelWater() {   // let each connected pool find one level: water stacked on water steps down into free cells beside the level below
  const g = G.g, cols = G.cols, rows = G.rows; let c0 = cols, c1 = -1, r0 = rows, r1 = -1;
  for (let r = rows - 2; r >= 1; r--) {
    const row = r * cols, up = row - cols, dn = row + cols; let c = 0;
    while (c < cols) {
      while (c < cols && (SOLID[g[row + c]] || g[row + c] === LAVA)) c++;
      const a = c; while (c < cols && !SOLID[g[row + c]] && g[row + c] !== LAVA) c++;
      let h = a, s = c - 1;
      for (;;) {
        while (h < c && !(g[row + h] === AIR && g[dn + h] !== AIR)) h++;
        while (s >= a && g[up + s] !== WATER) s--;
        if (h >= c || s < a) break;
        g[row + h] = WATER; g[up + s] = AIR;
        const lo = h < s ? h : s, hi = h < s ? s : h; if (lo < c0) c0 = lo; if (hi > c1) c1 = hi; if (r - 1 < r0) r0 = r - 1; if (r > r1) r1 = r;
        h++; s--;
      }
    }
  }
  if (c1 >= 0) touch(c0, r0, c1, r1);
}
let simN = 0;
function simStep() {
  const A = G.act;
  if (!A) { if (G.needLevel) { G.needLevel = false; levelWater(); } return; }
  G.needLevel = true;
  const g = G.g, st = G.stamp, cols = G.cols, rows = G.rows;
  const c0 = Math.max(0, A[0] - 15), c1 = Math.min(cols - 1, A[2] + 15), r0 = Math.max(0, A[1] - 2), r1 = Math.min(rows - 2, A[3] + 3);
  simN = (simN + 1) % 60000;
  const sn = (simN % 250) + 1, ltr = simN & 1, lavaTurn = simN % 3 === 0;
  let m0 = cols, m1 = -1, n0 = rows, n1 = -1, l0 = cols, l1 = -1, k0 = rows, k1 = -1, steam = 0;
  for (let r = r1; r >= r0; r--) {
    const row = r * cols;
    for (let k = c1 - c0; k >= 0; k--) {
      const c = ltr ? c0 + k : c1 - k, i = row + c, t = g[i];
      if (t !== LOOSE && t !== WATER && t !== LAVA) continue;
      if (st[i] === sn) continue;
      const b = i + cols, tb = g[b];
      if (tb === t && t !== LOOSE && g[i - 1] === t && g[i + 1] === t) continue;   // deep inside a pool: nothing to do
      let to = -1, tc = c, tr = r;
      if (t === LOOSE) {
        if (tb === AIR) { to = b; tr = r + 1; }
        else if (tb === WATER || tb === LAVA) { g[b] = LOOSE; g[i] = tb; st[b] = sn; st[i] = sn; if (c < m0) m0 = c; if (c > m1) m1 = c; if (r < n0) n0 = r; if (r + 1 > n1) n1 = r + 1; continue; }
        else {
          const L = c > 0 && g[b - 1] === AIR && g[i - 1] === AIR, R = c < cols - 1 && g[b + 1] === AIR && g[i + 1] === AIR;
          if (L || R) { const d = L && R ? (ltr ? -1 : 1) : L ? -1 : 1; to = b + d; tc = c + d; tr = r + 1; }
          else continue;   // resting for now; it will slide again if the ground beside it goes
        }
      } else {
        if (t === LAVA && !lavaTurn) continue;   // lava is thick: it only moves every third step
        const other = t === WATER ? LAVA : WATER;
        let j = -1;   // water meeting lava: the lava hardens to stone and the water boils off
        if (tb === other) j = b; else if (c > 0 && g[i - 1] === other) j = i - 1; else if (c < cols - 1 && g[i + 1] === other) j = i + 1;
        if (j >= 0) {
          if (t === LAVA) { g[i] = STONE; g[j] = AIR; } else { g[j] = STONE; g[i] = AIR; }
          if (c - 1 < m0) m0 = c - 1; if (c + 1 > m1) m1 = c + 1; if (r < n0) n0 = r; if (r + 1 > n1) n1 = r + 1;
          if (steam++ < 3 && S.puffs.length < 70) S.puffs.push({ x: c * CELL, y: r * CELL, vx: rand(-10, 10), vy: -rand(20, 44), t: 0, life: rand(0.6, 1.1), r: rand(6, 11), dark: false });
          continue;
        }
        if (tb === AIR) { to = b; tr = r + 1; }
        else {
          const L = c > 0 && g[b - 1] === AIR && g[i - 1] === AIR, R = c < cols - 1 && g[b + 1] === AIR && g[i + 1] === AIR;
          if (L || R) { const d = L && R ? (ltr ? -1 : 1) : L ? -1 : 1; to = b + d; tc = c + d; tr = r + 1; }
          else {   // look along the surface for somewhere lower to run to
            const reach = t === WATER ? 14 : 4;
            for (let pass = 0; pass < 2 && to < 0; pass++) {
              const d = (pass === 0) === (ltr === 1) ? 1 : -1; let q = i;
              for (let s = 1; s <= reach; s++) { const cc = c + d * s; if (cc < 0 || cc >= cols) break; q += d; if (g[q] !== AIR) break; if (g[q + cols] === AIR) { to = q; tc = cc; break; } }
            }
          }
        }
        if (to >= 0 && t === LAVA) { if (tc < l0) l0 = tc; if (tc > l1) l1 = tc; if (r < k0) k0 = r; if (tr > k1) k1 = tr; }
      }
      if (to < 0) continue;
      g[to] = t; g[i] = AIR; st[to] = sn;
      if (c < m0) m0 = c; if (c > m1) m1 = c; if (tc < m0) m0 = tc; if (tc > m1) m1 = tc; if (r < n0) n0 = r; if (tr > n1) n1 = tr;
    }
  }
  if (simN % 24 === 0) levelWater();
  if (lavaTurn) G.lavaBox = l1 >= 0 ? [l0, k0, l1, k1] : null;
  else if (G.lavaBox) { const b = G.lavaBox; if (b[0] < m0) m0 = b[0]; if (b[2] > m1) m1 = b[2]; if (b[1] < n0) n0 = b[1]; if (b[3] > n1) n1 = b[3]; }
  G.act = m1 >= 0 ? [m0, n0, m1, n1] : null;
  if (m1 >= 0) { const d = G.dirty; if (!d) G.dirty = [m0, n0, m1, n1]; else { if (m0 < d[0]) d[0] = m0; if (n0 < d[1]) d[1] = n0; if (m1 > d[2]) d[2] = m1; if (n1 > d[3]) d[3] = n1; } }
}

/* painting the ground: each cell gets a colour from its material, depth and what is next to it */
const hex3 = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
function buildTables() {
  const pal = S.pal, rows = G.rows, cols = G.cols, snowy = S.env.weather === 'snow', tm = S.sky.tint || [0, 0, 0, 0];
  const tint = (c, k) => c.map((v, i) => v * (1 - tm[3] * k) + tm[i] * tm[3] * k);
  const top = hex3(pal.top), bot = hex3(pal.bot);
  G.dR = new Float32Array(rows); G.dG = new Float32Array(rows); G.dB = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    const k = clamp((r * CELL - 170) / (H - 190), 0, 1), c = tint(top.map((v, i) => v + (bot[i] - v) * k), 1);
    G.dR[r] = c[0]; G.dG[r] = c[1]; G.dB[r] = c[2];
  }
  G.cTurf = tint(hex3(snowy ? '#e9f0fa' : pal.turf), 1); G.cLine = tint(hex3(snowy ? '#ffffff' : pal.line), 0.4);
  G.cRock = tint([36, 30, 46], 1); G.cBuilt = tint([190, 160, 124], 1); G.cStone = tint([112, 120, 134], 1); G.cWater = tint([44, 126, 196], 0.7);
  const back = tint(bot.map(v => v * 0.62), 1), rgb = (c, k) => 'rgb(' + c.map(v => Math.round(v * k)).join(',') + ')';
  G.backTop = rgb(back, 1); G.backBot = rgb(back, 0.5);
  G.top = new Int16Array(cols); retop(0, cols - 1);
  G.wav = new Int8Array(cols);
  for (let c = 0; c < cols; c++) G.wav[c] = Math.round(Math.sin(c * 0.045) * 6 + Math.sin(c * 0.013 + 2) * 8);
}
function retop(c0, c1) {   // first solid row in each column: everything under it that is open is a cave, tunnel or overhang
  const g = G.g, cols = G.cols, rows = G.rows, top = G.top;
  for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) { let r = 0; while (r < rows && !SOLID[g[r * cols + c]]) r++; top[c] = r; }
}
function shade(c0, r0, c1, r1) {
  const g = G.g, px = G.px, cols = G.cols, rows = G.rows, dR = G.dR, dG = G.dG, dB = G.dB, wav = G.wav;
  const cT = G.cTurf, cL = G.cLine, cK = G.cRock, cU = G.cBuilt, cS = G.cStone, cW = G.cWater;
  c0 = Math.max(0, c0); r0 = Math.max(0, r0); c1 = Math.min(cols - 1, c1); r1 = Math.min(rows - 1, r1);
  if (c1 < c0 || r1 < r0) return;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const i = r * cols + c, t = g[i];
      if (t === AIR) { px[i] = 0; continue; }
      const up = r > 0 ? g[i - cols] : AIR, n = (Math.imul(c, 73856093) ^ Math.imul(r, 19349663)) >>> 0, nz = (n % 11) - 5;
      let R, Gc, B, A = 255;
      if (t === WATER) {
        if (up === AIR) { R = 200; Gc = 236; B = 255; A = 238; } else { R = cW[0]; Gc = cW[1] + nz; B = cW[2]; A = 210; }
      } else if (t === LAVA) {
        const k = n % 4; R = 255;
        if (!SOLID[up] && up !== LAVA) { Gc = 228; B = 132; } else { Gc = 92 + k * 22; B = 22 + k * 7; }
      } else {
        let m = 1, lit = true;
        if (t === ROCK) { R = cK[0]; Gc = cK[1]; B = cK[2]; m = 1 + nz * 0.03; lit = false; }
        else if (t === BUILT) { R = cU[0]; Gc = cU[1]; B = cU[2]; if (r % 4 === 0 || (c + ((r >> 2) & 1) * 3) % 6 === 0) m = 0.7; }
        else if (t === STONE) { R = cS[0]; Gc = cS[1]; B = cS[2]; m = 1 + nz * 0.03; }
        else if (t === TURF) {
          if (!SOLID[up]) { R = cL[0]; Gc = cL[1]; B = cL[2]; lit = false; } else { R = cT[0]; Gc = cT[1]; B = cT[2]; m = 1 + nz * 0.014; lit = false; }
        } else {
          R = dR[r]; Gc = dG[r]; B = dB[r];
          if (t === LOOSE) m = 1.16;
          if ((((r * CELL + wav[c]) / 17) | 0) & 1) m *= 1.13;
          m *= 1 + nz * 0.016;
        }
        if (lit) {   // light comes from above: bright tops, dark ceilings, dim walls
          if (!SOLID[up]) m *= 1.34;
          else if (r > 1 && !SOLID[g[i - 2 * cols]]) m *= 1.15;
          else if (r < rows - 1 && !SOLID[g[i + cols]]) m *= 0.58;
          else if ((c > 0 && !SOLID[g[i - 1]]) || (c < cols - 1 && !SOLID[g[i + 1]])) m *= 0.8;
        }
        R *= m; Gc *= m; B *= m;
      }
      R = R < 0 ? 0 : R > 255 ? 255 : R | 0; Gc = Gc < 0 ? 0 : Gc > 255 ? 255 : Gc | 0; B = B < 0 ? 0 : B > 255 ? 255 : B | 0;
      px[i] = ((A << 24) | (B << 16) | (Gc << 8) | R) >>> 0;
    }
  }
  G.cx.putImageData(G.img, 0, 0, c0, r0, c1 - c0 + 1, r1 - r0 + 1);
}
function mkGrid() {
  const cols = W / CELL, rows = H / CELL, c = document.createElement('canvas'); c.width = cols; c.height = rows;
  const cx = c.getContext('2d'), img = cx.createImageData(cols, rows);
  G = { cols, rows, g: new Uint8Array(cols * rows), stamp: new Uint8Array(cols * rows), act: null, dirty: null, lavaBox: null, cv: c, cx, img, px: new Uint32Array(img.data.buffer) };
  return G;
}
function encodeGrid() { const g = G.g, out = []; let t = g[0], n = 0; for (let i = 0; i < g.length; i++) { if (g[i] === t) n++; else { out.push(t, n); t = g[i]; n = 1; } } out.push(t, n); return out; }
function decodeGrid(rle) { const g = G.g; let i = 0; for (let k = 0; k < rle.length; k += 2) { g.fill(rle[k], i, i + rle[k + 1]); i += rle[k + 1]; } }

/* ---------- making a map ---------- */
const mkSines = (amps, fs) => amps.map((a, i) => ({ a: a * rand(0.5, 1), f: (i + 1) * rand(0.7, 1.3) * Math.PI * 2 / REF * 0.9 * (fs || 1), p: rand(0, 6.283) }));
const sines = (x, cs) => { let y = 0; for (const c of cs) y += c.a * Math.sin(x * c.f + c.p); return y; };
let coneX = 0;
const GEN = {
  hills(h) { const b = rand(365, 420), cs = mkSines([70, 46, 28, 16, 9, 5]); for (let x = 0; x < W; x++) h[x] = b + sines(x, cs); },
  mesa(h) {
    const b = rand(385, 420), cs = mkSines([110, 60, 30]), n = mkSines([0, 0, 0, 4, 3, 2]), q = 52;
    for (let x = 0; x < W; x++) { const t = sines(x, cs) / q, f = Math.floor(t), s = clamp((t - f - 0.36) / 0.28, 0, 1); h[x] = b + (f + s * s * (3 - 2 * s)) * q + sines(x, n); }
  },
  peaks(h) {
    const cs = mkSines([1, 1, 1], 1.6), amps = [175, 80, 34];
    for (let x = 0; x < W; x++) { let y = 540; cs.forEach((c, i) => { y -= amps[i] * c.a * (1 - Math.abs(Math.sin(x * c.f * 0.5 + c.p))); }); h[x] = y; }
  },
  islands(h) { const b = rand(468, 488), cs = mkSines([85, 55, 30, 14, 7]); for (let x = 0; x < W; x++) h[x] = b + sines(x, cs); },
  canyon(h) {
    const cs = mkSines([0, 22, 14, 9, 5]), c = W / 2 + rand(-60, 60), half = W * rand(0.125, 0.167);
    for (let x = 0; x < W; x++) { const s = clamp((Math.abs(x - c) - half) / 110, 0, 1); h[x] = 520 - s * s * (3 - 2 * s) * 230 + sines(x, cs); }
  },
  caldera(h) {
    const cs = mkSines([14, 12, 9, 6, 4]), c = coneX = W / 2 + rand(-90, 90), kk = 57800 * W * W / (REF * REF);
    for (let x = 0; x < W; x++) { const d = x - c; h[x] = 500 - 270 * Math.exp(-d * d / kk) + 90 * Math.exp(-d * d / 3200) + sines(x, cs); }
  },
  moon(h) {
    const b = rand(400, 440), cs = mkSines([45, 30, 14, 6]);
    for (let x = 0; x < W; x++) h[x] = b + sines(x, cs);
    for (let i = 0; i < Math.round(9 * W / REF); i++) {
      const c = rand(40, W - 40), R = rand(22, 58), dep = R * rand(0.35, 0.55);
      for (let x = Math.max(0, Math.floor(c - 1.35 * R)); x <= Math.min(W - 1, Math.ceil(c + 1.35 * R)); x++) {
        const d = Math.abs(x - c) / R;
        if (d < 1) h[x] += dep * (1 - d * d); else if (d < 1.35) h[x] -= dep * 0.28 * (1 - (d - 1) / 0.35);
      }
    }
  },
};
function flatten(h, c, sea) {
  c = Math.round(c); let s = 0, n = 0;
  for (let x = c - 18; x <= c + 18; x++) { s += h[clamp(x, 0, W - 1)]; n++; }
  let avg = s / n; if (sea && avg > sea - 42) avg = sea - 42;
  for (let x = c - 60; x <= c + 60; x++) {
    if (x < 0 || x >= W) continue;
    const d = Math.abs(x - c), w = d <= 18 ? 1 : 1 - (d - 18) / 42, k = w * w * (3 - 2 * w);
    h[x] = h[x] * (1 - k) + avg * k;
  }
}
function raster(h) {
  const g = G.g, cols = G.cols, rows = G.rows;
  for (let c = 0; c < cols; c++) {
    const top = Math.round(h[c * CELL] / CELL);
    for (let r = Math.max(0, top); r < rows; r++) g[r * cols + c] = r >= rows - 5 ? ROCK : r < top + 3 ? TURF : DIRT;
  }
}
function features(biome, h) {   // water, lava and hollow pockets, kept clear of where the tanks start
  const clear = (x, pad) => S.tanks.every(t => Math.abs(t.x - x) > pad), onlyDirt = t => t === DIRT;
  const pocket = (t, count, rx0, rx1, ry0, ry1, d0, d1) => {
    for (let k = 0, made = 0; k < 30 && made < count; k++) {
      const x = rand(90, W - 90), rx = rand(rx0, rx1), ry = rand(ry0, ry1), y = h[x | 0] + rand(d0, d1);
      if (!clear(x, rx + 50) || y + ry > H - 20) continue;
      blob(x, y, rx, ry, t, onlyDirt); made++;
    }
  };
  const flood = (level, x0, x1, t) => {   // fill open air below a level, column by column, down to the ground
    const g = G.g, cols = G.cols, rows = G.rows, r0 = Math.round(level / CELL);
    for (let c = Math.max(0, (x0 / CELL) | 0); c <= Math.min(cols - 1, (x1 / CELL) | 0); c++) for (let r = r0; r < rows && g[r * cols + c] === AIR; r++) g[r * cols + c] = t;
  };
  const lowest = () => { let bx = 100, by = 0; for (let x = 80; x < W - 80; x += 4) if (h[x] > by && clear(x, 90)) { by = h[x]; bx = x; } return bx; };
  if (biome === 'hills') { const x = lowest(); flood(h[x] - 16, x - 150, x + 150, WATER); pocket(WATER, 2, 40, 80, 12, 20, 60, 120); pocket(AIR, 1, 40, 70, 12, 18, 50, 100); }
  else if (biome === 'mesa') { pocket(AIR, 3, 40, 90, 12, 22, 46, 120); pocket(WATER, 1, 40, 60, 10, 16, 70, 120); }
  else if (biome === 'peaks') { const x = lowest(); flood(h[x] - 28, x - 190, x + 190, WATER); pocket(AIR, 1, 40, 70, 12, 18, 60, 120); }
  else if (biome === 'islands') flood(S.pal.sea, 0, W - 1, WATER);
  else if (biome === 'canyon') { const x = lowest(); flood(h[x] - 18, x - W * 0.2, x + W * 0.2, WATER); pocket(LAVA, 1, 60, 100, 12, 18, 150, 200); pocket(AIR, 1, 40, 70, 12, 18, 50, 90); }
  else if (biome === 'caldera') {
    let rim = H; for (let x = Math.max(0, coneX - 90) | 0; x < Math.min(W, coneX + 90); x++) if (h[x] < rim) rim = h[x];
    flood(rim + 22, coneX - 70, coneX + 70, LAVA);
    blob(coneX, Math.min(H - 60, h[coneX | 0] + 150), 130 * W / REF, 20, LAVA, onlyDirt);
    pocket(LAVA, 1, 40, 70, 10, 14, 80, 130);
  }
  else if (biome === 'moon') pocket(AIR, 4, 50, 110, 10, 18, 44, 120);
}

/* ---------- game setup ---------- */
function mkTank(id, x, type, hp) {
  const ai = type !== 'human';
  return { id, name: SEATS[id].name, color: SEATS[id].c, x, y: 0, vy: 0, falling: false, afloat: false, angle: x < W / 2 ? 60 : 120, power: 60,
           weapons: [], sel: 0, fuel: 2, moveLeft: 0, moveDir: 0, isAI: ai, level: ai ? type : null, hitLast: 0, rangeN: 0, lastFoe: -1,
           hp, dead: false, shield: 0, hiccup: false, pending: null, recoil: 0, shaped: false, fallT: 0,
           hi: mix(SEATS[id].c, '#ffffff', 0.42), lo: mix(SEATS[id].c, '#120d1c', 0.4) };
}
function baseGame(cfg, demo, env) {
  const sandbox = !demo && !!cfg.sandbox;   // the playground: every weapon, nothing runs out, targets that never shoot
  const b = BIOMES[env.biome], n = cfg.players.length, health = cfg.mode === 'health' && !sandbox, teams = !demo && !sandbox && cfg.teams === 'teams' && n >= 4 && n % 2 === 0;
  const g = { demo, sandbox, taken: [], shotDmg: 0, cfg, env, pal: b, sky: TIMES[env.time], g: b.space ? 150 : 300, vel: b.space ? 7 * Math.SQRT1_2 : 7,
    health, per: health ? ARSENAL : cfg.volleys, teams, teamOf: cfg.players.map((p, i) => teams ? (i < n / 2 ? 0 : 1) : i),
    tanks: [], live: [], scores: [], shots: [], turn: 0, round: 1, phase: 'aim', wind: 0, lastId: null,
    projs: [], events: [], parts: [], floats: [], booms: [], bolts: [], props: [], drops: [], holes: [], bombs: [], smokes: [], puffs: [], bits: [],
    flash: 0, shake: 0, time: 0, tickN: 0, settleT: 0, flowT: 0, hazardDone: true, burnDone: true, slowT: 0, z: 1, zx: W / 2, zy: H / 2, dramaAt: 0,
    traces: [], marks: [], tracerRound: !demo && !sandbox, curTrace: [], pool: [], pickTurn: 0, aiPlan: null, banner: null };
  g.maxHold = Math.ceil(g.per / KINDS);
  const w = env.weather;
  g.precip = w === 'rain' || w === 'storm' ? 'rain' : w === 'snow' ? 'snow' : b.embers ? 'embers' : null;
  const count = (g.precip === 'rain' ? (w === 'storm' ? 190 : 130) : g.precip === 'snow' ? 110 : g.precip === 'embers' ? 36 : 0) * W / REF;
  for (let i = 0; i < count; i++) g.drops.push({ x: rand(0, W), y: rand(0, H), s: Math.random() });
  return g;
}
const holds = (t, id) => t.weapons.reduce((n, w) => n + (w === id), 0);
function newGame(cfg, demo) {
  cfg = JSON.parse(JSON.stringify(cfg));
  const n = cfg.players.length, size = cfg.size === 'auto' ? (n <= 4 ? 'medium' : 'large') : cfg.size;
  const biome = cfg.biome === 'random' ? pickOne(Object.keys(BIOMES)) : cfg.biome, space = !!BIOMES[biome].space;
  let time = cfg.time === 'random' ? pickOne(['dawn', 'noon', 'dusk', 'night']) : cfg.time;
  let weather = cfg.weather === 'random' ? pickOne(space ? ['clear', 'meteors'] : Object.keys(WEATHER)) : cfg.weather;
  if (space) { time = 'space'; if (weather !== 'meteors') weather = 'clear'; }
  W = SIZES[size] || REF;
  S = baseGame(cfg, !!demo, { biome, time, weather, W }); paused = false; armed = false; preview = null; stable = {};
  const h = new Float32Array(W); GEN[biome](h);
  for (let x = 0; x < W; x++) h[x] = clamp(h[x] - 36, 150, 512);
  cfg.players.forEach((p, i) => {
    const x = clamp(100 + i * (W - 200) / (n - 1) + rand(-18, 18), 60, W - 60);
    flatten(h, x, S.pal.sea || 0);
    S.tanks.push(mkTank(i, x, p.type, cfg.health));
    S.scores.push(0); S.shots.push(cfg.volleys); S.traces.push(null); S.marks.push(null);
  });
  S.live = S.tanks.slice();
  mkGrid(); raster(h); features(biome, h); G.act = [0, 0, G.cols - 1, G.rows - 1]; G.dirty = null;
  for (const t of S.tanks) t.y = Math.round(h[Math.round(t.x)] / CELL) * CELL;
  const np = Math.round(13 * W / REF);
  for (let i = 0; i < np * 2 && S.props.length < np; i++) {
    const x = Math.round(rand(16, W - 16)), y0 = Math.round(h[x] / CELL) * CELL;
    if (S.tanks.some(t => Math.abs(t.x - x) < 46) || cellAt(x, y0 - 3) !== AIR || S.props.some(p => Math.abs(p.x - x) < 22)) continue;
    S.props.push({ x, y0, s: rand(0.8, 1.3), f: Math.random() < 0.5 ? -1 : 1 });
  }
  buildTables(); shade(0, 0, G.cols - 1, G.rows - 1);
  // weapon pool: every kind appears once. Only when the match needs more weapons than there are kinds does a second copy appear,
  // and no tank may hold more copies of one weapon than it has to.
  const need = n * S.per; let bag = [];
  while (bag.length < need) bag = bag.concat(shuffle(WEAPON_IDS.slice()));
  S.pool = shuffle(bag.slice(0, need)).map(id => ({ id, by: -1 }));
  rollWind(true);
  if (!demo) closeOverlays();
  buildCards();
  if (S.sandbox) { for (const t of S.tanks) if (!t.isAI) t.weapons = WEAPON_IDS.slice(); S.turn = Math.max(0, S.tanks.findIndex(t => !t.isAI)); startAim(); return; }
  if (cfg.deal === 'draft' && !demo) { S.phase = 'draft'; renderDraft(); $('draft').classList.add('open'); syncUI(); maybeAIPick(); }
  else {
    const give = (c, t) => { c.by = t.id; t.weapons.push(c.id); };
    for (const c of S.pool) {
      let best = null;
      for (const t of S.tanks) if (t.weapons.length < S.per && holds(t, c.id) < S.maxHold && (!best || t.weapons.length < best.weapons.length)) best = t;
      if (best) give(c, best);
    }
    for (const c of S.pool) if (c.by < 0) { const t = S.tanks.find(k => k.weapons.length < S.per); if (t) give(c, t); }
    startAim();
  }
}
function rollWind(newRound) {
  const m = S.pal.space ? 'calm' : S.env.weather === 'storm' ? 'gusty' : S.cfg.wind;
  if (m === 'calm') S.wind = 0;
  else if (m === 'breeze') { if (newRound) S.wind = Math.round(rand(-20, 20)); }
  else S.wind = Math.round(rand(-45, 45));
}

