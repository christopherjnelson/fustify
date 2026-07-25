import { z } from 'zod';
import type { ApplicationMode } from '../appFlow';
import type { MatchState } from '../game/types';
import { generatePlanet } from '../generation/generatePlanet';
import {
  CURRENT_GENERATOR_VERSION,
  DEFAULT_GENERATOR_VERSION,
  NORMALIZED_GENERATOR_VERSION,
  type WorldGeneratorVersion,
} from '../generation/constants';
import type { WorldSetup } from '../setup/worldSetup';
import {
  analyzeStartingPosition,
  type MatchSetup,
  type ReadyMatchSetup,
  type StartingPosition,
  type TerritoryAssignmentMode,
} from '../setup/startingPositions';

export const SAVE_SCHEMA_VERSION = 5;

export interface LocalMatchSave {
  schemaVersion: number;
  savedAt: string;
  generatorVersion: WorldGeneratorVersion;
  worldSetup: WorldSetup;
  matchSetup: MatchSetup;
  matchState: MatchState | null;
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
  controllerType: z.enum(['local-human', 'heuristic-bot']),
});
const legacyPlayerSchema = playerSchema.omit({ controllerType: true });
const territoryStateSchema = z.object({
  ownerId: z.string().min(1),
  armyCount: z.number().int().min(0),
});
const startingPositionSchema = z.object({
  variant: z.number().int().nonnegative(),
  candidateIndex: z.number().int().nonnegative(),
  territories: z.record(z.string(), territoryStateSchema),
  analysis: z.unknown().optional(),
});
const draftSchema = z.object({
  pickIndex: z.number().int().nonnegative(),
  territoryOwners: z.record(z.string(), z.string().min(1)),
});
const matchSetupSchema = z.object({
  players: z.array(playerSchema).min(2).max(6),
  assignmentMode: z.enum(['random', 'player-draft']),
  setupPhase: z.enum(['neutral-preview', 'assignment-in-progress', 'ready']),
  ownershipVariant: z.number().int().nonnegative(),
  startingPosition: startingPositionSchema.nullable(),
  draft: draftSchema.nullable(),
});
const legacyMatchSetupSchema = z.object({
  players: z.array(legacyPlayerSchema).min(2).max(6),
  ownershipVariant: z.number().int().nonnegative(),
  startingPosition: startingPositionSchema,
});
const worldSetupSchema = z.object({
  version: z.number().int(),
  generatorVersion: z
    .union([
      z.literal(CURRENT_GENERATOR_VERSION),
      z.literal(NORMALIZED_GENERATOR_VERSION),
    ])
    .default(DEFAULT_GENERATOR_VERSION),
  seed: z.string().min(1),
  territoryCount: z.number().int().min(12).max(48),
  continentCount: z.number().int().min(2).max(8),
  playerCount: z.number().int().min(2).max(6),
  assignmentMode: z.enum(['random', 'player-draft']),
});
const versionFourWorldSetupSchema = worldSetupSchema.omit({
  generatorVersion: true,
});
const legacyWorldSetupSchema = worldSetupSchema.omit({
  assignmentMode: true,
  generatorVersion: true,
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
    'attack-phase-ended',
    'fortification-completed',
    'fortification-skipped',
    'turn-ended',
    'match-won',
  ]),
  message: z.string(),
  playerId: z.string().optional(),
  actingPlayerId: z.string().optional(),
  previousPlayerId: z.string().optional(),
  nextPlayerId: z.string().optional(),
  defenderPlayerId: z.string().optional(),
  previousOwnerId: z.string().optional(),
  eliminatedPlayerId: z.string().optional(),
  territoryId: z.string().optional(),
  primaryTerritoryId: z.string().optional(),
  sourceTerritoryId: z.string().optional(),
  targetTerritoryId: z.string().optional(),
  armyCount: z.number().int().positive().optional(),
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
  generatorVersion: z
    .union([
      z.literal(CURRENT_GENERATOR_VERSION),
      z.literal(NORMALIZED_GENERATOR_VERSION),
    ])
    .default(DEFAULT_GENERATOR_VERSION),
  worldSetup: worldSetupSchema,
  matchSetup: matchSetupSchema,
  matchState: matchStateSchema.nullable(),
  applicationMode: z.enum(['pregame', 'handoff', 'playing', 'game-over']),
});

