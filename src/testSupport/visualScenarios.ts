import { writeLocalMatchSave } from '../browser/localSave';
import type { ApplicationMode } from '../core/appFlow';
import { createMatch } from '../core/game/createMatch';
import { gameReducer } from '../core/game/gameReducer';
import type { MatchState } from '../core/game/types';
import { GENERATOR_VERSION } from '../core/generation/constants';
import { generatePlanet } from '../core/generation/generatePlanet';
import { SAVE_SCHEMA_VERSION } from '../core/persistence/saveGame';
import { vectorToGeographicPoint } from '../core/minimap/projection';
import { createDefaultPlayerConfigs } from '../core/setup/playerConfig';
import {
  createMatchSetup,
  createNeutralMatchSetup,
  type MatchSetup,
} from '../core/setup/startingPositions';
import {
  beginTerritoryAssignment,
  pickDraftTerritory,
} from '../core/setup/territoryAssignment';
import type { WorldSetup } from '../core/setup/worldSetup';
import { useGameStore } from '../state/useGameStore';

export type VisualScenario =
  | 'world-setup'
  | 'generate-world-busy'
  | 'pregame'
  | 'pregame-random-ready'
  | 'human-vs-bot-setup'
  | 'multiple-bot-setup'
  | 'draft-started'
  | 'draft-in-progress'
  | 'draft-complete'
  | 'draft-invalid'
  | 'pregame-poor'
  | 'pregame-invalid'
  | 'pregame-expanded'
  | 'pregame-rerolled'
  | 'reroll-busy'
  | 'handoff'
  | 'reinforcement'
  | 'bot-turn'
  | 'bot-reinforcement'
  | 'human-after-bot'
  | 'bot-victory'
  | 'attack-source'
  | 'attack-target'
  | 'combat-result'
  | 'pending-capture'
  | 'player-elimination'
  | 'fortification'
  | 'game-over'
  | 'navigator'
  | 'event-log'
  | 'saved-resume'
  | 'minimap-seam'
  | 'minimap-focus-east'
  | 'minimap-focus-north'
  | 'minimap-focus-west';

const FIXED_SETUP: WorldSetup = {
  version: 1,
  seed: 'visual-review-atlas',
  territoryCount: 42,
  continentCount: 6,
  playerCount: 4,
  assignmentMode: 'random',
};

function fixedWorld(setup: WorldSetup = FIXED_SETUP) {
  const planet = generatePlanet(setup.seed, {
    territoryCount: setup.territoryCount,
    continentCount: setup.continentCount,
    playerCount: setup.playerCount,
  });
  const players = createDefaultPlayerConfigs(setup.playerCount);
  const matchSetup = createMatchSetup(planet, players, 0);
  return {
    planet,
    players,
    matchSetup,
    match: createMatch(planet, matchSetup),
  };
}

function borderPair(
  match: MatchState,
  planet: ReturnType<typeof generatePlanet>,
) {
  const source = planet.territories.find(
    (territory) =>
      match.territories[territory.id]!.ownerId === match.activePlayerId &&
      territory.adjacentTerritoryIds.some(
        (neighbor) =>
          match.territories[neighbor]!.ownerId !== match.activePlayerId,
      ),
  )!;
  const targetId = source.adjacentTerritoryIds.find(
    (neighbor) => match.territories[neighbor]!.ownerId !== match.activePlayerId,
  )!;
  return { sourceId: source.id, targetId };
}

function advanceToAttack(
  match: MatchState,
  planet: ReturnType<typeof generatePlanet>,
): MatchState {
  const { sourceId } = borderPair(match, planet);
  return gameReducer(planet, match, {
    type: 'PLACE_REINFORCEMENT',
    territoryId: sourceId,
    amount: match.remainingReinforcements,
  }).state;
}

function winningDice() {
  let roll = 0;
  return {
    integer(min: number, max: number) {
      roll += 1;
      return roll <= 3 ? max : min;
    },
  };
}

