// Map generation. Verbatim port of src/b_world.js:244-321.
// Height fields per biome, pad flattening under tanks, rasterizing to cells, and water/lava/cave features.

import { AIR, DIRT, WATER, LAVA, ROCK, TURF, CELL, REF } from './constants.ts';
import { clamp } from './math.ts';
import { blob, onlyDirt } from './grid.ts';
import type { Grid, Tank, LiquidSource } from './types.ts';
import type { Rng } from './rng.ts';

interface Sine {
  a: number;
  f: number;
  p: number;
}

// f exactly matches src/b_world.js:244: (i+1)*rand(0.7,1.3)*Math.PI*2/REF*0.9*(fs||1)
const mkSines = (rng: Rng, amps: number[], fs?: number): Sine[] =>
  amps.map((a, i) => ({ a: a * rng.rand(0.5, 1), f: ((i + 1) * rng.rand(0.7, 1.3) * Math.PI * 2) / REF * 0.9 * (fs || 1), p: rng.rand(0, 6.283) }));

const sines = (x: number, cs: Sine[]): number => {
  let y = 0;
  for (const c of cs) y += c.a * Math.sin(x * c.f + c.p);
  return y;
};

export interface Height {
  h: Float32Array;
  coneX: number;
}

/** Build the raw height field for a biome. Returns coneX (used by caldera features). */
export function genHeight(rng: Rng, biome: string, W: number): Height {
  const h = new Float32Array(W);
  let coneX = 0;
  switch (biome) {
    case 'hills': {
      const b = rng.rand(268, 318),
        cs = mkSines(rng, [104, 62, 36, 20, 11, 6]);
      for (let x = 0; x < W; x++) h[x] = b + sines(x, cs);
      break;
    }
    case 'mesa': {
      const b = rng.rand(278, 312),
        cs = mkSines(rng, [124, 70, 36]),
        n = mkSines(rng, [0, 0, 0, 4, 3, 2]),
        q = 58;
      for (let x = 0; x < W; x++) {
        const t = sines(x, cs) / q,
          f = Math.floor(t),
          s = clamp((t - f - 0.36) / 0.28, 0, 1);
        h[x] = b + (f + s * s * (3 - 2 * s)) * q + sines(x, n);
      }
      break;
    }
    case 'peaks': {
      const cs = mkSines(rng, [1, 1, 1], 1.6),
        amps = [205, 94, 40];
      for (let x = 0; x < W; x++) {
        let y = 500;
        cs.forEach((c, i) => {
          y -= amps[i] * c.a * (1 - Math.abs(Math.sin(x * c.f * 0.5 + c.p)));
        });
        h[x] = y;
      }
      break;
    }
    case 'islands': {
      const b = rng.rand(452, 474),
        cs = mkSines(rng, [102, 64, 34, 16, 8]);
      for (let x = 0; x < W; x++) h[x] = b + sines(x, cs);
      break;
    }
    case 'canyon': {
      const cs = mkSines(rng, [0, 28, 18, 11, 6]),
        c = W / 2 + rng.rand(-60, 60),
        half = W * rng.rand(0.125, 0.167);
      for (let x = 0; x < W; x++) {
        const s = clamp((Math.abs(x - c) - half) / 110, 0, 1);
        h[x] = 466 - s * s * (3 - 2 * s) * 258 + sines(x, cs);
      }
      break;
    }
    case 'caldera': {
      const cs = mkSines(rng, [18, 15, 11, 7, 5]),
        c = (coneX = W / 2 + rng.rand(-90, 90)),
        kk = (57800 * W * W) / (REF * REF);
      for (let x = 0; x < W; x++) {
        const d = x - c;
        h[x] = 446 - 300 * Math.exp((-d * d) / kk) + 96 * Math.exp((-d * d) / 3200) + sines(x, cs);
      }
      break;
    }
    case 'moon': {
      const b = rng.rand(300, 344),
        cs = mkSines(rng, [66, 44, 20, 9]);
      for (let x = 0; x < W; x++) h[x] = b + sines(x, cs);
      for (let i = 0; i < Math.round((9 * W) / REF); i++) {
        const c = rng.rand(40, W - 40),
          R = rng.rand(22, 58),
          dep = R * rng.rand(0.35, 0.55);
        for (let x = Math.max(0, Math.floor(c - 1.35 * R)); x <= Math.min(W - 1, Math.ceil(c + 1.35 * R)); x++) {
          const d = Math.abs(x - c) / R;
          if (d < 1) h[x] += dep * (1 - d * d);
          else if (d < 1.35) h[x] -= dep * 0.28 * (1 - (d - 1) / 0.35);
        }
      }
      break;
    }
    default: {
      const b = rng.rand(268, 318),
        cs = mkSines(rng, [104, 62, 36, 20, 11, 6]);
      for (let x = 0; x < W; x++) h[x] = b + sines(x, cs);
    }
  }
  return { h, coneX };
}

