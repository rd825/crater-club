// Seeded PRNG. Replaces the bare Math.random()-based helpers in src/a_core.js:12-17.
// All engine randomness draws from a per-game Rng instance so a seed reproduces a match
// and unit tests are deterministic.

export interface Rng {
  /** Uniform in [0, 1). */
  random(): number;
  /** Uniform in [a, b). */
  rand(a: number, b: number): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** Random element of a non-empty array. */
  pick<T>(a: readonly T[]): T;
  /** In-place Fisher–Yates shuffle; returns the same array. */
  shuffle<T>(a: T[]): T[];
  /** Standard normal sample (Box–Muller). */
  gauss(): number;
  /** Current internal state, for snapshotting. */
  state(): number;
}

/** mulberry32 — small, fast, good-enough-for-games 32-bit PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  let last = seed >>> 0;
  const random = () => {
    last = (Math.imul(last ^ (last >>> 15), 1 | last) >>> 0) || 1;
    return next();
  };
  const rng: Rng = {
    random,
    rand: (a, b) => a + random() * (b - a),
    int: (n) => (random() * n) | 0,
    pick: (a) => a[(random() * a.length) | 0],
    shuffle: (a) => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = (random() * (i + 1)) | 0;
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    gauss: () => {
      let u = 0;
      while (!u) u = random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * random());
    },
    state: () => last,
  };
  return rng;
}

/** A seed derived from wall-clock time, for live play. */
export const timeSeed = (): number => (Date.now() ^ (Math.random() * 0x100000000)) >>> 0;
