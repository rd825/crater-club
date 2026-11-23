import { describe, it, expect } from 'vitest';
import { WEAPONS, WEAPON_IDS, KINDS, MYSTERY_POOL, TRACER } from '../../src/data/weapons.ts';
import { BIOMES } from '../../src/data/biomes.ts';
import { TIMES } from '../../src/data/times.ts';
import { WEATHER } from '../../src/data/weather.ts';
import { LEVELS } from '../../src/data/levels.ts';
import { SHAPES } from '../../src/data/shapes.ts';
import { OPTS, validateSettings, DEFAULT_SETTINGS } from '../../src/data/options.ts';

const KNOWN_KINDS = new Set([
  'drill', 'dirt', 'strike', 'fountain', 'cracker', 'sauce', 'mole', 'sink', 'hop', 'thump',
  'level', 'arc', 'steal', 'hole', 'swarm', 'hiccup', 'geyser', 'thunder', 'smoke', 'prism', 'sticky', 'saw',
]);
const KNOWN_SELF = new Set(['bags', 'bubble', 'lift']);

describe('weapons table', () => {
  it('has exactly 50 weapons', () => {
    expect(WEAPON_IDS).toHaveLength(50);
    expect(KINDS).toBe(50);
  });

  it('every weapon has a well-formed spec', () => {
    for (const id of WEAPON_IDS) {
      const w = WEAPONS[id];
      expect(typeof w.name, id).toBe('string');
      expect(typeof w.desc, id).toBe('string');
      expect(typeof w.rating, id).toBe('number');
      expect(typeof w.spec.r, id).toBe('number');
      expect(typeof w.spec.dmg, id).toBe('number');
    }
  });

  it('every spec.kind is a known impact kind', () => {
    for (const id of WEAPON_IDS) {
      const k = WEAPONS[id].spec.kind;
      if (k) expect(KNOWN_KINDS.has(k), `${id} kind ${k}`).toBe(true);
    }
  });

  it('every spec.self is a known self kind', () => {
    for (const id of WEAPON_IDS) {
      const s = WEAPONS[id].spec.self;
      if (s) expect(KNOWN_SELF.has(s), `${id} self ${s}`).toBe(true);
    }
  });

  it('MYSTERY_POOL excludes encore and mystery', () => {
    expect(MYSTERY_POOL).toHaveLength(48);
    expect(MYSTERY_POOL).not.toContain('encore');
    expect(MYSTERY_POOL).not.toContain('mystery');
  });

  it('Tracer is a separate no-damage weapon', () => {
    expect(TRACER.spec.tracer).toBe(true);
    expect(TRACER.spec.dmg).toBe(0);
    expect(TRACER.fan).toEqual([-10, -5, 0, 5, 10]);
  });
});

describe('content tables', () => {
  it('has 7 biomes, 5 times, 6 weather, 4 levels, 4 shapes', () => {
    expect(Object.keys(BIOMES)).toHaveLength(7);
    expect(Object.keys(TIMES)).toHaveLength(5);
    expect(Object.keys(WEATHER)).toHaveLength(6);
    expect(Object.keys(LEVELS)).toHaveLength(4);
    expect(Object.keys(SHAPES)).toHaveLength(4);
  });

  it('islands carry a sea level, caldera burns embers, moon is space', () => {
    expect(BIOMES.islands.sea).toBe(446);
    expect(BIOMES.caldera.embers).toBe(true);
    expect(BIOMES.moon.space).toBe(true);
  });
});

describe('settings validation', () => {
  it('falls back to defaults on garbage', () => {
    expect(validateSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it('accepts valid overrides and rejects bad ones', () => {
    const s = validateSettings({ mode: 'health', volleys: 25, health: 999, biome: 'caldera', bogus: 'x', volleysX: 1 });
    expect(s.mode).toBe('health');
    expect(s.volleys).toBe(25);
    expect(s.health).toBe(999);
    expect(s.biome).toBe('caldera');
    // out-of-range numbers rejected
    expect(validateSettings({ volleys: 0 }).volleys).toBe(DEFAULT_SETTINGS.volleys);
    expect(validateSettings({ volleys: 61 }).volleys).toBe(DEFAULT_SETTINGS.volleys);
    expect(validateSettings({ health: 19 }).health).toBe(DEFAULT_SETTINGS.health);
  });

  it('validates the players array', () => {
    expect(validateSettings({ players: [{ type: 'human' }, { type: 'ace' }] }).players).toEqual([{ type: 'human' }, { type: 'ace' }]);
    // too few / bad type → default
    expect(validateSettings({ players: [{ type: 'human' }] }).players).toEqual(DEFAULT_SETTINGS.players);
    expect(validateSettings({ players: [{ type: 'alien' }, { type: 'human' }] }).players).toEqual(DEFAULT_SETTINGS.players);
  });

  it('OPTS biome list includes random plus all 7 biomes', () => {
    expect(OPTS.biome).toHaveLength(8);
    expect(OPTS.biome[0]).toEqual(['random', 'Random']);
  });
});
