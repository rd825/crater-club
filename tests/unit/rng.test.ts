import { describe, it, expect } from 'vitest';
import { createRng } from '../../src/engine/rng.ts';

describe('seeded rng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 20 }, () => a.random());
    const seqB = Array.from({ length: 20 }, () => b.random());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds diverge', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.random()).not.toBe(b.random());
  });

  it('random() stays in [0,1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 5000; i++) {
      const v = r.random();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('rand(a,b) stays in range', () => {
    const r = createRng(99);
    for (let i = 0; i < 2000; i++) {
      const v = r.rand(-5, 12);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(12);
    }
  });

  it('shuffle is a permutation', () => {
    const r = createRng(3);
    const arr = Array.from({ length: 50 }, (_, i) => i);
    const shuffled = r.shuffle(arr.slice());
    expect(shuffled.slice().sort((x, y) => x - y)).toEqual(arr);
    expect(shuffled).not.toEqual(arr); // vanishingly unlikely to be identity
  });

  it('pick returns an element', () => {
    const r = createRng(5);
    const a = ['x', 'y', 'z'];
    for (let i = 0; i < 100; i++) expect(a).toContain(r.pick(a));
  });

  it('gauss is roughly standard normal', () => {
    const r = createRng(2024);
    const n = 20000;
    let sum = 0;
    let sumsq = 0;
    for (let i = 0; i < n; i++) {
      const g = r.gauss();
      sum += g;
      sumsq += g * g;
    }
    const mean = sum / n;
    const variance = sumsq / n - mean * mean;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(variance - 1)).toBeLessThan(0.08);
  });
});
