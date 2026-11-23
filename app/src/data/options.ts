// Setup-screen option lists + default settings + a pure validator.
// Ports src/a_core.js:128-149 (the localStorage read itself lives in game/settings.ts).

import { BIOMES } from './biomes.ts';
import { MAXP, TYPES, type PlayerType } from '../engine/constants.ts';

export type Mode = 'volleys' | 'health';
export type Deal = 'draft' | 'random';
export type Teams = 'ffa' | 'teams';

export interface Settings {
  players: { type: PlayerType }[];
  mode: Mode;
  volleys: number;
  health: number;
  deal: Deal;
  teams: Teams;
  confirm: 'on' | 'off';
  size: string;
  biome: string;
  time: string;
  weather: string;
  wind: string;
}

export const OPTS: Record<string, [string, string][]> = {
  mode: [['volleys', 'Most damage dealt'], ['health', 'Last tank standing']],
  deal: [['draft', 'Draft them in turn'], ['random', 'Random deal']],
  confirm: [['on', 'On'], ['off', 'Off']],
  teams: [['ffa', 'Everyone for themselves'], ['teams', 'Two teams, left against right']],
  biome: ([['random', 'Random']] as [string, string][]).concat(Object.keys(BIOMES).map((k) => [k, BIOMES[k].label])),
  size: [['auto', 'Auto'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']],
  time: [['random', 'Random'], ['dawn', 'Dawn'], ['noon', 'Noon'], ['dusk', 'Dusk'], ['night', 'Night']],
  weather: [['random', 'Random'], ['clear', 'Clear'], ['rain', 'Rain'], ['snow', 'Snow'], ['fog', 'Fog'], ['storm', 'Storm'], ['meteors', 'Meteors']],
  wind: [['calm', 'Calm'], ['breeze', 'Breeze'], ['gusty', 'Gusty']],
};

export const DEFAULT_SETTINGS: Settings = {
  players: [{ type: 'human' }, { type: 'regular' }],
  mode: 'volleys',
  volleys: 10,
  health: 150,
  deal: 'draft',
  teams: 'ffa',
  confirm: 'on',
  size: 'auto',
  biome: 'random',
  time: 'random',
  weather: 'clear',
  wind: 'calm',
};

/** Validate a parsed settings blob against OPTS, filling from defaults. Pure (src/a_core.js:143-148). */
export function validateSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS, players: DEFAULT_SETTINGS.players.map((p) => ({ ...p })) };
  if (!raw || typeof raw !== 'object') return out;
  const s = raw as Record<string, unknown>;
  for (const k in OPTS) {
    if (OPTS[k].some((o) => o[0] === s[k])) (out as unknown as Record<string, unknown>)[k] = s[k];
  }
  if (
    Array.isArray(s.players) &&
    s.players.length >= 2 &&
    s.players.length <= MAXP &&
    s.players.every((p) => p && typeof p === 'object' && TYPES.includes((p as { type: string }).type as never))
  ) {
    out.players = (s.players as { type: PlayerType }[]).map((p) => ({ type: p.type }));
  }
  if (Number.isInteger(s.volleys) && (s.volleys as number) >= 1 && (s.volleys as number) <= 60) out.volleys = s.volleys as number;
  if (Number.isInteger(s.health) && (s.health as number) >= 20 && (s.health as number) <= 999) out.health = s.health as number;
  return out;
}