/** Smooth a flat pad under a tank column. */
export function flatten(h: Float32Array, c: number, sea: number, W: number): void {
  c = Math.round(c);
  let s = 0,
    n = 0;
  for (let x = c - 18; x <= c + 18; x++) {
    s += h[clamp(x, 0, W - 1)];
    n++;
  }
  let avg = s / n;
  if (sea && avg > sea - 42) avg = sea - 42;
  for (let x = c - 60; x <= c + 60; x++) {
    if (x < 0 || x >= W) continue;
    const d = Math.abs(x - c),
      w = d <= 18 ? 1 : 1 - (d - 18) / 42,
      k = w * w * (3 - 2 * w);
    h[x] = h[x] * (1 - k) + avg * k;
  }
}

/** Write the height field into the cell grid: bedrock at the bottom, 3 rows of turf, dirt below. */
export function raster(G: Grid, h: Float32Array): void {
  const g = G.g,
    cols = G.cols,
    rows = G.rows;
  for (let c = 0; c < cols; c++) {
    const top = Math.round(h[c * CELL] / CELL);
    for (let r = Math.max(0, top); r < rows; r++) g[r * cols + c] = r >= rows - 5 ? ROCK : r < top + 3 ? TURF : DIRT;
  }
}

/** Water, lava and hollow pockets, kept clear of tank start columns. */
export function features(G: Grid, rng: Rng, biome: string, h: Float32Array, tanks: Tank[], sea: number, coneX: number): void {
  const W = G.W,
    H = G.H;
  const clear = (x: number, pad: number): boolean => tanks.every((t) => Math.abs(t.x - x) > pad);
  const pocket = (t: number, count: number, rx0: number, rx1: number, ry0: number, ry1: number, d0: number, d1: number): void => {
    for (let k = 0, made = 0; k < 30 && made < count; k++) {
      const x = rng.rand(90, W - 90),
        rx = rng.rand(rx0, rx1),
        ry = rng.rand(ry0, ry1),
        y = h[x | 0] + rng.rand(d0, d1);
      if (!clear(x, rx + 50) || y + ry > H - 20) continue;
      blob(G, x, y, rx, ry, t, onlyDirt);
      made++;
    }
  };
  const flood = (level: number, x0: number, x1: number, t: number): void => {
    const g = G.g,
      cols = G.cols,
      rows = G.rows,
      r0 = Math.round(level / CELL);
    for (let c = Math.max(0, (x0 / CELL) | 0); c <= Math.min(cols - 1, (x1 / CELL) | 0); c++)
      for (let r = r0; r < rows && g[r * cols + c] === AIR; r++) g[r * cols + c] = t;
  };
  const lowest = (): number => {
    let bx = 100,
      by = 0;
    for (let x = 80; x < W - 80; x += 4)
      if (h[x] > by && clear(x, 90)) {
        by = h[x];
        bx = x;
      }
    return bx;
  };
  if (biome === 'hills') {
    const x = lowest();
    flood(h[x] - 16, x - 150, x + 150, WATER);
    pocket(WATER, 2, 40, 80, 12, 20, 60, 120);
    pocket(AIR, 1, 40, 70, 12, 18, 50, 100);
  } else if (biome === 'mesa') {
    pocket(AIR, 3, 40, 90, 12, 22, 46, 120);
    pocket(WATER, 1, 40, 60, 10, 16, 70, 120);
  } else if (biome === 'peaks') {
    const x = lowest();
    flood(h[x] - 28, x - 190, x + 190, WATER);
    pocket(AIR, 1, 40, 70, 12, 18, 60, 120);
  } else if (biome === 'islands') {
    flood(sea, 0, W - 1, WATER);
  } else if (biome === 'canyon') {
    const x = lowest();
    flood(h[x] - 18, x - W * 0.2, x + W * 0.2, WATER);
    pocket(LAVA, 1, 60, 100, 12, 18, 150, 200);
    pocket(AIR, 1, 40, 70, 12, 18, 50, 90);
  } else if (biome === 'caldera') {
    let rim = H;
    for (let x = Math.max(0, coneX - 90) | 0; x < Math.min(W, coneX + 90); x++) if (h[x] < rim) rim = h[x];
    flood(rim + 22, coneX - 70, coneX + 70, LAVA);
    blob(G, coneX, Math.min(H - 60, h[coneX | 0] + 150), (130 * W) / REF, 20, LAVA, onlyDirt);
    pocket(LAVA, 1, 40, 70, 10, 14, 80, 130);
  } else if (biome === 'moon') {
    pocket(AIR, 4, 50, 110, 10, 18, 44, 120);
  }
}