function migrateSave(
  value: Record<string, unknown>,
  version: 0 | 1 | 2 | 3 | 4,
): unknown {
  const oldWorldSetup = legacyWorldSetupSchema.safeParse(value.worldSetup);
  const versionFourWorldSetup = versionFourWorldSetupSchema.safeParse(
    value.worldSetup,
  );
  const oldMatchSetup = legacyMatchSetupSchema.safeParse(value.matchSetup);
  const fullCurrentShape = matchSetupSchema.safeParse(value.matchSetup);
  const currentShape = matchSetupSchema
    .extend({ players: z.array(legacyPlayerSchema).min(2).max(6) })
    .safeParse(value.matchSetup);
  const migratedPlayers = (
    currentShape.success
      ? currentShape.data.players
      : oldMatchSetup.success
        ? oldMatchSetup.data.players
        : []
  ).map((player) => ({ ...player, controllerType: 'local-human' as const }));
  const migratedMatchSetup =
    version === 4 && fullCurrentShape.success
      ? fullCurrentShape.data
      : version === 3 && currentShape.success
        ? { ...currentShape.data, players: migratedPlayers }
        : oldMatchSetup.success
          ? {
              ...oldMatchSetup.data,
              players: migratedPlayers,
              assignmentMode: 'random',
              setupPhase: 'ready',
              draft: null,
            }
          : value.matchSetup;
  return {
    ...value,
    schemaVersion: SAVE_SCHEMA_VERSION,
    generatorVersion: DEFAULT_GENERATOR_VERSION,
    savedAt:
      typeof value.savedAt === 'string'
        ? value.savedAt
        : new Date(0).toISOString(),
    worldSetup:
      version === 4 && versionFourWorldSetup.success
        ? {
            ...versionFourWorldSetup.data,
            generatorVersion: DEFAULT_GENERATOR_VERSION,
          }
        : oldWorldSetup.success
          ? {
              ...oldWorldSetup.data,
              generatorVersion: DEFAULT_GENERATOR_VERSION,
              assignmentMode: 'random',
            }
          : value.worldSetup,
    matchSetup: migratedMatchSetup,
    applicationMode:
      version === 0
        ? value.applicationMode === 'game-over'
          ? 'game-over'
          : 'handoff'
        : value.applicationMode,
  };
}

