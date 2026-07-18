import { createSeededRandom } from '../generation/seededRandom';
import type { PlanetDefinition } from '../types/planet';
import type { LocalPlayerConfig } from './playerConfig';
import {
  analyzeStartingPosition,
  generateStartingPosition,
  startingArmyTotal,
  type DraftingMatchSetup,
  type MatchSetup,
  type NeutralMatchSetup,
  type ReadyMatchSetup,
  type StartingPosition,
  type StartingTerritoryState,
  type TerritoryAssignmentMode,
  type TerritoryDraft,
} from './startingPositions';

export type DraftPickResult =
  | { ok: true; setup: DraftingMatchSetup | ReadyMatchSetup }
  | { ok: false; error: string };

function orderedPlayers(players: LocalPlayerConfig[]) {
  return players
    .slice()
    .sort((left, right) => left.seatIndex - right.seatIndex);
}

export function activeDraftPlayer(setup: DraftingMatchSetup) {
  const players = orderedPlayers(setup.players);
  return players[setup.draft.pickIndex % players.length]!;
}

function draftStartingPosition(
  planet: PlanetDefinition,
  players: LocalPlayerConfig[],
  draft: TerritoryDraft,
  variant: number,
): StartingPosition {
  const territories: Record<string, StartingTerritoryState> =
    Object.fromEntries(
      planet.territories.map((territory) => [
        territory.id,
        { ownerId: draft.territoryOwners[territory.id]!, armyCount: 1 },
      ]),
    );
  const total = startingArmyTotal(players.length);
  const random = createSeededRandom(
    `${planet.seed}|v${planet.generatorVersion}|starting|player-draft|${variant}|armies`,
  );
  for (const player of orderedPlayers(players)) {
    const owned = planet.territories
      .filter((territory) => territories[territory.id]!.ownerId === player.id)
      .map((territory) => territory.id);
    let remaining = total - owned.length;
    let cursor = random.integer(0, Math.max(0, owned.length - 1));
    while (remaining > 0) {
      territories[owned[cursor % owned.length]!]!.armyCount += 1;
      cursor += random.integer(1, Math.max(1, owned.length - 1));
      remaining -= 1;
    }
  }
  return {
    variant,
    candidateIndex: 0,
    territories,
    analysis: analyzeStartingPosition(
      planet,
      orderedPlayers(players),
      territories,
      'player-draft',
    ),
  };
}

export function beginTerritoryAssignment(
  planet: PlanetDefinition,
  setup: NeutralMatchSetup,
): DraftingMatchSetup | ReadyMatchSetup {
  if (setup.assignmentMode === 'random') {
    return {
      ...setup,
      setupPhase: 'ready',
      draft: null,
      startingPosition: generateStartingPosition(
        planet,
        setup.players,
        setup.ownershipVariant,
      ),
    };
  }
  return {
    ...setup,
    assignmentMode: 'player-draft',
    setupPhase: 'assignment-in-progress',
    startingPosition: null,
    draft: { pickIndex: 0, territoryOwners: {} },
  };
}

export function pickDraftTerritory(
  planet: PlanetDefinition,
  setup: DraftingMatchSetup,
  territoryId: string,
): DraftPickResult {
  if (!planet.territories.some((territory) => territory.id === territoryId)) {
    return { ok: false, error: 'That territory is not part of this world.' };
  }
  if (setup.draft.territoryOwners[territoryId]) {
    return { ok: false, error: 'That territory has already been drafted.' };
  }
  const player = activeDraftPlayer(setup);
  const draft: TerritoryDraft = {
    pickIndex: setup.draft.pickIndex + 1,
    territoryOwners: {
      ...setup.draft.territoryOwners,
      [territoryId]: player.id,
    },
  };
  if (draft.pickIndex < planet.territories.length) {
    return { ok: true, setup: { ...setup, draft } };
  }
  return {
    ok: true,
    setup: {
      ...setup,
      setupPhase: 'ready',
      draft,
      startingPosition: draftStartingPosition(
        planet,
        setup.players,
        draft,
        setup.ownershipVariant,
      ),
    },
  };
}

export function restartPlayerDraft(setup: MatchSetup): DraftingMatchSetup {
  return {
    players: setup.players,
    assignmentMode: 'player-draft',
    setupPhase: 'assignment-in-progress',
    ownershipVariant: setup.ownershipVariant,
    startingPosition: null,
    draft: { pickIndex: 0, territoryOwners: {} },
  };
}

export function cancelTerritoryAssignment(
  setup: MatchSetup,
  assignmentMode: TerritoryAssignmentMode = setup.assignmentMode,
): NeutralMatchSetup {
  return {
    players: setup.players,
    assignmentMode,
    setupPhase: 'neutral-preview',
    ownershipVariant: setup.ownershipVariant,
    startingPosition: null,
    draft: null,
  };
}
