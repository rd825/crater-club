// Pure scalar helpers. Ports src/a_core.js:15-18 (minus the rng-bound ones, which live in rng.ts).

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

export const smoothstep = (k: number): number => {
  const t = clamp(k, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Oxford-comma English join: [a] → "a", [a,b] → "a and b", [a,b,c] → "a, b and c". */
export const listNames = (a: string[]): string =>
  a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
