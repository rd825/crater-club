import { describe, it, expect } from 'vitest';
import {
  makeGrid,
  cellAt,
  solidAt,
  liquidAt,
  floorBelow,
  solidBelow,
  surfaceY,
  carve,
  fillCells,
  blob,
  encodeGrid,
  decodeGrid,
  anyCell,
  notSolid,
  onlyDirt,
} from '../../src/engine/grid.ts';
import { AIR, DIRT, ROCK, WATER, LAVA, LOOSE, CELL } from '../../src/engine/constants.ts';
import { createRng } from '../../src/engine/rng.ts';
import type { Bit, Grid } from '../../src/engine/types.ts';

const W = 200;
const H = 120;

/** Fill rows >= rowTop with DIRT across the whole grid (a flat floor). */
function floor(G: Grid, rowTop: number, mat = DIRT) {
  for (let r = rowTop; r < G.rows; r++) for (let c = 0; c < G.cols; c++) G.g[r * G.cols + c] = mat;
}

describe('grid accessors & boundaries', () => {
  it('reads AIR above/outside and ROCK below the world', () => {
    const G = makeGrid(W, H);
    expect(cellAt(G, 10, -5)).toBe(AIR);
    expect(cellAt(G, -5, 10)).toBe(AIR);
    expect(cellAt(G, W + 5, 10)).toBe(AIR);
    expect(cellAt(G, 10, H + 50)).toBe(ROCK);
  });

  it('solidAt / liquidAt classify materials', () => {
    const G = makeGrid(W, H);
    G.g[10 * G.cols + 5] = DIRT;
    G.g[10 * G.cols + 6] = WATER;
    expect(solidAt(G, 5 * CELL, 10 * CELL)).toBe(true);
    expect(solidAt(G, 6 * CELL, 10 * CELL)).toBe(false);
    expect(liquidAt(G, 6 * CELL, 10 * CELL)).toBe(true);
  });

  it('floorBelow finds the first non-air (liquid counts), surfaceY scans from the sky', () => {
    const G = makeGrid(W, H);
    floor(G, 40); // dirt from row 40 down
    expect(floorBelow(G, 100, 0)).toBe(40 * CELL);
    expect(surfaceY(G, 100)).toBe(40 * CELL);
    // a water cap above the dirt still counts for floorBelow
    G.g[30 * G.cols + 50] = WATER;
    expect(floorBelow(G, 100, 0)).toBe(30 * CELL);
  });

  it('solidBelow looks through liquid to the first solid', () => {
    const G = makeGrid(W, H);
    floor(G, 40);
    for (let r = 30; r < 40; r++) G.g[r * G.cols + 50] = WATER;
    expect(solidBelow(G, 100, 0)).toBe(40 * CELL);
  });
});

describe('carve', () => {
  it('removes dirt but never bedrock, and reports a count', () => {
    const G = makeGrid(W, H);
    floor(G, 20);
    for (let c = 0; c < G.cols; c++) G.g[(G.rows - 1) * G.cols + c] = ROCK; // bedrock row
    const rng = createRng(1);
    const bits: Bit[] = [];
    const before = G.g.filter((v) => v === ROCK).length;
    const n = carve(G, rng, bits, 100, 60, 20, 0.3);
    expect(n).toBeGreaterThan(0);
    // all bedrock survived
    expect(G.g.filter((v) => v === ROCK).length).toBe(before);
    // a hole exists at the center
    expect(cellAt(G, 100, 60)).toBe(AIR);
  });

  it('crumble turns a shell of dirt into loose', () => {
    const G = makeGrid(W, H);
    floor(G, 10);
    const rng = createRng(2);
    carve(G, rng, [], 100, 60, 16, 0.3, true);
    expect(G.g.some((v) => v === LOOSE)).toBe(true);
  });

  it('arms the dirty + active boxes', () => {
    const G = makeGrid(W, H);
    floor(G, 10);
    carve(G, createRng(3), [], 100, 60, 10, 0);
    expect(G.dirty).not.toBeNull();
    expect(G.act).not.toBeNull();
  });
});

describe('fillCells & blob', () => {
  it('fillCells paints only where the predicate allows, never ROCK', () => {
    const G = makeGrid(W, H);
    floor(G, 10);
    G.g[12 * G.cols + 46] = ROCK; // a ROCK cell inside the fill box
    fillCells(G, 90, 20, 110, 30, WATER, anyCell);
    expect(cellAt(G, 100, 25)).toBe(WATER); // col 50, row 12 — painted
    expect(G.g[12 * G.cols + 46]).toBe(ROCK); // ROCK left untouched
  });

  it('blob paints an ellipse of the material (into dirt via onlyDirt)', () => {
    const G = makeGrid(W, H);
    floor(G, 5);
    blob(G, 100, 60, 20, 10, LAVA, onlyDirt);
    expect(cellAt(G, 100, 60)).toBe(LAVA);
    // outside the ellipse stays dirt
    expect(cellAt(G, 100, 40)).toBe(DIRT);
    // notSolid would NOT paint into dirt (dirt is solid)
    const G2 = makeGrid(W, H);
    floor(G2, 5);
    blob(G2, 100, 60, 20, 10, LAVA, notSolid);
    expect(cellAt(G2, 100, 60)).toBe(DIRT);
  });
});

describe('RLE encode/decode', () => {
  it('round-trips the material grid', () => {
    const G = makeGrid(W, H);
    floor(G, 30);
    carve(G, createRng(9), [], 80, 70, 18, 0.3, true);
    const rle = encodeGrid(G);
    const copy = makeGrid(W, H);
    decodeGrid(copy, rle);
    expect(Array.from(copy.g)).toEqual(Array.from(G.g));
    // RLE pairs sum to the full grid size
    let total = 0;
    for (let i = 1; i < rle.length; i += 2) total += rle[i];
    expect(total).toBe(G.g.length);
  });
});
