import { writeLocalMatchSave } from '../browser/localSave';
import type { ApplicationMode } from '../core/appFlow';
import { createMatch } from '../core/game/createMatch';
import { makeEvent } from '../core/game/events';
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
  | 'generated-world'
  | 'generate-world-busy'
  | 'pregame'
  | 'pregame-random-ready'
  | 'human-vs-bot-setup'
  | 'multiple-bot-setup'
  | 'pregame-six-seats'
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
  | 'multiplayer-authority'
  | 'multiplayer-reinforcement-active'
  | 'multiplayer-activity-reactions'
  | 'multiplayer-game-over'
  | 'bot-turn'
  | 'bot-reinforcement'
  | 'human-after-bot'
  | 'bot-victory'
  | 'attack-source'
  | 'attack-target'
  | 'attack-confirmation'
  | 'attack-no-legal'
  | 'combat-result'
  | 'pending-capture'
  | 'pending-capture-fixed'
  | 'player-elimination'
  | 'fortification'
  | 'fortification-fixed'
  | 'game-over'
  | 'navigator'
  | 'event-log'
  | 'activity-dock'
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

function oneDieWinningDice() {
  let roll = 0;
  return {
    integer(min: number, max: number) {
      roll += 1;
      return roll === 1 ? max : min;
    },
  };
}

function pendingCapture(
  match: MatchState,
  planet: ReturnType<typeof generatePlanet>,
  eliminateTargetOwner = false,
  fixedAmount = false,
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
      [sourceId]: {
        ...preparedTerritories[sourceId]!,
        armyCount: fixedAmount ? 2 : 12,
      },
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
      attackDice: fixedAmount ? 1 : 3,
    },
    { createCombatRng: fixedAmount ? oneDieWinningDice : winningDice },
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

function withLongActivityHistory(
  match: MatchState,
  planet: ReturnType<typeof generatePlanet>,
): MatchState {
  const next = { ...match, events: [...match.events] };
  const playerIds = Object.keys(match.players);
  const [source, target] = planet.territories;
  const types = [
    'armies-placed',
    'combat',
    'territory-captured',
    'capture-move',
    'fortification-completed',
    'turn-ended',
  ] as const;

  for (let index = 0; index < 48; index += 1) {
    const type = types[index % types.length]!;
    next.events.push(
      makeEvent(next, type, `Activity fixture event ${index + 1}.`, {
        actingPlayerId: playerIds[index % playerIds.length],
        defenderPlayerId: playerIds[(index + 1) % playerIds.length],
        previousOwnerId: playerIds[(index + 1) % playerIds.length],
        sourceTerritoryId: source!.id,
        targetTerritoryId: target!.id,
        primaryTerritoryId: target!.id,
        armyCount: 2,
        attackerLosses: 1,
        defenderLosses: 1,
      }),
    );
  }
  return next;
}

function withActivityReactionReview(
  match: MatchState,
  planet: ReturnType<typeof generatePlanet>,
): MatchState {
  const next = { ...match, events: [] as MatchState['events'] };
  const [actorId, opponentId] = Object.keys(match.players);
  const [source, target] = planet.territories;
  const fixtures = [
    {
      type: 'armies-placed' as const,
      message: 'Reinforcement fixture.',
      details: {
        actingPlayerId: actorId,
        primaryTerritoryId: source!.id,
        armyCount: 3,
      },
    },
    {
      type: 'combat' as const,
      message: 'Combat fixture.',
      details: {
        actingPlayerId: actorId,
        defenderPlayerId: opponentId,
        sourceTerritoryId: source!.id,
        targetTerritoryId: target!.id,
        attackerLosses: 1,
        defenderLosses: 2,
      },
    },
    {
      type: 'territory-captured' as const,
      message: 'Capture fixture.',
      details: {
        actingPlayerId: actorId,
        previousOwnerId: opponentId,
        sourceTerritoryId: source!.id,
        targetTerritoryId: target!.id,
      },
    },
    {
      type: 'fortification-completed' as const,
      message: 'Fortification fixture.',
      details: {
        actingPlayerId: actorId,
        sourceTerritoryId: source!.id,
        targetTerritoryId: target!.id,
        armyCount: 2,
      },
    },
  ];
  for (let repeat = 0; repeat < 2; repeat += 1) {
    for (const fixture of fixtures) {
      next.events.push(
        makeEvent(next, fixture.type, fixture.message, fixture.details),
      );
    }
  }
  return next;
}

