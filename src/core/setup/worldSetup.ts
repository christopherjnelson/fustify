import {
  DEFAULT_CONTINENT_COUNT,
  DEFAULT_PLAYER_COUNT,
  DEFAULT_TERRITORY_COUNT,
} from '../generation/constants';
import type { TerritoryAssignmentMode } from './startingPositions';

export const WORLD_SETUP_VERSION = 1;
export const MIN_TERRITORY_COUNT = 12;
export const MAX_TERRITORY_COUNT = 48;
export const MIN_CONTINENT_COUNT = 2;
export const MAX_CONTINENT_COUNT = 8;
export const MIN_PLAYER_COUNT = 2;
export const MAX_PLAYER_COUNT = 6;

export interface WorldSetup {
  version: number;
  seed: string;
  territoryCount: number;
  continentCount: number;
  playerCount: number;
  assignmentMode: TerritoryAssignmentMode;
}

export interface ParsedWorldSetup {
  setup: WorldSetup;
  warning: string | null;
}

export const DEFAULT_WORLD_SETUP: Readonly<WorldSetup> = Object.freeze({
  version: WORLD_SETUP_VERSION,
  seed: 'atlas-prime',
  territoryCount: DEFAULT_TERRITORY_COUNT,
  continentCount: DEFAULT_CONTINENT_COUNT,
  playerCount: DEFAULT_PLAYER_COUNT,
  assignmentMode: 'random',
});

function integerInRange(
  value: string | null,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (value === null || !/^-?\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

export function normalizeWorldSetup(
  candidate: Partial<WorldSetup>,
): WorldSetup {
  const territoryCount = Number.isInteger(candidate.territoryCount)
    ? Math.min(
        MAX_TERRITORY_COUNT,
        Math.max(MIN_TERRITORY_COUNT, candidate.territoryCount!),
      )
    : DEFAULT_WORLD_SETUP.territoryCount;
  const continentCount = Number.isInteger(candidate.continentCount)
    ? Math.min(
        territoryCount,
        MAX_CONTINENT_COUNT,
        Math.max(MIN_CONTINENT_COUNT, candidate.continentCount!),
      )
    : DEFAULT_WORLD_SETUP.continentCount;
  const playerCount = Number.isInteger(candidate.playerCount)
    ? Math.min(
        MAX_PLAYER_COUNT,
        Math.max(MIN_PLAYER_COUNT, candidate.playerCount!),
      )
    : DEFAULT_WORLD_SETUP.playerCount;
  const seed = candidate.seed?.trim() || DEFAULT_WORLD_SETUP.seed;
  return {
    version: WORLD_SETUP_VERSION,
    seed,
    territoryCount,
    continentCount,
    playerCount,
    assignmentMode:
      candidate.assignmentMode === 'player-draft' ? 'player-draft' : 'random',
  };
}

export function parseWorldSetup(
  input: URL | URLSearchParams | string,
): ParsedWorldSetup {
  const params =
    input instanceof URL
      ? input.searchParams
      : typeof input === 'string'
        ? new URLSearchParams(input)
        : input;
  const rawVersion = params.get('v');
  if (rawVersion !== null && rawVersion !== String(WORLD_SETUP_VERSION)) {
    return {
      setup: { ...DEFAULT_WORLD_SETUP },
      warning: `Setup version ${rawVersion || '(empty)'} is unsupported; defaults were loaded.`,
    };
  }
  const raw: WorldSetup = {
    version: WORLD_SETUP_VERSION,
    seed: params.get('seed') ?? DEFAULT_WORLD_SETUP.seed,
    territoryCount: integerInRange(
      params.get('territories'),
      MIN_TERRITORY_COUNT,
      MAX_TERRITORY_COUNT,
      DEFAULT_WORLD_SETUP.territoryCount,
    ),
    continentCount: integerInRange(
      params.get('continents'),
      MIN_CONTINENT_COUNT,
      MAX_CONTINENT_COUNT,
      DEFAULT_WORLD_SETUP.continentCount,
    ),
    playerCount: integerInRange(
      params.get('players'),
      MIN_PLAYER_COUNT,
      MAX_PLAYER_COUNT,
      DEFAULT_WORLD_SETUP.playerCount,
    ),
    assignmentMode:
      params.get('assignment') === 'player-draft' ? 'player-draft' : 'random',
  };
  const setup = normalizeWorldSetup(raw);
  const malformed = [
    ['territories', params.get('territories'), setup.territoryCount],
    ['continents', params.get('continents'), setup.continentCount],
    ['players', params.get('players'), setup.playerCount],
  ].some(
    ([, value, normalized]) =>
      value !== null && String(normalized) !== String(value),
  );
  return {
    setup,
    warning: malformed
      ? 'Some setup values were invalid or out of range and were normalized.'
      : null,
  };
}

const SETUP_KEYS = new Set([
  'v',
  'seed',
  'territories',
  'continents',
  'players',
  'assignment',
]);

export function serializeWorldSetup(
  setup: WorldSetup,
  existing: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  const normalized = normalizeWorldSetup(setup);
  const result = new URLSearchParams();
  result.set('v', String(normalized.version));
  result.set('seed', normalized.seed);
  result.set('territories', String(normalized.territoryCount));
  result.set('continents', String(normalized.continentCount));
  result.set('players', String(normalized.playerCount));
  result.set('assignment', normalized.assignmentMode);
  [...existing.entries()]
    .filter(([key]) => !SETUP_KEYS.has(key))
    .sort(([keyA, valueA], [keyB, valueB]) =>
      keyA === keyB ? valueA.localeCompare(valueB) : keyA.localeCompare(keyB),
    )
    .forEach(([key, value]) => result.append(key, value));
  return result;
}

export function worldSetupsEqual(a: WorldSetup, b: WorldSetup): boolean {
  return (
    a.version === b.version &&
    a.seed === b.seed &&
    a.territoryCount === b.territoryCount &&
    a.continentCount === b.continentCount &&
    a.playerCount === b.playerCount &&
    a.assignmentMode === b.assignmentMode
  );
}
