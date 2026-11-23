// Core engine constants. Ports src/a_core.js:5-23 (the original monolith).
// `W` (world width) is NOT here: in the rewrite it lives on the Game state, not as a mutable global.

export const H = 600; // world height in pixels (fixed)
export const DT = 1 / 120; // fixed simulation timestep (seconds)
export const REF = 1200; // reference world width
export const CELL = 2; // pixels per ground cell
export const MAXP = 8; // maximum players
export const ARSENAL = 10; // weapons per tank in health mode

// Barrel angle range (degrees). 0 = horizontal-right, 90 = straight up, 180 = horizontal-left.
// Extended below horizontal on each side so a tank on high ground can shoot downhill:
// negative = down-right, >180 = down-left.
export const AMIN = -72;
export const AMAX = 252;

export const SIZES = { small: 880, medium: 1200, large: 1600 } as const;
export type SizeKey = keyof typeof SIZES;

// Collision / surface-kind tags returned by hitAt().
export const OOB = 'oob';
export const GROUND = 'ground';
export const LIQ = 'liquid';

// What a 2px ground cell is made of.
export const AIR = 0;
export const DIRT = 1;
export const ROCK = 2;
export const LOOSE = 3;
export const WATER = 4;
export const LAVA = 5;
export const TURF = 6;
export const BUILT = 7;
export const STONE = 8;

// SOLID[t] === 1 for materials a tank stands on / a projectile hits as GROUND.
// Note LOOSE (falling dirt) is solid; WATER and LAVA are not.
export const SOLID = new Uint8Array(16);
for (const t of [DIRT, ROCK, LOOSE, TURF, BUILT, STONE]) SOLID[t] = 1;

export const notSolid = (t: number): boolean => !SOLID[t];
export const isLiquid = (t: number): boolean => t === WATER || t === LAVA;

// Player seats: fixed names + colors (src/a_core.js:8-9).
export const SEATS = [
  { name: 'Mint', c: '#5ee6d0' },
  { name: 'Rose', c: '#ff6b93' },
  { name: 'Amber', c: '#ffa23f' },
  { name: 'Lilac', c: '#c4a1ff' },
  { name: 'Azure', c: '#62b0ff' },
  { name: 'Lime', c: '#b9e04c' },
  { name: 'Pearl', c: '#f1ece4' },
  { name: 'Ruby', c: '#e5533d' },
] as const;

// Palette accents.
export const HAZ = '#fff2b8'; // hazard (owner = -1) color
export const WATERC = '#9fd4f0';
export const LAVAC = '#ff9a3d';
export const INK = '#120d1c';

// Player types available on the setup screen.
export const TYPES = ['human', 'rookie', 'regular', 'veteran', 'ace'] as const;
export type PlayerType = (typeof TYPES)[number] | 'target';
