// AI skill tiers. Verbatim port of src/a_core.js:88-93.
// sa/sp: angle/power error spread. learn: ranging convergence per shot.
// floor: minimum spread multiplier. dodge: dodge probability. smart: tactical flag.

export interface Level {
  label: string;
  sa: number;
  sp: number;
  learn: number;
  floor: number;
  dodge: number;
  smart: number;
}

export const LEVELS: Record<string, Level> = {
  rookie: { label: 'Rookie', sa: 9, sp: 10, learn: 0.93, floor: 0.6, dodge: 0, smart: 0 },
  regular: { label: 'Regular', sa: 4.5, sp: 5.5, learn: 0.8, floor: 0.4, dodge: 0.15, smart: 0.5 },
  veteran: { label: 'Veteran', sa: 2, sp: 2.4, learn: 0.7, floor: 0.3, dodge: 0.35, smart: 1 },
  ace: { label: 'Ace', sa: 0.4, sp: 0.45, learn: 0.6, floor: 0.5, dodge: 0.6, smart: 1 },
};