function pendingCapture(
  match: MatchState,
  planet: ReturnType<typeof generatePlanet>,
  eliminateTargetOwner = false,
): MatchState {
  const attack = advanceToAttack(match, planet);
  const { sourceId, targetId } = borderPair(attack, planet);
  const targetOwnerId = attack.territories[targetId]!.ownerId;
  const preparedTerritories = eliminateTargetOwner
    ? Object.fromEntries(
        Object.entries(attack.territories).map(([id, territory]) => [
          id,
          territory.ownerId === targetOwnerId && id !== targetId
            ? { ...territory, ownerId: attack.activePlayerId }
            : territory,
        ]),
      )
    : attack.territories;
  const prepared: MatchState = {
    ...attack,
    territories: {
      ...preparedTerritories,
      [sourceId]: { ...preparedTerritories[sourceId]!, armyCount: 12 },
      [targetId]: { ...preparedTerritories[targetId]!, armyCount: 1 },
    },
  };
  return gameReducer(
    planet,
    prepared,
    {
      type: 'ATTACK',
      fromTerritoryId: sourceId,
      toTerritoryId: targetId,
      attackDice: 3,
    },
    { createCombatRng: winningDice },
  ).state;
}

function combatResult(
  match: MatchState,
  planet: ReturnType<typeof generatePlanet>,
): MatchState {
  const attack = advanceToAttack(match, planet);
  const { sourceId, targetId } = borderPair(attack, planet);
  const prepared: MatchState = {
    ...attack,
    territories: {
      ...attack.territories,
      [sourceId]: { ...attack.territories[sourceId]!, armyCount: 8 },
      [targetId]: { ...attack.territories[targetId]!, armyCount: 5 },
    },
  };
  return gameReducer(
    planet,
    prepared,
    {
      type: 'ATTACK',
      fromTerritoryId: sourceId,
      toTerritoryId: targetId,
      attackDice: 3,
    },
    { createCombatRng: () => ({ integer: () => 4 }) },
  ).state;
}

function wonMatch(
  match: MatchState,
  planet: ReturnType<typeof generatePlanet>,
): MatchState {
  const connection = planet.connections[0]!;
  const sourceId = connection.fromTerritoryId;
  const targetId = connection.toTerritoryId;
  const activePlayerId = match.activePlayerId;
  const defeatedPlayerId = Object.keys(match.players).find(
    (id) => id !== activePlayerId,
  )!;
  const prepared: MatchState = {
    ...match,
    phase: 'attack',
    remainingReinforcements: 0,
    territories: Object.fromEntries(
      Object.keys(match.territories).map((id) => [
        id,
        {
          ownerId: id === targetId ? defeatedPlayerId : activePlayerId,
          armyCount: id === sourceId ? 12 : 1,
        },
      ]),
    ),
  };
  const attacked = gameReducer(
    planet,
    prepared,
    {
      type: 'ATTACK',
      fromTerritoryId: sourceId,
      toTerritoryId: targetId,
      attackDice: 3,
    },
    { createCombatRng: winningDice },
  ).state;
  return gameReducer(planet, attacked, {
    type: 'MOVE_AFTER_CAPTURE',
    fromTerritoryId: sourceId,
    toTerritoryId: targetId,
    amount: 3,
  }).state;
}

