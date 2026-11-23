// The ground: a grid of 2px cells. Verbatim port of src/b_world.js:4-82, 234-241.
// Low-level terrain reads + writes. Functions take the Grid (which carries W/H/cols/rows);
// carve/fling/deposit also take an Rng and the bits sink (the only game concepts they touch).

import { AIR, ROCK, DIRT, LOOSE, WATER, LAVA, TURF, CELL, SOLID } from './constants.ts';
import type { Grid, Bit, Box } from './types.ts';
import type { Rng } from './rng.ts';

export function makeGrid(W: number, H: number): Grid {
  const cols = W / CELL;
  const rows = H / CELL;
  return {
    W,
    H,
    cols,
    rows,
    g: new Uint8Array(cols * rows),
    stamp: new Uint8Array(cols * rows),
    simN: 0,
    act: null,
    dirty: null,
    lavaBox: null,
    needLevel: false,
  };
}

const clampi = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export function cellAt(G: Grid, x: number, y: number): number {
  if (y < 0 || x < 0 || x >= G.W) return AIR;
  if (y >= G.H) return ROCK;
  return G.g[((y / CELL) | 0) * G.cols + ((x / CELL) | 0)];
}
export const solidAt = (G: Grid, x: number, y: number): boolean => SOLID[cellAt(G, x, y)] === 1;
export const liquidAt = (G: Grid, x: number, y: number): boolean => {
  const t = cellAt(G, x, y);
  return t === WATER || t === LAVA;
};

/** Top of the first non-air at or below y (liquids count: tanks float). */
export function floorBelow(G: Grid, x: number, y: number): number {
  if (x < 0 || x >= G.W) return G.H;
  const g = G.g,
    cols = G.cols,
    rows = G.rows,
    c = (x / CELL) | 0;
  let r = Math.max(0, (y / CELL) | 0);
  while (r < rows && g[r * cols + c] === AIR) r++;
  return r * CELL;
}

/** Top of the first solid cell coming down from the sky. */
export function solidTop(G: Grid, x: number): number {
  const g = G.g,
    cols = G.cols,
    rows = G.rows,
    c = clampi((x / CELL) | 0, 0, cols - 1);
  let r = 0;
  while (r < rows && !SOLID[g[r * cols + c]]) r++;
  return r * CELL;
}

export const surfaceY = (G: Grid, x: number): number => floorBelow(G, clampi(x, 0, G.W - 1), 0);

/** Top of the first solid cell at or below y, looking through water and lava. */
export function solidBelow(G: Grid, x: number, y: number): number {
  const g = G.g,
    cols = G.cols,
    rows = G.rows,
    c = clampi((x / CELL) | 0, 0, cols - 1);
  let r = Math.max(0, (y / CELL) | 0);
  while (r < rows && !SOLID[g[r * cols + c]]) r++;
  return r * CELL;
}

/** Mark a cell box changed: repaint it and wake the sim there. */
export function touch(G: Grid, c0: number, r0: number, c1: number, r1: number): void {
  let d: Box | null = G.dirty;
  if (!d) G.dirty = [c0, r0, c1, r1];
  else {
    if (c0 < d[0]) d[0] = c0;
    if (r0 < d[1]) d[1] = r0;
    if (c1 > d[2]) d[2] = c1;
    if (r1 > d[3]) d[3] = r1;
  }
  d = G.act;
  if (!d) G.act = [c0, r0, c1, r1];
  else {
    if (c0 < d[0]) d[0] = c0;
    if (r0 < d[1]) d[1] = r0;
    if (c1 > d[2]) d[2] = c1;
    if (r1 > d[3]) d[3] = r1;
  }
}

/** A carved cell becomes a flying bit that lands as loose dirt or liquid. */
export function fling(rng: Rng, bits: Bit[], px: number, py: number, dx: number, dy: number, r: number, t: number): void {
  if (bits.length > 1500) return;
  const d = Math.hypot(dx, dy) || 1,
    sp = rng.rand(0.4, 1.1) * (80 + r * 2.4);
  bits.push({ x: px, y: py, vx: (dx / d) * sp, vy: (dy / d) * sp * 0.6 - rng.rand(70, 190) - r, t: t === WATER || t === LAVA ? t : LOOSE });
}