export function applyScenario(scenario: VisualScenario) {
  window.localStorage.clear();
  const scenarioSetup =
    scenario === 'minimap-seam'
      ? { ...FIXED_SETUP, seed: 'minimap-fixture-0' }
      : scenario === 'generated-world'
        ? { ...FIXED_SETUP, seed: 'visual-review-generated-world' }
        : scenario === 'pregame-six-seats'
          ? { ...FIXED_SETUP, playerCount: 6 }
          : FIXED_SETUP;
  const fixed = fixedWorld(scenarioSetup);
  const { planet } = fixed;
  let matchSetup: MatchSetup = fixed.matchSetup;
  let match = fixed.match;
  let applicationMode: ApplicationMode = 'world-setup';
  let scenarioMatch: MatchState | null = match;
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
    scenario !== 'generated-world' &&
    scenario !== 'generate-world-busy' &&
    scenario !== 'saved-resume'
  ) {
    applicationMode =
      scenario.startsWith('pregame') || scenario.startsWith('draft')
        ? 'pregame'
        : 'playing';
  }
  if (scenario === 'attack-no-legal') {
    const attack = advanceToAttack(match, planet);
    scenarioMatch = {
      ...attack,
      territories: Object.fromEntries(
        Object.entries(attack.territories).map(([id, territory]) => [
          id,
          { ...territory, ownerId: attack.activePlayerId },
        ]),
      ),
    };
  }
  if (
    scenario === 'human-vs-bot-setup' ||
    scenario === 'multiple-bot-setup' ||
    scenario === 'pregame-six-seats'
  ) {
    applicationMode = 'pregame';
    const botPlayers = fixed.players.map((player, index) => ({
      ...player,
      controllerType:
        scenario === 'multiple-bot-setup' || scenario === 'pregame-six-seats'
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
  if (
    scenario === 'reinforcement' ||
    scenario === 'multiplayer-authority' ||
    scenario === 'multiplayer-reinforcement-active' ||
    scenario === 'navigator'
  ) {
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
  if (
    scenario === 'attack-source' ||
    scenario === 'attack-target' ||
    scenario === 'attack-confirmation'
  ) {
    scenarioMatch = advanceToAttack(match, planet);
    const { sourceId, targetId } = borderPair(scenarioMatch, planet);
    scenarioMatch = gameReducer(planet, scenarioMatch, {
      type: 'SELECT_TERRITORY',
      territoryId: sourceId,
    }).state;
    if (scenario === 'attack-target' || scenario === 'attack-confirmation') {
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
  if (scenario === 'pending-capture-fixed') {
    scenarioMatch = pendingCapture(match, planet, false, true);
  }
  if (scenario === 'player-elimination') {
    scenarioMatch = pendingCapture(match, planet, true);
  }
  if (scenario === 'fortification' || scenario === 'fortification-fixed') {
    scenarioMatch = gameReducer(planet, advanceToAttack(match, planet), {
      type: 'END_ATTACK_PHASE',
    }).state;
    const ownedConnection = planet.connections.find(
      (connection) =>
        scenarioMatch!.territories[connection.fromTerritoryId]!.ownerId ===
          scenarioMatch!.activePlayerId &&
        scenarioMatch!.territories[connection.toTerritoryId]!.ownerId ===
          scenarioMatch!.activePlayerId,
    )!;
    scenarioMatch = {
      ...scenarioMatch,
      territories: {
        ...scenarioMatch.territories,
        [ownedConnection.fromTerritoryId]: {
          ...scenarioMatch.territories[ownedConnection.fromTerritoryId]!,
          armyCount: scenario === 'fortification-fixed' ? 2 : 4,
        },
      },
    };
    scenarioMatch = gameReducer(planet, scenarioMatch, {
      type: 'SELECT_TERRITORY',
      territoryId: ownedConnection.fromTerritoryId,
    }).state;
    scenarioMatch = gameReducer(planet, scenarioMatch, {
      type: 'SELECT_TERRITORY',
      territoryId: ownedConnection.toTerritoryId,
    }).state;
  }
  if (scenario === 'game-over' || scenario === 'multiplayer-game-over') {
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
  if (scenario === 'event-log' || scenario === 'activity-dock') {
    applicationMode = 'playing';
    scenarioMatch = withLongActivityHistory(match, planet);
  }
  if (scenario === 'multiplayer-activity-reactions') {
    applicationMode = 'playing';
    scenarioMatch = withActivityReactionReview(match, planet);
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
    multiplayerSession: scenario.startsWith('multiplayer-')
      ? {
          ownPlayerId: scenarioMatch!.activePlayerId,
          revision: 12,
          stateFingerprint: 'a4'.repeat(32),
          connection: 'SUBSCRIBED',
          pending: false,
          dispatch: async () => {},
        }
      : null,
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
      appendActivityEvents: (count?: number) => void;
      reconcileActivityEvents: () => void;
      orientGlobe: (
        longitude: number,
        latitude?: number,
        distance?: number,
      ) => void;
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
  appendActivityEvents: (count = 1) => {
    const store = useGameStore.getState();
    const match = store.match!;
    const territory = store.planet.territories[0]!;
    const events = [...match.events];
    for (let index = 0; index < count; index += 1) {
      const stateWithEvents = { ...match, events };
      events.push(
        makeEvent(
          stateWithEvents,
          'armies-placed',
          'Appended activity fixture.',
          {
            actingPlayerId: match.activePlayerId,
            primaryTerritoryId: territory.id,
            armyCount: 1,
          },
        ),
      );
    }
    useGameStore.setState({ match: { ...match, events } });
  },
  reconcileActivityEvents: () => {
    const store = useGameStore.getState();
    if (!store.match) return;
    useGameStore.setState({
      match: {
        ...store.match,
        events: store.match.events.map((event) => ({ ...event })),
      },
    });
  },
  orientGlobe: (longitude, latitude = 12, distance = 5.2) => {
    window.dispatchEvent(
      new CustomEvent('fustify:orient-globe', {
        detail: { longitude, latitude, distance },
      }),
    );
  },
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