function applyScenario(scenario: VisualScenario) {
  window.localStorage.clear();
  const scenarioSetup =
    scenario === 'minimap-seam'
      ? { ...FIXED_SETUP, seed: 'minimap-fixture-0' }
      : FIXED_SETUP;
  const fixed = fixedWorld(scenarioSetup);
  const { planet } = fixed;
  let matchSetup: MatchSetup = fixed.matchSetup;
  let match = fixed.match;
  let applicationMode: ApplicationMode = 'world-setup';
  let scenarioMatch: MatchState | null = match;
  let eventLogOpen = false;
  let assignmentFeedback: string | null = null;
  let botExecution = useGameStore.getState().botExecution;
  const scenarioFocus =
    scenario === 'minimap-focus-east'
      ? { longitude: 35, latitude: 8 }
      : scenario === 'minimap-focus-north'
        ? { longitude: 120, latitude: 68 }
        : scenario === 'minimap-focus-west'
          ? { longitude: -142, latitude: -24 }
          : { longitude: 90, latitude: 0 };
  const focusScenario = scenario.startsWith('minimap-focus-');
  const focusTargetTerritoryId = focusScenario
    ? planet.territories
        .map((territory) => {
          const point = vectorToGeographicPoint(territory.center);
          const longitudeDistance = Math.min(
            Math.abs(point.longitude - scenarioFocus.longitude),
            360 - Math.abs(point.longitude - scenarioFocus.longitude),
          );
          return {
            id: territory.id,
            distance:
              longitudeDistance ** 2 +
              (point.latitude - scenarioFocus.latitude) ** 2,
          };
        })
        .sort((left, right) => left.distance - right.distance)[0]!.id
    : null;

  if (
    scenario !== 'world-setup' &&
    scenario !== 'generate-world-busy' &&
    scenario !== 'saved-resume'
  ) {
    applicationMode =
      scenario.startsWith('pregame') || scenario.startsWith('draft')
        ? 'pregame'
        : 'playing';
  }
  if (scenario === 'human-vs-bot-setup' || scenario === 'multiple-bot-setup') {
    applicationMode = 'pregame';
    const botPlayers = fixed.players.map((player, index) => ({
      ...player,
      controllerType:
        scenario === 'multiple-bot-setup'
          ? index === 0
            ? ('local-human' as const)
            : ('heuristic-bot' as const)
          : index === 1
            ? ('heuristic-bot' as const)
            : ('local-human' as const),
    }));
    matchSetup = createNeutralMatchSetup(botPlayers, 'random');
    scenarioMatch = null;
  }
  if (
    scenario === 'world-setup' ||
    scenario === 'generate-world-busy' ||
    scenario === 'pregame' ||
    scenario === 'minimap-seam'
  ) {
    matchSetup = createNeutralMatchSetup(fixed.players, 'random');
    scenarioMatch = null;
  }
  if (scenario === 'minimap-seam') applicationMode = 'pregame';
  if (scenario === 'pregame-random-ready') {
    scenarioMatch = null;
  }
  if (
    scenario === 'draft-started' ||
    scenario === 'draft-in-progress' ||
    scenario === 'draft-complete' ||
    scenario === 'draft-invalid'
  ) {
    const neutral = createNeutralMatchSetup(fixed.players, 'player-draft');
    let draftSetup = beginTerritoryAssignment(planet, neutral);
    if (draftSetup.setupPhase !== 'assignment-in-progress') {
      throw new Error('Visual draft scenario did not begin.');
    }
    const pickCount =
      scenario === 'draft-complete'
        ? planet.territories.length
        : scenario === 'draft-started'
          ? 0
          : 8;
    for (const territory of planet.territories.slice(0, pickCount)) {
      if (draftSetup.setupPhase !== 'assignment-in-progress') break;
      const result = pickDraftTerritory(planet, draftSetup, territory.id);
      if (!result.ok) throw new Error(result.error);
      draftSetup = result.setup;
    }
    matchSetup = draftSetup;
    scenarioMatch = null;
    if (scenario === 'draft-invalid') {
      assignmentFeedback = 'That territory has already been drafted.';
    }
  }
  if (scenario === 'pregame-rerolled') {
    matchSetup = createMatchSetup(planet, fixed.players, 1);
    match = createMatch(planet, matchSetup);
    scenarioMatch = null;
  }
  if (scenario === 'reroll-busy') {
    applicationMode = 'pregame';
    scenarioMatch = null;
  }
  if (scenario === 'pregame-poor') {
    if (matchSetup.setupPhase !== 'ready')
      throw new Error('Expected ready setup.');
    matchSetup = {
      ...matchSetup,
      startingPosition: {
        ...matchSetup.startingPosition,
        analysis: {
          ...matchSetup.startingPosition.analysis,
          overallScore: 48,
          rating: 'poor',
          warnings: [
            'Azure Pact has one sea-route endpoint; the table average is 3.0.',
            'Verdant Order has three isolated territories.',
          ],
        },
      },
    };
  }
  if (scenario === 'pregame-invalid') {
    if (matchSetup.setupPhase !== 'ready')
      throw new Error('Expected ready setup.');
    matchSetup = {
      ...matchSetup,
      startingPosition: {
        ...matchSetup.startingPosition,
        analysis: {
          ...matchSetup.startingPosition.analysis,
          overallScore: 36,
          rating: 'poor',
          hardFailure: true,
          hardFailureReasons: [
            'Crimson League begins with all of Golden March.',
          ],
        },
      },
    };
  }
  if (applicationMode === 'pregame') scenarioMatch = null;
  if (scenario === 'handoff') applicationMode = 'handoff';
  if (scenario === 'reinforcement' || scenario === 'navigator') {
    applicationMode = 'playing';
  }
  if (
    scenario === 'bot-turn' ||
    scenario === 'bot-reinforcement' ||
    scenario === 'human-after-bot'
  ) {
    applicationMode = 'playing';
    const botPlayers = fixed.players.map((player, index) => ({
      ...player,
      controllerType:
        index === 0 && scenario !== 'human-after-bot'
          ? ('heuristic-bot' as const)
          : ('local-human' as const),
    }));
    matchSetup = { ...fixed.matchSetup, players: botPlayers };
    scenarioMatch = match;
    if (scenario !== 'human-after-bot') {
      const { sourceId } = borderPair(match, planet);
      botExecution = {
        phase: scenario === 'bot-turn' ? 'thinking' : 'applying',
        playerId: match.activePlayerId,
        summary:
          scenario === 'bot-turn'
            ? 'Crimson League is choosing a legal action.'
            : `Reinforced ${planet.territories.find((item) => item.id === sourceId)!.name} against hostile borders.`,
        error: null,
        sourceTerritoryId: scenario === 'bot-reinforcement' ? sourceId : null,
        targetTerritoryId: null,
      };
    }
  }
  if (scenario === 'attack-source' || scenario === 'attack-target') {
    scenarioMatch = advanceToAttack(match, planet);
    const { sourceId, targetId } = borderPair(scenarioMatch, planet);
    scenarioMatch = gameReducer(planet, scenarioMatch, {
      type: 'SELECT_TERRITORY',
      territoryId: sourceId,
    }).state;
    if (scenario === 'attack-target') {
      scenarioMatch = gameReducer(planet, scenarioMatch, {
        type: 'SELECT_TERRITORY',
        territoryId: targetId,
      }).state;
    }
  }
  if (scenario === 'combat-result') {
    scenarioMatch = combatResult(match, planet);
  }
  if (scenario === 'pending-capture') {
    scenarioMatch = pendingCapture(match, planet);
  }
  if (scenario === 'player-elimination') {
    scenarioMatch = pendingCapture(match, planet, true);
    eventLogOpen = true;
  }
  if (scenario === 'fortification') {
    scenarioMatch = gameReducer(planet, advanceToAttack(match, planet), {
      type: 'END_ATTACK_PHASE',
    }).state;
  }
  if (scenario === 'game-over') {
    scenarioMatch = wonMatch(match, planet);
    applicationMode = 'game-over';
  }
  if (scenario === 'bot-victory') {
    scenarioMatch = wonMatch(match, planet);
    applicationMode = 'game-over';
    matchSetup = {
      ...fixed.matchSetup,
      players: fixed.players.map((player) => ({
        ...player,
        controllerType:
          player.id === scenarioMatch!.winnerId
            ? ('heuristic-bot' as const)
            : ('local-human' as const),
      })),
    };
  }
  if (scenario === 'event-log') {
    applicationMode = 'playing';
    eventLogOpen = true;
  }
  if (scenario === 'saved-resume') {
    const savedAt = '2026-07-17T12:00:00.000Z';
    writeLocalMatchSave({
      schemaVersion: SAVE_SCHEMA_VERSION,
      savedAt,
      generatorVersion: GENERATOR_VERSION,
      worldSetup: FIXED_SETUP,
      matchSetup,
      matchState: match,
      applicationMode: 'playing',
    });
    useGameStore.setState({
      savedMatchAvailable: true,
      savedAt,
      saveError: null,
    });
  }

  useGameStore.setState({
    applicationMode,
    setup: scenarioSetup,
    setupDraft: scenarioSetup,
    seedInput: scenarioSetup.seed,
    setupError: null,
    setupWarning: null,
    assignmentFeedback,
    planet,
    matchSetup,
    match: scenarioMatch,
    handoffSummary: { previousTurn: null, messages: [] },
    eventLogOpen,
    hoveredTerritoryId: null,
    lastActionError: null,
    focusTargetTerritoryId,
    focusSequence: focusScenario ? 1 : 0,
    globeFocus: scenarioFocus,
    setupOperation:
      scenario === 'generate-world-busy'
        ? 'generate-world'
        : scenario === 'reroll-busy'
          ? 'reroll-territories'
          : null,
    botExecution,
  });
}