/** Remove everything but bedrock in a circle; ej is the share thrown out as debris. */
export function carve(G: Grid, rng: Rng, bits: Bit[], cx: number, cy: number, r: number, ej: number, crumble?: boolean): number {
  const g = G.g,
    cols = G.cols,
    rows = G.rows,
    rr2 = r * r;
  const c0 = Math.max(0, Math.floor((cx - r) / CELL)),
    c1 = Math.min(cols - 1, Math.ceil((cx + r) / CELL));
  const r0 = Math.max(0, Math.floor((cy - r) / CELL)),
    r1 = Math.min(rows - 1, Math.ceil((cy + r) / CELL));
  if (c1 < c0 || r1 < r0) return 0;
  const every = ej > 0 ? Math.max(1, Math.round(1 / ej)) : 0;
  let n = 0;
  if (crumble) {
    const R = r + 7,
      R2 = R * R,
      d0 = Math.max(0, Math.floor((cx - R) / CELL)),
      d1 = Math.min(cols - 1, Math.ceil((cx + R) / CELL)),
      e0 = Math.max(0, Math.floor((cy - R) / CELL)),
      e1 = Math.min(rows - 6, Math.ceil((cy + R) / CELL));
    for (let rw = e0; rw <= e1; rw++) {
      const y = rw * CELL + 1 - cy;
      for (let c = d0; c <= d1; c++) {
        const x = c * CELL + 1 - cx,
          q = x * x + y * y;
        if (q <= rr2 || q > R2) continue;
        const i = rw * cols + c;
        if (g[i] === DIRT || g[i] === TURF) g[i] = LOOSE;
      }
    }
    touch(G, d0 - 1, e0 - 1, d1 + 1, e1 + 1);
  }
  for (let rw = r0; rw <= r1; rw++) {
    const y = rw * CELL + 1 - cy;
    for (let c = c0; c <= c1; c++) {
      const x = c * CELL + 1 - cx;
      if (x * x + y * y > rr2) continue;
      const i = rw * cols + c,
        t = g[i];
      if (t === AIR || t === ROCK) continue;
      g[i] = AIR;
      n++;
      if (every && (t === WATER || t === LAVA ? n % 2 === 0 : n % every === 0)) fling(rng, bits, cx + x, cy + y, x, y, r, t);
    }
  }
  touch(G, c0 - 1, r0 - 1, c1 + 1, r1 + 1);
  return n;
}

/** A flying bit lands: it takes the nearest free cell at or above where it stopped. */
export function deposit(G: Grid, x: number, y: number, t: number): void {
  const g = G.g,
    cols = G.cols,
    c = clampi((x / CELL) | 0, 0, cols - 1);
  let r = Math.min(G.rows - 2, (y / CELL) | 0);
  for (let k = 0; k < 10 && r >= 0; k++, r--)
    if (g[r * cols + c] === AIR) {
      g[r * cols + c] = t;
      touch(G, c, r, c, r);
      return;
    }
}

export const notSolid = (t: number): boolean => !SOLID[t];
export const anyCell = (): boolean => true;
export const onlyAir = (t: number): boolean => t === AIR;
export const onlyDirt = (t: number): boolean => t === DIRT;

/** Paint a box; `only(cellType)` says which cells may be replaced. */
export function fillCells(G: Grid, x0: number, y0: number, x1: number, y1: number, t: number, only: (c: number) => boolean): void {
  const g = G.g,
    cols = G.cols,
    c0 = Math.max(0, (x0 / CELL) | 0),
    c1 = Math.min(cols - 1, (x1 / CELL) | 0),
    r0 = Math.max(0, (y0 / CELL) | 0),
    r1 = Math.min(G.rows - 6, (y1 / CELL) | 0);
  if (c1 < c0 || r1 < r0) return;
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const i = r * cols + c;
      if (g[i] !== ROCK && only(g[i])) g[i] = t;
    }
  touch(G, c0 - 1, r0 - 1, c1 + 1, r1 + 1);
}

/** Paint an ellipse. */
export function blob(G: Grid, cx: number, cy: number, rx: number, ry: number, t: number, only: (c: number) => boolean): void {
  const g = G.g,
    cols = G.cols,
    c0 = Math.max(0, Math.floor((cx - rx) / CELL)),
    c1 = Math.min(cols - 1, Math.ceil((cx + rx) / CELL));
  const r0 = Math.max(0, Math.floor((cy - ry) / CELL)),
    r1 = Math.min(G.rows - 6, Math.ceil((cy + ry) / CELL));
  if (c1 < c0 || r1 < r0) return;
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const dx = (c * CELL + 1 - cx) / rx,
        dy = (r * CELL + 1 - cy) / ry,
        i = r * cols + c;
      if (dx * dx + dy * dy <= 1 && g[i] !== ROCK && only(g[i])) g[i] = t;
    }
  touch(G, c0 - 1, r0 - 1, c1 + 1, r1 + 1);
}

/** Run-length encode the material grid (src/b_world.js:240). */
export function encodeGrid(G: Grid): number[] {
  const g = G.g,
    out: number[] = [];
  let t = g[0],
    n = 0;
  for (let i = 0; i < g.length; i++) {
    if (g[i] === t) n++;
    else {
      out.push(t, n);
      t = g[i];
      n = 1;
    }
  }
  out.push(t, n);
  return out;
}

export function decodeGrid(G: Grid, rle: number[]): void {
  const g = G.g;
  let i = 0;
  for (let k = 0; k < rle.length; k += 2) {
    g.fill(rle[k], i, i + rle[k + 1]);
    i += rle[k + 1];
  }
}
