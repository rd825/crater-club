// The fluid/loose solver. Verbatim port of src/b_world.js:84-166.
// LOOSE dirt, WATER and LAVA move each step until they settle, then the sim sleeps (G.act = null).
// Highest-risk port: lava cadence (every 3rd step), asymmetric flow reach (water 14 / lava 4),
// levelWater cadence (every 24 steps + on sleep), stamp dedup, direction alternation.

import { AIR, LOOSE, WATER, LAVA, STONE, CELL, SOLID } from './constants.ts';
import { touch } from './grid.ts';
import type { Grid, Box } from './types.ts';

/** Let each connected pool find one level. */
export function levelWater(G: Grid): void {
  const g = G.g,
    cols = G.cols,
    rows = G.rows;
  let c0 = cols,
    c1 = -1,
    r0 = rows,
    r1 = -1;
  for (let r = rows - 2; r >= 1; r--) {
    const row = r * cols,
      up = row - cols,
      dn = row + cols;
    let c = 0;
    while (c < cols) {
      while (c < cols && (SOLID[g[row + c]] || g[row + c] === LAVA)) c++;
      const a = c;
      while (c < cols && !SOLID[g[row + c]] && g[row + c] !== LAVA) c++;
      let h = a,
        s = c - 1;
      for (;;) {
        while (h < c && !(g[row + h] === AIR && g[dn + h] !== AIR)) h++;
        while (s >= a && g[up + s] !== WATER) s--;
        if (h >= c || s < a) break;
        g[row + h] = WATER;
        g[up + s] = AIR;
        const lo = h < s ? h : s,
          hi = h < s ? s : h;
        if (lo < c0) c0 = lo;
        if (hi > c1) c1 = hi;
        if (r - 1 < r0) r0 = r - 1;
        if (r > r1) r1 = r;
        h++;
        s--;
      }
    }
  }
  if (c1 >= 0) touch(G, c0, r0, c1, r1);
}

