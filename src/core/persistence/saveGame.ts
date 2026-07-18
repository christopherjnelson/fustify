import { z } from 'zod';
import type { ApplicationMode } from '../appFlow';
import type { MatchState } from '../game/types';
import { generatePlanet } from '../generation/generatePlanet';
import type { WorldSetup } from '../setup/worldSetup';
import {
  analyzeStartingPosition,
  type MatchSetup,
} from '../setup/startingPositions';

export const SAVE_SCHEMA_VERSION = 2;

export interface LocalMatchSave {
  schemaVersion: number;
  savedAt: string;
  generatorVersion: number;
  worldSetup: WorldSetup;
  matchSetup: MatchSetup;
  matchState: MatchState;
  applicationMode: ApplicationMode;
}

export type SaveParseResult =
  | { ok: true; save: LocalMatchSave; migrated: boolean }
  | { ok: false; error: string };

const playerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  colorId: z.string().min(1),
  seatIndex: z.number().int().min(0).max(5),
});
const territoryStateSchema = z.object({
  ownerId: z.string().min(1),
  armyCount: z.number().int().min(0),
});
const balancePlayerSchema = z.object({
  playerId: z.string(),
  territoryCount: z.number().int().nonnegative(),
  armyCount: z.number().int().nonnegative(),
  connectedComponentCount: z.number().int().nonnegative(),
  largestComponentSize: z.number().int().nonnegative(),
  largestComponentRatio: z.number().min(0).max(1),
  sameOwnerAdjacencyRatio: z.number().min(0).max(1),
  geographicSpread: z.number().min(0).max(1),
  borderTerritoryCount: z.number().int().nonnegative(),
  gatewayTerritoryCount: z.number().int().nonnegative(),
  seaRouteEndpointCount: z.number().int().nonnegative(),
  fullyOwnedContinentCount: z.number().int().nonnegative(),
  maximumContinentShare: z.number().min(0).max(1),
  majorityContinentCount: z.number().int().nonnegative(),
  nearCompleteContinentCount: z.number().int().nonnegative(),
  potentialStartingBonus: z.number().nonnegative(),
  averageDegree: z.number().nonnegative(),
  landmassCount: z.number().int().nonnegative(),
  isolatedTerritoryCount: z.number().int().nonnegative(),
});
const matchSetupSchema = z.object({
  players: z.array(playerSchema).min(2).max(6),
  ownershipVariant: z.number().int().nonnegative(),
  startingPosition: z.object({
    variant: z.number().int().nonnegative(),
    candidateIndex: z.number().int().nonnegative(),
    territories: z.record(z.string(), territoryStateSchema),
    analysis: z.object({
      overallScore: z.number().min(0).max(100),
      rating: z.enum(['excellent', 'good', 'uneven', 'poor']),
      breakdown: z.object({
        territoryParity: z.number().min(0).max(100),
        armyParity: z.number().min(0).max(100),
        continentFairness: z.number().min(0).max(100),
        connectivityDistribution: z.number().min(0).max(100),
        geographicSpread: z.number().min(0).max(100),
        borderExposure: z.number().min(0).max(100),
        seaRouteAccess: z.number().min(0).max(100),
        gatewayAccess: z.number().min(0).max(100),
      }),
      warnings: z.array(z.string()),
      hardFailure: z.boolean(),
      hardFailureReasons: z.array(z.string()),
      players: z.array(balancePlayerSchema),
    }),
  }),
});
const legacyMatchSetupSchema = z.object({
  players: z.array(playerSchema).min(2).max(6),
  ownershipVariant: z.number().int().nonnegative(),
  startingPosition: z.object({
    variant: z.number().int().nonnegative(),
    candidateIndex: z.number().int().nonnegative(),
    territories: z.record(z.string(), territoryStateSchema),
    analysis: z.unknown().optional(),
  }),
});
const worldSetupSchema = z.object({
  version: z.number().int(),
  seed: z.string().min(1),
  territoryCount: z.number().int().min(12).max(48),
  continentCount: z.number().int().min(2).max(8),
  playerCount: z.number().int().min(2).max(6),
});
const eventSchema = z.object({
  id: z.string(),
  turnNumber: z.number().int().positive(),
  type: z.enum([
    'turn-started',
    'reinforcements-received',
    'armies-placed',
    'combat',
    'territory-captured',
    'player-eliminated',
    'capture-move',
    'fortification-completed',
    'fortification-skipped',
    'turn-ended',
    'match-won',
  ]),
  message: z.string(),
  playerId: z.string().optional(),
  territoryId: z.string().optional(),
  attackerRolls: z.array(z.number().int().min(1).max(6)).optional(),
  defenderRolls: z.array(z.number().int().min(1).max(6)).optional(),
  attackerLosses: z.number().int().nonnegative().optional(),
  defenderLosses: z.number().int().nonnegative().optional(),
});
const matchStateSchema = z.object({
  matchId: z.string().min(1),
  seed: z.string().min(1),
  turnNumber: z.number().int().positive(),
  activePlayerId: z.string().min(1),
  phase: z.enum([
    'reinforce',
    'attack',
    'capture',
    'fortify',
    'turn-end',
    'game-over',
  ]),
  remainingReinforcements: z.number().int().nonnegative(),
  territories: z.record(z.string(), territoryStateSchema),
  players: z.record(
    z.string(),
    z.object({ playerId: z.string(), eliminated: z.boolean() }),
  ),
  selectedSourceTerritoryId: z.string().nullable(),
  selectedTargetTerritoryId: z.string().nullable(),
  pendingCapture: z
    .object({
      fromTerritoryId: z.string(),
      toTerritoryId: z.string(),
      minimumArmies: z.number().int().positive(),
    })
    .nullable(),
  combatSequence: z.number().int().nonnegative(),
  fortifiedThisTurn: z.boolean(),
  recentlyCapturedTerritoryId: z.string().nullable(),
  winnerId: z.string().nullable(),
  events: z.array(eventSchema),
});