function rebuildMatchSetup(
  worldSetup: WorldSetup,
  raw: z.infer<typeof matchSetupSchema>,
): MatchSetup | null {
  const planet = generatePlanet(worldSetup.seed, worldSetup);
  const playerIds = new Set(raw.players.map((player) => player.id));
  if (raw.players.length !== worldSetup.playerCount) return null;
  const territoryIds = new Set(
    planet.territories.map((territory) => territory.id),
  );
  const base = {
    players: raw.players,
    assignmentMode: raw.assignmentMode as TerritoryAssignmentMode,
    ownershipVariant: raw.ownershipVariant,
  };
  if (raw.setupPhase === 'neutral-preview') {
    if (raw.startingPosition !== null || raw.draft !== null) return null;
    return {
      ...base,
      setupPhase: 'neutral-preview',
      startingPosition: null,
      draft: null,
    };
  }
  if (raw.setupPhase === 'assignment-in-progress') {
    const expectedPickCounts = raw.players
      .slice()
      .sort((left, right) => left.seatIndex - right.seatIndex)
      .map(
        (_, seatIndex) =>
          Math.floor((raw.draft?.pickIndex ?? 0) / raw.players.length) +
          (seatIndex < (raw.draft?.pickIndex ?? 0) % raw.players.length
            ? 1
            : 0),
      );
    if (
      raw.assignmentMode !== 'player-draft' ||
      raw.startingPosition !== null ||
      raw.draft === null ||
      raw.draft.pickIndex !== Object.keys(raw.draft.territoryOwners).length ||
      raw.draft.pickIndex >= planet.territories.length ||
      Object.entries(raw.draft.territoryOwners).some(
        ([territoryId, ownerId]) =>
          !territoryIds.has(territoryId) || !playerIds.has(ownerId),
      ) ||
      raw.players
        .slice()
        .sort((left, right) => left.seatIndex - right.seatIndex)
        .some(
          (player, seatIndex) =>
            Object.values(raw.draft!.territoryOwners).filter(
              (ownerId) => ownerId === player.id,
            ).length !== expectedPickCounts[seatIndex],
        )
    )
      return null;
    return {
      ...base,
      assignmentMode: 'player-draft',
      setupPhase: 'assignment-in-progress',
      startingPosition: null,
      draft: raw.draft,
    };
  }
  if (raw.startingPosition === null) return null;
  const startingTerritories = raw.startingPosition.territories;
  if (
    Object.keys(startingTerritories).length !== territoryIds.size ||
    Object.entries(startingTerritories).some(
      ([territoryId, state]) =>
        !territoryIds.has(territoryId) ||
        !playerIds.has(state.ownerId) ||
        state.armyCount < 1,
    )
  )
    return null;
  if (
    (raw.assignmentMode === 'random' && raw.draft !== null) ||
    (raw.assignmentMode === 'player-draft' &&
      (raw.draft === null ||
        raw.draft.pickIndex !== planet.territories.length ||
        Object.keys(raw.draft.territoryOwners).length !== territoryIds.size ||
        Object.entries(raw.draft.territoryOwners).some(
          ([territoryId, ownerId]) =>
            startingTerritories[territoryId]?.ownerId !== ownerId,
        )))
  )
    return null;
  const startingPosition: StartingPosition = {
    variant: raw.startingPosition.variant,
    candidateIndex: raw.startingPosition.candidateIndex,
    territories: startingTerritories,
    analysis: analyzeStartingPosition(
      planet,
      raw.players,
      startingTerritories,
      raw.assignmentMode,
    ),
  };
  const ready: ReadyMatchSetup = {
    ...base,
    setupPhase: 'ready',
    startingPosition,
    draft: raw.assignmentMode === 'player-draft' ? raw.draft : null,
  };
  return ready;
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
  if (version > SAVE_SCHEMA_VERSION || version < 0) {
    return { ok: false, error: `Save version ${version} is not supported.` };
  }
  const migrated =
    version === 0 ||
    version === 1 ||
    version === 2 ||
    version === 3 ||
    version === 4;
  if (!migrated && version !== SAVE_SCHEMA_VERSION) {
    return { ok: false, error: `Save version ${version} is not supported.` };
  }
  const parsed = currentSaveSchema.safeParse(
    migrated
      ? migrateSave(
          value as Record<string, unknown>,
          version as 0 | 1 | 2 | 3 | 4,
        )
      : value,
  );
  if (!parsed.success) {
    return { ok: false, error: 'The local save is malformed or incomplete.' };
  }
  const matchSetup = rebuildMatchSetup(
    parsed.data.worldSetup,
    parsed.data.matchSetup,
  );
  if (!matchSetup) {
    return { ok: false, error: 'The saved setup is inconsistent.' };
  }
  const activeMode = ['handoff', 'playing', 'game-over'].includes(
    parsed.data.applicationMode,
  );
  if (
    (activeMode &&
      (parsed.data.matchState === null || matchSetup.setupPhase !== 'ready')) ||
    (!activeMode && parsed.data.matchState !== null)
  ) {
    return { ok: false, error: 'The saved lifecycle state is inconsistent.' };
  }
  return {
    ok: true,
    migrated,
    save: {
      ...parsed.data,
      matchSetup,
      matchState: parsed.data.matchState,
    },
  };
}

export function serializeLocalMatchSave(save: LocalMatchSave): string {
  return JSON.stringify(save);
}
