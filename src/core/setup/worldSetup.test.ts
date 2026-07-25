import { describe, expect, it } from 'vitest';
import { generatePlanet } from '../generation/generatePlanet';
import {
  CURRENT_GENERATOR_VERSION,
  NORMALIZED_GENERATOR_PROFILE,
  NORMALIZED_GENERATOR_VERSION,
} from '../generation/constants';
import {
  DEFAULT_WORLD_SETUP,
  MAX_CONTINENT_COUNT,
  MAX_NEW_CONTINENT_COUNT,
  MAX_NEW_PLAYER_COUNT,
  MAX_PLAYER_COUNT,
  MAX_TERRITORY_COUNT,
  MIN_CONTINENT_COUNT,
  MIN_PLAYER_COUNT,
  MIN_TERRITORY_COUNT,
  normalizeWorldSetup,
  normalizeNewWorldSetup,
  parseWorldSetup,
  serializeWorldSetup,
  worldSetupsEqual,
  type WorldSetup,
} from './worldSetup';

describe('versioned world setup URLs', () => {
  it('uses documented defaults for an empty query', () => {
    expect(parseWorldSetup(new URLSearchParams()).setup).toEqual(
      DEFAULT_WORLD_SETUP,
    );
  });

  it('round-trips a valid setup deterministically', () => {
    const setup: WorldSetup = {
      version: 1,
      generatorVersion: CURRENT_GENERATOR_VERSION,
      seed: 'shared-world',
      territoryCount: 36,
      continentCount: 5,
      playerCount: 3,
      assignmentMode: 'player-draft' as const,
    };
    const first = serializeWorldSetup(
      setup,
      new URLSearchParams('z=last&logo=a&a=first'),
    );
    const second = serializeWorldSetup(setup, first);
    expect(first.toString()).toBe(
      'v=1&seed=shared-world&territories=36&continents=5&players=3&assignment=player-draft&a=first&logo=a&z=last',
    );
    expect(second.toString()).toBe(first.toString());
    expect(worldSetupsEqual(parseWorldSetup(first).setup, setup)).toBe(true);
  });

  it('generates the same planet from the same copied setup URL', () => {
    const query = 'v=1&seed=copied&territories=30&continents=5&players=3';
    const a = parseWorldSetup(query).setup;
    const b = parseWorldSetup(query).setup;
    const planetA = generatePlanet(a.seed, a);
    const planetB = generatePlanet(b.seed, b);
    expect(planetB).toEqual(planetA);
  });

  it('keeps old URLs valid and round-trips assignment mode', () => {
    const legacy = parseWorldSetup('v=1&seed=legacy').setup;
    expect(legacy.assignmentMode).toBe('random');
    expect(legacy.generatorVersion).toBe(CURRENT_GENERATOR_VERSION);
    expect(serializeWorldSetup(legacy).has('generator')).toBe(false);
    const drafted = parseWorldSetup(
      'v=1&seed=draft&assignment=player-draft',
    ).setup;
    expect(drafted.assignmentMode).toBe('player-draft');
    expect(serializeWorldSetup(drafted).get('assignment')).toBe('player-draft');
  });

  it('only opts into normalized geometry through explicit version metadata', () => {
    const parsed = parseWorldSetup(
      `v=1&generator=${NORMALIZED_GENERATOR_PROFILE}&seed=normalized`,
    ).setup;
    expect(parsed.generatorVersion).toBe(NORMALIZED_GENERATOR_VERSION);
    expect(serializeWorldSetup(parsed).get('generator')).toBe(
      NORMALIZED_GENERATOR_PROFILE,
    );
    expect(
      generatePlanet(parsed.seed, parsed).generationDiagnostics?.profile,
    ).toBe(NORMALIZED_GENERATOR_PROFILE);
  });

  it('uses defaults for malformed numbers without throwing', () => {
    expect(() =>
      parseWorldSetup('v=1&territories=wat&continents=3.5&players=NaN'),
    ).not.toThrow();
    const parsed = parseWorldSetup(
      'v=1&territories=wat&continents=3.5&players=NaN',
    );
    expect(parsed.setup).toEqual(DEFAULT_WORLD_SETUP);
    expect(parsed.warning).not.toBeNull();
  });

  it('falls back safely for unsupported versions', () => {
    const parsed = parseWorldSetup(
      'v=99&seed=ignored&territories=20&continents=3&players=2',
    );
    expect(parsed.setup).toEqual(DEFAULT_WORLD_SETUP);
    expect(parsed.warning).toContain('unsupported');
  });

  it('enforces count limits and continents not exceeding territories', () => {
    expect(
      normalizeWorldSetup({
        territoryCount: 999,
        continentCount: 999,
        playerCount: 999,
      }),
    ).toMatchObject({
      territoryCount: MAX_TERRITORY_COUNT,
      continentCount: MAX_CONTINENT_COUNT,
      playerCount: MAX_PLAYER_COUNT,
    });
    expect(
      normalizeWorldSetup({
        territoryCount: -1,
        continentCount: -1,
        playerCount: -1,
      }),
    ).toMatchObject({
      territoryCount: MIN_TERRITORY_COUNT,
      continentCount: MIN_CONTINENT_COUNT,
      playerCount: MIN_PLAYER_COUNT,
    });
    expect(() =>
      generatePlanet('minimum-supported-setup', {
        territoryCount: MIN_TERRITORY_COUNT,
        continentCount: MIN_CONTINENT_COUNT,
        playerCount: MAX_PLAYER_COUNT,
      }),
    ).not.toThrow();
    expect(() =>
      generatePlanet('atlas-prime', {
        territoryCount: MAX_TERRITORY_COUNT,
        continentCount: MAX_CONTINENT_COUNT,
        playerCount: DEFAULT_WORLD_SETUP.playerCount,
      }),
    ).not.toThrow();
  });

  it('caps newly created worlds at five continents and five players', () => {
    expect(
      normalizeNewWorldSetup({
        territoryCount: 42,
        continentCount: 6,
        playerCount: 6,
      }),
    ).toMatchObject({
      territoryCount: 42,
      continentCount: MAX_NEW_CONTINENT_COUNT,
      playerCount: MAX_NEW_PLAYER_COUNT,
    });
  });

  it('keeps existing six-continent and six-player URLs compatible', () => {
    expect(
      parseWorldSetup(
        'v=1&seed=existing-six&territories=42&continents=6&players=6',
      ).setup,
    ).toMatchObject({ continentCount: 6, playerCount: 6 });
  });

  it('preserves both logo variants and unknown parameters', () => {
    for (const logo of ['a', 'b']) {
      const serialized = serializeWorldSetup(
        { ...DEFAULT_WORLD_SETUP },
        new URLSearchParams(`logo=${logo}&campaign=summer`),
      );
      expect(serialized.get('logo')).toBe(logo);
      expect(serialized.get('campaign')).toBe('summer');
    }
  });

  it('keeps setup as plain serializable data', () => {
    const setup = parseWorldSetup('v=1&seed=plain').setup;
    expect(JSON.parse(JSON.stringify(setup))).toEqual(setup);
    expect(Object.getPrototypeOf(setup)).toBe(Object.prototype);
  });
});
