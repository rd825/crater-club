// Terrain render cache: the offscreen cell-per-pixel canvas + lighting tables.
// Verbatim port of src/b_world.js:168-233 (buildTables / retop / shade), moved to the render
// layer and keyed off engine.gen so it rebuilds when a new map is made.

import { CELL, H, AIR, ROCK, LOOSE, WATER, LAVA, TURF, BUILT, STONE, SOLID } from '../engine/constants.ts';
import { hex3 } from '../engine/color.ts';
import type { Grid, Game } from '../engine/types.ts';

type RGB = number[];

export interface TerrainCache {
  gen: number;
  cv: HTMLCanvasElement;
  cx: CanvasRenderingContext2D;
  img: ImageData;
  px: Uint32Array;
  dR: Float32Array;
  dG: Float32Array;
  dB: Float32Array;
  cTurf: RGB; cLine: RGB; cRock: RGB; cBuilt: RGB; cStone: RGB; cWater: RGB;
  backTop: string; backBot: string;
  top: Int16Array;
  wav: Int8Array;
}

export function makeCache(G: Grid): TerrainCache {
  const cv = document.createElement('canvas');
  cv.width = G.cols; cv.height = G.rows;
  const cx = cv.getContext('2d')!;
  const img = cx.createImageData(G.cols, G.rows);
  return {
    gen: -1, cv, cx, img, px: new Uint32Array(img.data.buffer),
    dR: new Float32Array(G.rows), dG: new Float32Array(G.rows), dB: new Float32Array(G.rows),
    cTurf: [0, 0, 0], cLine: [0, 0, 0], cRock: [0, 0, 0], cBuilt: [0, 0, 0], cStone: [0, 0, 0], cWater: [0, 0, 0],
    backTop: '#000', backBot: '#000', top: new Int16Array(G.cols), wav: new Int8Array(G.cols),
  };
}

export function retop(C: TerrainCache, G: Grid, c0: number, c1: number): void {
  const g = G.g, cols = G.cols, rows = G.rows, top = C.top;
  for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) { let r = 0; while (r < rows && !SOLID[g[r * cols + c]]) r++; top[c] = r; }
}

export function buildTables(C: TerrainCache, G: Grid, S: Game): void {
  const pal = S.pal, rows = G.rows, cols = G.cols, snowy = S.env.weather === 'snow', tm = S.sky.tint || [0, 0, 0, 0];
  const tint = (c: RGB, k: number): RGB => c.map((v, i) => v * (1 - tm[3] * k) + tm[i] * tm[3] * k);
  const top = hex3(pal.top), bot = hex3(pal.bot);
  C.dR = new Float32Array(rows); C.dG = new Float32Array(rows); C.dB = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    const k = Math.min(1, Math.max(0, (r * CELL - 170) / (H - 190))), c = tint(top.map((v, i) => v + (bot[i] - v) * k), 1);
    C.dR[r] = c[0]; C.dG[r] = c[1]; C.dB[r] = c[2];
  }
  C.cTurf = tint(hex3(snowy ? '#e9f0fa' : pal.turf), 1); C.cLine = tint(hex3(snowy ? '#ffffff' : pal.line), 0.4);
  C.cRock = tint([36, 30, 46], 1); C.cBuilt = tint([190, 160, 124], 1); C.cStone = tint([112, 120, 134], 1); C.cWater = tint([44, 126, 196], 0.7);
  const back = tint(bot.map((v) => v * 0.62), 1), rgb = (c: RGB, k: number) => 'rgb(' + c.map((v) => Math.round(v * k)).join(',') + ')';
  C.backTop = rgb(back, 1); C.backBot = rgb(back, 0.5);
  C.top = new Int16Array(cols); retop(C, G, 0, cols - 1);
  C.wav = new Int8Array(cols);
  for (let c = 0; c < cols; c++) C.wav[c] = Math.round(Math.sin(c * 0.045) * 6 + Math.sin(c * 0.013 + 2) * 8);
}

export function shade(C: TerrainCache, G: Grid, c0: number, r0: number, c1: number, r1: number): void {
  const g = G.g, px = C.px, cols = G.cols, rows = G.rows, dR = C.dR, dG = C.dG, dB = C.dB, wav = C.wav;
  const cT = C.cTurf, cL = C.cLine, cK = C.cRock, cU = C.cBuilt, cS = C.cStone, cW = C.cWater;
  c0 = Math.max(0, c0); r0 = Math.max(0, r0); c1 = Math.min(cols - 1, c1); r1 = Math.min(rows - 1, r1);
  if (c1 < c0 || r1 < r0) return;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const i = r * cols + c, t = g[i];
      if (t === AIR) { px[i] = 0; continue; }
      const up = r > 0 ? g[i - cols] : AIR, n = (Math.imul(c, 73856093) ^ Math.imul(r, 19349663)) >>> 0, nz = (n % 11) - 5;
      let R: number, Gc: number, B: number, A = 255;
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
        if (lit) {
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
  C.cx.putImageData(C.img, 0, 0, c0, r0, c1 - c0 + 1, r1 - r0 + 1);
}
