// Times of day. Verbatim port of src/a_core.js:104-110.

export interface Orb {
  x: number;
  y: number;
  r: number;
  c: string;
  glow: string;
  moon?: boolean;
  earth?: boolean;
}

export interface TimeOfDay {
  label: string;
  sky: [string, string, string, string];
  orb: Orb;
  stars: number;
  ridge: [string, string];
  tint: [number, number, number, number] | null;
  cloud: number;
  haze: string;
}

export const TIMES: Record<string, TimeOfDay> = {
  dawn: { label: 'dawn', sky: ['#2b3a67', '#8e6fa3', '#f2a28c', '#ffd9a6'], orb: { x: 290, y: 392, r: 70, c: '#ffe7b8', glow: '255,214,170' }, stars: 0.2, ridge: ['#8d6f9c', '#614f80'], tint: [255, 150, 110, 0.1], cloud: 0.5, haze: '#f7c2a0' },
  noon: { label: 'noon', sky: ['#2f7fd1', '#69aee8', '#a9d6f5', '#dff1fb'], orb: { x: 900, y: 105, r: 44, c: '#fff7cf', glow: '255,250,210' }, stars: 0, ridge: ['#93b6d6', '#7096ba'], tint: null, cloud: 0.85, haze: '#cfe6f6' },
  dusk: { label: 'dusk', sky: ['#171231', '#4b2a5e', '#c2546e', '#ffb07a'], orb: { x: 815, y: 312, r: 92, c: '#ffdc9c', glow: '255,214,150' }, stars: 0.8, ridge: ['#643363', '#452552'], tint: [60, 20, 70, 0.22], cloud: 0.22, haze: '#e88a7a' },
  night: { label: 'night', sky: ['#05060f', '#0c1230', '#1b2350', '#2d3a6b'], orb: { x: 910, y: 120, r: 34, c: '#e9edff', glow: '200,210,255', moon: true }, stars: 1, ridge: ['#1d2649', '#141a36'], tint: [8, 10, 40, 0.42], cloud: 0.1, haze: '#2d3a6b' },
  space: { label: '', sky: ['#000003', '#04040a', '#080812', '#0d0d18'], orb: { x: 900, y: 130, r: 50, c: '#3f7fd6', glow: '90,150,255', earth: true }, stars: 1, ridge: ['#3c3c48', '#2b2b35'], tint: null, cloud: 0, haze: '#1a1a26' },
};