/**
 * Living springs and vents: points that keep a biome's water/lava feature topped up turn to turn,
 * so a pond blasted dry fills back in and a volcano re-wells its lava. Deterministic (no rng).
 * Run after `features`, when the liquids are already in the grid, so `target` is their initial volume.
 */
export function makeSources(G: Grid, biome: string, h: Float32Array, tanks: Tank[], coneX: number): LiquidSource[] {
  const W = G.W, H = G.H, cols = G.cols, rows = G.rows, g = G.g, out: LiquidSource[] = [];
  const clear = (x: number, pad: number): boolean => tanks.every((t) => Math.abs(t.x - x) > pad);
  const lowest = (): number => {
    let bx = 100, by = 0;
    for (let x = 80; x < W - 80; x += 4) if (h[x] > by && clear(x, 90)) { by = h[x]; bx = x; }
    return bx;
  };
  const count = (t: number, b: [number, number, number, number]): number => {
    let n = 0;
    for (let r = Math.max(0, b[1]); r <= Math.min(rows - 1, b[3]); r++)
      for (let c = Math.max(0, b[0]); c <= Math.min(cols - 1, b[2]); c++) if (g[r * cols + c] === t) n++;
    return n;
  };
  // A spring that wells WATER out of the higher hillside so it runs down into the pool.
  const spring = (px: number, half: number): void => {
    const box: [number, number, number, number] = [((px - half) / CELL) | 0, ((h[px | 0] - 48) / CELL) | 0, ((px + half) / CELL) | 0, rows - 1];
    const dir = h[clamp(px - half, 0, W - 1) | 0] < h[clamp(px + half, 0, W - 1) | 0] ? -1 : 1;
    const ex = clamp(px + dir * Math.round(half * 0.72), 44, W - 44);
    out.push({ x: ex, y: h[ex | 0] - 6, t: WATER, target: count(WATER, box), box });
  };
  if (biome === 'hills') spring(lowest(), 150);
  else if (biome === 'peaks') spring(lowest(), 190);
  else if (biome === 'canyon') spring(lowest(), W * 0.2);
  else if (biome === 'caldera') {
    const px = Math.round(coneX);
    let rim = H;
    for (let x = Math.max(0, px - 90) | 0; x < Math.min(W, px + 90); x++) if (h[x] < rim) rim = h[x];
    const box: [number, number, number, number] = [((px - 80) / CELL) | 0, (rim / CELL) | 0, ((px + 80) / CELL) | 0, rows - 1];
    out.push({ x: px, y: rim + 14, t: LAVA, target: count(LAVA, box), box, vent: true });
  }
  return out;
}