declare global {
  interface Window {
    __WORLDSEED_VISUAL__?: {
      loadScenario: (scenario: VisualScenario) => void;
      getState: () => {
        mode: ApplicationMode;
        phase: MatchState['phase'];
        hasMatch: boolean;
        setupPhase: MatchSetup['setupPhase'];
        assignmentMode: MatchSetup['assignmentMode'];
        draftPickIndex: number | null;
        draftOwners: Record<string, string>;
        focusSequence: number;
        focusTargetTerritoryId: string | null;
        globeFocus: { longitude: number; latitude: number };
        match: MatchState;
        planet: ReturnType<typeof generatePlanet>;
        ownershipVariant: number;
      };
      dispatch: (action: Parameters<typeof gameReducer>[2]) => void;
      save: () => void;
      prepareAttack: (type: 'land-border' | 'sea-route') => void;
    };
  }
}

window.__WORLDSEED_VISUAL__ = {
  loadScenario: applyScenario,
  getState: () => {
    const state = useGameStore.getState();
    const fallbackMatch = fixedWorld().match;
    return {
      mode: state.applicationMode,
      phase: state.match?.phase ?? fallbackMatch.phase,
      hasMatch: state.match !== null,
      setupPhase: state.matchSetup.setupPhase,
      assignmentMode: state.matchSetup.assignmentMode,
      draftPickIndex:
        state.matchSetup.setupPhase === 'assignment-in-progress'
          ? state.matchSetup.draft.pickIndex
          : (state.matchSetup.draft?.pickIndex ?? null),
      draftOwners:
        state.matchSetup.setupPhase === 'assignment-in-progress'
          ? structuredClone(state.matchSetup.draft.territoryOwners)
          : structuredClone(state.matchSetup.draft?.territoryOwners ?? {}),
      focusSequence: state.focusSequence,
      focusTargetTerritoryId: state.focusTargetTerritoryId,
      globeFocus: state.globeFocus,
      match: structuredClone(state.match ?? fallbackMatch),
      planet: structuredClone(state.planet),
      ownershipVariant: state.matchSetup.ownershipVariant,
    };
  },
  dispatch: (action) => useGameStore.getState().dispatchGameAction(action),
  save: () => useGameStore.getState().saveMatch(),
  prepareAttack: (type) => {
    const store = useGameStore.getState();
    const match = advanceToAttack(store.match!, store.planet);
    const connection = store.planet.connections.find(
      (item) => item.type === type,
    )!;
    const otherPlayerId = Object.keys(match.players).find(
      (id) => id !== match.activePlayerId,
    )!;
    const prepared: MatchState = {
      ...match,
      selectedSourceTerritoryId: null,
      selectedTargetTerritoryId: null,
      territories: {
        ...match.territories,
        [connection.fromTerritoryId]: {
          ownerId: match.activePlayerId,
          armyCount: 8,
        },
        [connection.toTerritoryId]: { ownerId: otherPlayerId, armyCount: 5 },
      },
    };
    const sourceSelected = gameReducer(store.planet, prepared, {
      type: 'SELECT_TERRITORY',
      territoryId: connection.fromTerritoryId,
    }).state;
    const targetSelected = gameReducer(store.planet, sourceSelected, {
      type: 'SELECT_TERRITORY',
      territoryId: connection.toTerritoryId,
    }).state;
    useGameStore.setState({ match: targetSelected, lastActionError: null });
  },
};
