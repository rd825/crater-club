// Core engine data shapes. The two big state objects mirror the original globals:
// `Game` (S) and `Grid` (G). Ports src/b_world.js (mkGrid/baseGame/mkTank) + usage across c_play/d_ai_loop.

import type { Biome } from '../data/biomes.ts';
import type { TimeOfDay } from '../data/times.ts';
import type { WeaponSpec } from '../data/weapons.ts';
import type { PlayerType } from './constants.ts';
import type { Rng } from './rng.ts';
import type { UIBridge, AudioBridge } from './bridge.ts';

/** Simulation-only ground grid (no canvas / render caches — those live in the render layer). */
export interface Grid {
  W: number;
  H: number;
  cols: number;
  rows: number;
  g: Uint8Array; // material per cell
  stamp: Uint8Array; // per-cell "moved this step" dedup
  simN: number; // rolling sim step counter
  act: Box | null; // active-sim box (null = sim asleep)
  dirty: Box | null; // repaint box (consumed by the renderer)
  lavaBox: Box | null;
  needLevel: boolean;
}

/** [c0, r0, c1, r1] inclusive cell box. */
export type Box = [number, number, number, number];

export interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number; // material carried (WATER / LAVA / LOOSE)
  rain?: boolean; // a falling raindrop bit (doesn't block settling)
}

export interface MatchConfig {
  players: { type: PlayerType }[];
  mode: 'volleys' | 'health';
  volleys: number;
  health: number;
  teams: 'ffa' | 'teams';
  deal: 'draft' | 'random';
  wind: string;
  size: string;
  biome: string;
  time: string;
  weather: string;
  sandbox?: boolean;
  seed?: number;
}

export interface Env {
  biome: string;
  time: string;
  weather: string;
  size: string;
  W: number;
}

export interface Tank {
  id: number;
  name: string;
  color: string;
  hi: string;
  lo: string;
  x: number;
  y: number;
  vy: number;
  falling: boolean;
  afloat: boolean;
  angle: number;
  power: number;
  weapons: string[];
  sel: number;
  fuel: number;
  moveLeft: number;
  moveDir: number;
  isAI: boolean;
  level: string | null;
  hitLast: number;
  rangeN: number;
  lastFoe: number;
  hp: number;
  dead: boolean;
  shield: number;
  hiccup: boolean;
  pending: string | null;
  recoil: number;
  shaped: boolean;
  fallT: number;
}

/** Projectiles carry the fired weapon's spec flags plus runtime state; hence many optionals. */
export interface Projectile extends WeaponSpec {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: number;
  age: number;
  trail?: number[];
  primary?: boolean;
  dead?: boolean;
  safeAll?: boolean;
  lab?: number; // tracer fan offset label
  // special-mover runtime state
  rolling?: boolean;
  rollT?: number;
  rv?: number;
  moling?: boolean;
  moleT?: number;
  dir?: number;
  deep?: number;
  seek?: boolean;
  ang?: number;
  sp?: number;
  ph?: number;
  life?: number;
  pierced?: boolean;
  pierceT?: number;
}

export interface Boom {
  x: number;
  y: number;
  r: number;
  t: number;
  c: string;
  soft?: boolean;
}
export interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  c: string;
  s: number;
  spark?: boolean;
}
export interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  r: number;
  dark: boolean;
}
export interface Float {
  x: number;
  y: number;
  t: number;
  text: string;
  c: string;
}
export interface Bolt {
  pts: number[];
  t: number;
  c: string;
  straight?: boolean;
}
export interface Hole {
  x: number;
  y: number;
  t: number;
  owner: number;
  r: number;
  dmg: number;
}
export interface Bomb {
  x: number;
  y: number;
  tank: number;
  fuse: number;
  owner: number;
  r: number;
  dmg: number;
}
export interface Smoke {
  x: number;
  y: number;
  r: number;
  turns: number;
  puffs: { dx: number; dy: number; w: number; h: number }[];
}
export interface Prop {
  x: number;
  y0: number;
  s: number;
  f: number; // horizontal flip
}
export interface Drop {
  x: number;
  y: number;
  s: number; // size/seed 0..1
}
export interface Mark {
  x: number;
  y: number;
  lab: number;
}
export interface Banner {
  text: string;
  t: number;
  c: string;
}
export interface AimPlan {
  a0: number;
  p0: number;
  a: number;
  p: number;
  t: number;
  dur: number;
}

export type Phase = 'draft' | 'aim' | 'flight' | 'over';
/** The shape tool currently hovered (ghost preview), or null. */
export type Preview = string | null;

/** The whole game state (the original `S`). */
export interface Game {
  demo: boolean;
  sandbox: boolean;
  taken: number[];
  shotDmg: number;
  cfg: MatchConfig;
  env: Env;
  pal: Biome;
  sky: TimeOfDay;
  g: number; // projectile gravity
  vel: number; // muzzle velocity scale
  health: boolean; // true = last-tank-standing mode
  per: number; // weapons per tank
  teams: boolean;
  teamOf: number[];
  tanks: Tank[];
  live: Tank[];
  scores: number[];
  shots: number[];
  turn: number;
  round: number;
  phase: Phase;
  wind: number;
  lastId: string | null;
  // transient object pools
  projs: Projectile[];
  events: { t: number; fn: () => void }[];
  parts: Part[];
  floats: Float[];
  booms: Boom[];
  bolts: Bolt[];
  props: Prop[];
  drops: Drop[];
  holes: Hole[];
  bombs: Bomb[];
  smokes: Smoke[];
  puffs: Puff[];
  bits: Bit[];
  // fx / camera scalars
  flash: number;
  shake: number;
  time: number;
  tickN: number;
  settleT: number;
  flowT: number;
  hazardDone: boolean;
  burnDone: boolean;
  slowT: number;
  z: number;
  zx: number;
  zy: number;
  dramaAt: number;
  // per-tank round data
  traces: (number[] | null)[];
  marks: (Mark[] | null)[];
  tracerRound: boolean;
  curTrace: number[];
  pool: { id: string; by: number }[];
  pickTurn: number;
  aiPlan: AimPlan | null;
  banner: Banner | null;
  maxHold: number;
  precip: 'rain' | 'snow' | 'embers' | null;
}

export interface DraftView {
  whoName: string;
  whoColor: string;
  whoIsAI: boolean;
  per: number;
  whoCount: number;
  pool: { id: string; by: number }[];
  legal: boolean[]; // which pool cards the current picker may take
  colors: string[]; // per-tank colors, indexed by `by`
  names: string[];
}

export interface GameOverResult {
  title: string;
  color: string;
  rows: { name: string; color: string; isAI: boolean; sub: string; score: string | number }[];
}

/** The engine context threaded through the free functions (mirrors the original shared scope). */
export interface Ctx {
  S: Game;
  G: Grid;
  W: number;
  rng: Rng;
  ui: UIBridge;
  audio: AudioBridge;
  armed: boolean;
  preview: Preview;
  paused: boolean;
  stable: Record<string, unknown>;
}