export function validateMatchState(
  value: unknown,
): { ok: true; state: MatchState } | { ok: false; error: string } {
  const parsed = matchStateSchema.safeParse(value);
  return parsed.success
    ? { ok: true, state: parsed.data }
    : { ok: false, error: 'The match state failed runtime validation.' };
}
const currentSaveSchema = z.object({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION),
  savedAt: z.string().datetime(),
  generatorVersion: z.number().int().positive(),
  worldSetup: worldSetupSchema,
  matchSetup: matchSetupSchema,
  matchState: matchStateSchema,
  applicationMode: z.enum(['handoff', 'playing', 'game-over']),
});

function migrateLegacySave(
  value: Record<string, unknown>,
  version: 0 | 1,
): unknown {
  const migrated: Record<string, unknown> = {
    ...value,
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt:
      typeof value.savedAt === 'string'
        ? value.savedAt
        : new Date(0).toISOString(),
    applicationMode:
      version === 0
        ? value.applicationMode === 'game-over'
          ? 'game-over'
          : 'handoff'
        : value.applicationMode,
  };
  const worldSetup = worldSetupSchema.safeParse(value.worldSetup);
  const matchSetup = legacyMatchSetupSchema.safeParse(value.matchSetup);
  if (!worldSetup.success || !matchSetup.success) return migrated;
  const planet = generatePlanet(worldSetup.data.seed, worldSetup.data);
  migrated.matchSetup = {
    ...matchSetup.data,
    startingPosition: {
      ...matchSetup.data.startingPosition,
      analysis: analyzeStartingPosition(
        planet,
        matchSetup.data.players,
        matchSetup.data.startingPosition.territories,
      ),
    },
  };
  return migrated;
}

export function parseLocalMatchSave(serialized: string): SaveParseResult {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return { ok: false, error: 'The local save is not valid JSON.' };
  }
  if (!value || typeof value !== 'object') {
    return { ok: false, error: 'The local save has an invalid shape.' };
  }
  const version = (value as Record<string, unknown>).schemaVersion;
  if (typeof version !== 'number') {
    return { ok: false, error: 'The local save has no schema version.' };
  }
  if (version > SAVE_SCHEMA_VERSION) {
    return { ok: false, error: `Save version ${version} is not supported.` };
  }
  const migrated = version === 0 || version === 1;
  if (
    version < 0 ||
    (version !== 0 && version !== 1 && version !== SAVE_SCHEMA_VERSION)
  ) {
    return { ok: false, error: `Save version ${version} is not supported.` };
  }
  const parsed = currentSaveSchema.safeParse(
    migrated
      ? migrateLegacySave(value as Record<string, unknown>, version as 0 | 1)
      : value,
  );
  if (!parsed.success) {
    return { ok: false, error: 'The local save is malformed or incomplete.' };
  }
  return { ok: true, save: parsed.data, migrated };
}

export function serializeLocalMatchSave(save: LocalMatchSave): string {
  return JSON.stringify(save);
}