/** One fixed simulation step over the active box. `onSteam(x,y)` emits a steam puff on a lava/water reaction. */
export function simStep(G: Grid, onSteam: (x: number, y: number) => void): void {
  const A = G.act;
  if (!A) {
    if (G.needLevel) {
      G.needLevel = false;
      levelWater(G);
    }
    return;
  }
  G.needLevel = true;
  const g = G.g,
    st = G.stamp,
    cols = G.cols,
    rows = G.rows;
  const c0 = Math.max(0, A[0] - 15),
    c1 = Math.min(cols - 1, A[2] + 15),
    r0 = Math.max(0, A[1] - 2),
    r1 = Math.min(rows - 2, A[3] + 3);
  G.simN = (G.simN + 1) % 60000;
  const simN = G.simN;
  const sn = (simN % 250) + 1,
    ltr = simN & 1,
    lavaTurn = simN % 3 === 0;
  let m0 = cols,
    m1 = -1,
    n0 = rows,
    n1 = -1,
    l0 = cols,
    l1 = -1,
    k0 = rows,
    k1 = -1,
    steam = 0;
  for (let r = r1; r >= r0; r--) {
    const row = r * cols;
    for (let k = c1 - c0; k >= 0; k--) {
      const c = ltr ? c0 + k : c1 - k,
        i = row + c,
        t = g[i];
      if (t !== LOOSE && t !== WATER && t !== LAVA) continue;
      if (st[i] === sn) continue;
      const b = i + cols,
        tb = g[b];
      if (tb === t && t !== LOOSE && g[i - 1] === t && g[i + 1] === t) continue; // deep inside a pool
      let to = -1,
        tc = c,
        tr = r;
      if (t === LOOSE) {
        if (tb === AIR) {
          to = b;
          tr = r + 1;
        } else if (tb === WATER || tb === LAVA) {
          g[b] = LOOSE;
          g[i] = tb;
          st[b] = sn;
          st[i] = sn;
          if (c < m0) m0 = c;
          if (c > m1) m1 = c;
          if (r < n0) n0 = r;
          if (r + 1 > n1) n1 = r + 1;
          continue;
        } else {
          const L = c > 0 && g[b - 1] === AIR && g[i - 1] === AIR,
            R = c < cols - 1 && g[b + 1] === AIR && g[i + 1] === AIR;
          if (L || R) {
            const d = L && R ? (ltr ? -1 : 1) : L ? -1 : 1;
            to = b + d;
            tc = c + d;
            tr = r + 1;
          } else continue;
        }
      } else {
        if (t === LAVA && !lavaTurn) continue; // lava is thick: moves every third step
        const other = t === WATER ? LAVA : WATER;
        let j = -1; // water meets lava: lava hardens to stone, water boils off
        if (tb === other) j = b;
        else if (c > 0 && g[i - 1] === other) j = i - 1;
        else if (c < cols - 1 && g[i + 1] === other) j = i + 1;
        if (j >= 0) {
          if (t === LAVA) {
            g[i] = STONE;
            g[j] = AIR;
          } else {
            g[j] = STONE;
            g[i] = AIR;
          }
          if (c - 1 < m0) m0 = c - 1;
          if (c + 1 > m1) m1 = c + 1;
          if (r < n0) n0 = r;
          if (r + 1 > n1) n1 = r + 1;
          if (steam++ < 3) onSteam(c * CELL, r * CELL);
          continue;
        }
        if (tb === AIR) {
          to = b;
          tr = r + 1;
        } else {
          const L = c > 0 && g[b - 1] === AIR && g[i - 1] === AIR,
            R = c < cols - 1 && g[b + 1] === AIR && g[i + 1] === AIR;
          if (L || R) {
            const d = L && R ? (ltr ? -1 : 1) : L ? -1 : 1;
            to = b + d;
            tc = c + d;
            tr = r + 1;
          } else {
            const reach = t === WATER ? 14 : 4; // run along the surface to somewhere lower
            for (let pass = 0; pass < 2 && to < 0; pass++) {
              const d = (pass === 0) === (ltr === 1) ? 1 : -1;
              let q = i;
              for (let s = 1; s <= reach; s++) {
                const cc = c + d * s;
                if (cc < 0 || cc >= cols) break;
                q += d;
                if (g[q] !== AIR) break;
                if (g[q + cols] === AIR) {
                  to = q;
                  tc = cc;
                  break;
                }
              }
            }
          }
        }
        if (to >= 0 && t === LAVA) {
          if (tc < l0) l0 = tc;
          if (tc > l1) l1 = tc;
          if (r < k0) k0 = r;
          if (tr > k1) k1 = tr;
        }
      }
      if (to < 0) continue;
      g[to] = t;
      g[i] = AIR;
      st[to] = sn;
      if (c < m0) m0 = c;
      if (c > m1) m1 = c;
      if (tc < m0) m0 = tc;
      if (tc > m1) m1 = tc;
      if (r < n0) n0 = r;
      if (tr > n1) n1 = tr;
    }
  }
  if (simN % 24 === 0) levelWater(G);
  if (lavaTurn) G.lavaBox = l1 >= 0 ? [l0, k0, l1, k1] : null;
  else if (G.lavaBox) {
    const bx = G.lavaBox;
    if (bx[0] < m0) m0 = bx[0];
    if (bx[2] > m1) m1 = bx[2];
    if (bx[1] < n0) n0 = bx[1];
    if (bx[3] > n1) n1 = bx[3];
  }
  G.act = m1 >= 0 ? [m0, n0, m1, n1] : null;
  if (m1 >= 0) {
    const d: Box | null = G.dirty;
    if (!d) G.dirty = [m0, n0, m1, n1];
    else {
      if (m0 < d[0]) d[0] = m0;
      if (n0 < d[1]) d[1] = n0;
      if (m1 > d[2]) d[2] = m1;
      if (n1 > d[3]) d[3] = n1;
    }
  }
}
