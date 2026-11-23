import { describe, it, expect } from 'vitest';
import { makeGrid, touch, cellAt } from '../../src/engine/grid.ts';
import { simStep, levelWater } from '../../src/engine/sim.ts';
import { AIR, DIRT, WATER, LAVA, LOOSE, STONE, ROCK, CELL } from '../../src/engine/constants.ts';
import type { Grid } from '../../src/engine/types.ts';

const noSteam = () => {};

function wholeActive(G: Grid) {
  touch(G, 0, 0, G.cols - 1, G.rows - 1);
}

/** Run the sim until it sleeps (act === null) or a step cap is hit. Returns steps taken. */
function settle(G: Grid, cap = 4000): number {
  let n = 0;
  while (G.act && n < cap) {
    simStep(G, noSteam);
    n++;
  }
  // one more to flush the on-sleep levelWater pass
  simStep(G, noSteam);
  return n;
}

function countMat(G: Grid, m: number): number {
  let n = 0;
  for (let i = 0; i < G.g.length; i++) if (G.g[i] === m) n++;
  return n;
}

describe('loose dirt', () => {
  it('falls onto solid ground and the sim sleeps', () => {
    const G = makeGrid(160, 160);
    // bedrock floor
    for (let c = 0; c < G.cols; c++) G.g[(G.rows - 2) * G.cols + c] = ROCK;
    // a single loose cell high up
    const col = 40;
    G.g[2 * G.cols + col] = LOOSE;
    wholeActive(G);
    settle(G);
    expect(G.act).toBeNull(); // sim is asleep
    // the loose cell has fallen (no longer at row 2)
    expect(G.g[2 * G.cols + col]).toBe(AIR);
    expect(countMat(G, LOOSE)).toBe(1); // conserved
  });

  it('piles up rather than vanishing', () => {
    const G = makeGrid(120, 160);
    for (let c = 0; c < G.cols; c++) G.g[(G.rows - 2) * G.cols + c] = ROCK;
    const before = 0;
    for (let i = 0; i < 20; i++) G.g[i % G.cols] = i < G.cols ? LOOSE : G.g[i]; // top row loose
    const start = countMat(G, LOOSE);
    wholeActive(G);
    settle(G);
    expect(countMat(G, LOOSE)).toBe(start);
    expect(before).toBe(0);
  });
});

describe('water', () => {
  it('spreads a tall column across the basin toward the far wall', () => {
    const G = makeGrid(120, 160);
    const cols = G.cols; // 60
    const floorRow = G.rows - 2;
    for (let c = 0; c < cols; c++) G.g[floorRow * cols + c] = ROCK;
    // basin walls at col 10 and col 49 (interior 11..48)
    for (let r = floorRow - 16; r < floorRow; r++) {
      G.g[r * cols + 10] = DIRT;
      G.g[r * cols + 49] = DIRT;
    }
    // a deep block of water against the left wall — enough volume to reach the right wall
    for (let r = floorRow - 12; r < floorRow; r++) for (let c = 11; c <= 18; c++) G.g[r * cols + c] = WATER;
    const startWater = countMat(G, WATER);
    wholeActive(G);
    settle(G);
    expect(countMat(G, WATER)).toBe(startWater); // conserved
    // water reached the right side of the basin near the floor
    let rightWater = 0;
    for (let r = floorRow - 3; r < floorRow; r++) for (let c = 44; c <= 48; c++) if (G.g[r * cols + c] === WATER) rightWater++;
    expect(rightWater).toBeGreaterThan(0);
  });

  it('levelWater is idempotent once settled', () => {
    const G = makeGrid(120, 120);
    const cols = G.cols;
    const floorRow = G.rows - 2;
    for (let c = 0; c < cols; c++) G.g[floorRow * cols + c] = ROCK;
    for (let c = 10; c < cols - 10; c++) G.g[(floorRow - 1) * cols + c] = WATER;
    const snap = Uint8Array.from(G.g);
    levelWater(G);
    expect(Array.from(G.g)).toEqual(Array.from(snap));
  });
});

describe('lava + water reaction', () => {
  it('turns lava to stone and boils off water, emitting steam', () => {
    const G = makeGrid(120, 120);
    const cols = G.cols;
    const floorRow = G.rows - 2;
    for (let c = 0; c < cols; c++) G.g[floorRow * cols + c] = ROCK;
    // adjacent lava and water on the floor
    G.g[(floorRow - 1) * cols + 30] = LAVA;
    G.g[(floorRow - 1) * cols + 31] = WATER;
    let steam = 0;
    touch(G, 0, 0, cols - 1, G.rows - 1);
    for (let i = 0; i < 200 && G.act; i++) simStep(G, () => steam++);
    expect(countMat(G, STONE)).toBeGreaterThan(0);
    expect(steam).toBeGreaterThan(0);
  });
});

describe('sleep/wake', () => {
  it('a fully settled grid of static dirt never wakes', () => {
    const G = makeGrid(120, 120);
    for (let r = 10; r < G.rows; r++) for (let c = 0; c < G.cols; c++) G.g[r * G.cols + c] = DIRT;
    // no touch() → act stays null → sim is asleep immediately
    expect(G.act).toBeNull();
    simStep(G, noSteam);
    expect(G.act).toBeNull();
    expect(cellAt(G, 50, 11 * CELL)).toBe(DIRT);
  });
});
