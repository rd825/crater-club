// Pure color helpers shared by the engine (tank hi/lo) and the renderer.
// mix() ports src/base.html:1272-1275; hex3() ports src/b_world.js:169.

const parse = (s: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];

/** Blend two #rrggbb colours by k (0 = a, 1 = b). */
export function mix(a: string, b: string, k: number): string {
  const A = parse(a),
    B = parse(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

/** #rrggbb → [r, g, b]. */
export const hex3 = (s: string): [number, number, number] => parse(s);
