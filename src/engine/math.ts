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

/**
 * Human-readable barrel readout. Angle 0 = horizontal-right, 90 = up, 180 = horizontal-left;
 * below-horizontal shows as a downward arrow (negative angle = down-right, >180 = down-left).
 */
export const aimText = (a: number): string => {
  a = Math.round(a);
  const right = a <= 90;
  const el = right ? a : 180 - a; // elevation: 90 up, 0 level, negative = below horizontal
  if (el === 90) return '90° ↑';
  if (el === 0) return right ? '0° →' : '0° ←';
  const g = el > 0 ? (right ? '↗' : '↖') : right ? '↘' : '↙';
  return Math.abs(el) + '° ' + g;
};
