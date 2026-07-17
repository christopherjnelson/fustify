import { gameReducer } from '../game/gameReducer';
import {
  getAttackSources,
  getAttackTargets,
  getFortifyTargets,
  getValidAttackDice,
} from '../game/legalActions';
import { getReinforcementTargets } from '../game/reinforcement';
import type { GameAction, MatchState } from '../game/types';
import { createMatch } from '../game/createMatch';
import { createSeededRandom } from '../generation/seededRandom';
import { generatePlanet } from '../generation/generatePlanet';
import { validateMatchState } from '../persistence/saveGame';
import { createDefaultPlayerConfigs } from '../setup/playerConfig';
import { createMatchSetup, type MatchSetup } from '../setup/startingPositions';
import type { PlanetDefinition } from '../types/planet';

export type BotPolicy = 'conservative' | 'aggressive';

export interface SimulationOptions {
  seed: string;
  territoryCount: number;
  continentCount: number;
  playerCount: number;
  ownershipVariant: number;
  policy: BotPolicy;
  maxActions?: number;
}

export interface SimulationResult {
  worldSeed: string;
  outcome: 'victory' | 'action-limit';
  winnerId: string | null;
  actionCount: number;
  turnNumber: number;
  finalState: MatchState;
}

interface TraceEntry {
  turn: number;
  phase: MatchState['phase'];
  playerId: string;
  action: GameAction;
}

function fail(
  message: string,
  options: SimulationOptions,
  state: MatchState,
  trace: TraceEntry[],
): never {
  const recentEvents = state.events.slice(-8).map((event) => ({
    id: event.id,
    turn: event.turnNumber,
    type: event.type,
    message: event.message,
  }));
  throw new Error(
    `${message}\nSimulation reproduction: ${JSON.stringify(
      {
        seed: options.seed,
        generatorVersion: 3,
        territoryCount: options.territoryCount,
        continentCount: options.continentCount,
        playerCount: options.playerCount,
        ownershipVariant: options.ownershipVariant,
        policy: options.policy,
        turn: state.turnNumber,
        phase: state.phase,
        lastAction: trace.at(-1)?.action ?? null,
        recentActions: trace.slice(-8),
        recentEvents,
      },
      null,
      2,
    )}`,
  );
}

function expectInvariant(
  condition: unknown,
  message: string,
  options: SimulationOptions,
  state: MatchState,
  trace: TraceEntry[],
): asserts condition {
  if (!condition) fail(`Invariant failed: ${message}`, options, state, trace);
}

function assertActionPhase(
  before: MatchState,
  action: GameAction,
  options: SimulationOptions,
  trace: TraceEntry[],
) {
  const valid =
    (before.phase === 'reinforce' && action.type === 'PLACE_REINFORCEMENT') ||
    (before.phase === 'attack' &&
      ['ATTACK', 'END_ATTACK_PHASE'].includes(action.type)) ||
    (before.phase === 'capture' && action.type === 'MOVE_AFTER_CAPTURE') ||
    (before.phase === 'fortify' &&
      ['FORTIFY', 'SKIP_FORTIFY'].includes(action.type)) ||
    (before.phase === 'turn-end' && action.type === 'END_TURN');
  expectInvariant(
    valid,
    `${action.type} is illegal during ${before.phase}`,
    options,
    before,
    trace,
  );
}

function assertInvariants(
  planet: PlanetDefinition,
  previous: MatchState | null,
  state: MatchState,
  action: GameAction | null,
  options: SimulationOptions,
  trace: TraceEntry[],
) {
  expectInvariant(
    validateMatchState(state).ok,
    'runtime match validation',
    options,
    state,
    trace,
  );
  expectInvariant(
    Object.isFrozen(planet),
    'PlanetDefinition is not protected from mutation',
    options,
    state,
    trace,
  );
  expectInvariant(
    Object.keys(state.territories).length === planet.territories.length,
    'territory state count differs from definition',
    options,
    state,
    trace,
  );
  const validOwners = new Set(Object.keys(state.players));
  for (const territory of planet.territories) {
    const current = state.territories[territory.id];
    expectInvariant(
      current && validOwners.has(current.ownerId),
      `${territory.id} has no valid owner`,
      options,
      state,
      trace,
    );
    const isPendingDestination =
      state.phase === 'capture' &&
      state.pendingCapture?.toTerritoryId === territory.id;
    expectInvariant(
      Number.isInteger(current.armyCount) &&
        (current.armyCount >= 1 ||
          (isPendingDestination && current.armyCount === 0)),
      `${territory.id} has invalid army count ${current.armyCount}`,
      options,
      state,
      trace,
    );
  }
  for (const player of Object.values(state.players)) {
    const owned = Object.values(state.territories).filter(
      (territory) => territory.ownerId === player.playerId,
    ).length;
    expectInvariant(
      player.eliminated ? owned === 0 : owned > 0,
      `${player.playerId} elimination does not match ownership`,
      options,
      state,
      trace,
    );
  }
  expectInvariant(
    Boolean(state.players[state.activePlayerId]) &&
      !state.players[state.activePlayerId]!.eliminated,
    'active player is missing or eliminated',
    options,
    state,
    trace,
  );
  expectInvariant(
    Number.isInteger(state.remainingReinforcements) &&
      state.remainingReinforcements >= 0,
    'remaining reinforcements are invalid',
    options,
    state,
    trace,
  );
  expectInvariant(
    state.pendingCapture === null || state.phase === 'capture',
    'pending capture exists outside capture phase',
    options,
    state,
    trace,
  );
  expectInvariant(
    state.phase === 'capture' || state.pendingCapture === null,
    'capture phase lacks pending capture',
    options,
    state,
    trace,
  );
  const fortifications = state.events.filter(
    (event) =>
      event.turnNumber === state.turnNumber &&
      event.type === 'fortification-completed',
  );
  expectInvariant(
    fortifications.length <= 1,
    'more than one fortification in a turn',
    options,
    state,
    trace,
  );
  state.events.forEach((event, index) => {
    expectInvariant(
      event.id === `event-${index + 1}`,
      `event ordering invalid at ${event.id}`,
      options,
      state,
      trace,
    );
    expectInvariant(
      event.turnNumber <= state.turnNumber,
      'event is from a future turn',
      options,
      state,
      trace,
    );
  });
  const living = Object.values(state.players).filter(
    (player) => !player.eliminated,
  );
  if (state.phase === 'game-over') {
    expectInvariant(
      Boolean(state.winnerId) &&
        living.length === 1 &&
        living[0]!.playerId === state.winnerId,
      'game over must have exactly one living winner',
      options,
      state,
      trace,
    );
  } else {
    expectInvariant(
      state.winnerId === null || state.phase === 'capture',
      'winner may only be staged during final capture',
      options,
      state,
      trace,
    );
  }
  expectInvariant(
    JSON.stringify(JSON.parse(JSON.stringify(state))) === JSON.stringify(state),
    'serialization changed semantic state',
    options,
    state,
    trace,
  );
  if (previous && action) {
    assertActionPhase(previous, action, options, trace);
    expectInvariant(
      state.combatSequence >= previous.combatSequence,
      'combat sequence decreased',
      options,
      state,
      trace,
    );
    expectInvariant(
      state.combatSequence - previous.combatSequence ===
        (action.type === 'ATTACK' ? 1 : 0),
      'combat sequence changed outside a combat',
      options,
      state,
      trace,
    );
    expectInvariant(
      previous.activePlayerId === trace.at(-1)!.playerId,
      'a player acted outside their turn',
      options,
      state,
      trace,
    );
    if (action.type === 'ATTACK') {
      const definition = planet.territories.find(
        ({ id }) => id === action.fromTerritoryId,
      )!;
      expectInvariant(
        definition.adjacentTerritoryIds.includes(action.toTerritoryId),
        'combat did not use defined adjacency',
        options,
        state,
        trace,
      );
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function pick<T>(
  values: T[],
  random: ReturnType<typeof createSeededRandom>,
): T | undefined {
  return values.length === 0
    ? undefined
    : values[random.integer(0, values.length - 1)];
}

function chooseAction(
  planet: PlanetDefinition,
  state: MatchState,
  policy: BotPolicy,
  random: ReturnType<typeof createSeededRandom>,
): GameAction {
  if (state.phase === 'reinforce') {
    const owned = getReinforcementTargets(state);
    const borders = owned.filter(
      (id) =>
        getAttackTargets(
          planet,
          {
            ...state,
            territories: {
              ...state.territories,
              [id]: {
                ...state.territories[id]!,
                armyCount: Math.max(2, state.territories[id]!.armyCount),
              },
            },
          },
          id,
        ).length > 0,
    );
    return {
      type: 'PLACE_REINFORCEMENT',
      territoryId: pick(borders, random) ?? pick(owned, random)!,
      amount: state.remainingReinforcements,
    };
  }
  if (state.phase === 'capture') {
    const pending = state.pendingCapture!;
    const maximum = state.territories[pending.fromTerritoryId]!.armyCount - 1;
    return {
      type: 'MOVE_AFTER_CAPTURE',
      fromTerritoryId: pending.fromTerritoryId,
      toTerritoryId: pending.toTerritoryId,
      amount: policy === 'aggressive' ? maximum : pending.minimumArmies,
    };
  }
  if (state.phase === 'attack') {
    const candidates = getAttackSources(state).flatMap((sourceId) =>
      getAttackTargets(planet, state, sourceId).map((targetId) => ({
        sourceId,
        targetId,
      })),
    );
    const favorable = candidates.filter(
      ({ sourceId, targetId }) =>
        state.territories[sourceId]!.armyCount >
        state.territories[targetId]!.armyCount + 1,
    );
    const combatsThisTurn = state.events.filter(
      (event) =>
        event.turnNumber === state.turnNumber && event.type === 'combat',
    ).length;
    const choices = policy === 'aggressive' ? candidates : favorable;
    if (
      choices.length === 0 ||
      (policy === 'conservative' && combatsThisTurn >= 2)
    ) {
      return { type: 'END_ATTACK_PHASE' };
    }
    const choice = pick(choices, random)!;
    const dice = getValidAttackDice(
      state.territories[choice.sourceId]!.armyCount,
    );
    return {
      type: 'ATTACK',
      fromTerritoryId: choice.sourceId,
      toTerritoryId: choice.targetId,
      attackDice: policy === 'aggressive' ? dice.at(-1)! : pick(dice, random)!,
    };
  }
  if (state.phase === 'fortify') {
    const sources = Object.keys(state.territories).filter(
      (id) => getFortifyTargets(planet, state, id).length > 0,
    );
    const sourceId = pick(sources, random);
    if (!sourceId) return { type: 'SKIP_FORTIFY' };
    const targetId = pick(getFortifyTargets(planet, state, sourceId), random)!;
    return {
      type: 'FORTIFY',
      fromTerritoryId: sourceId,
      toTerritoryId: targetId,
      amount:
        policy === 'aggressive'
          ? state.territories[sourceId]!.armyCount - 1
          : 1,
    };
  }
  if (state.phase === 'turn-end') return { type: 'END_TURN' };
  throw new Error(`Cannot choose an action during ${state.phase}`);
}

export function simulateMatch(options: SimulationOptions): SimulationResult {
  const players = createDefaultPlayerConfigs(options.playerCount);
  let planet: PlanetDefinition | null = null;
  let setup: MatchSetup | null = null;
  let generationError: unknown;
  for (let attempt = 0; attempt < 16 && !setup; attempt += 1) {
    const seed =
      attempt === 0 ? options.seed : `${options.seed}-retry-${attempt}`;
    try {
      const candidatePlanet = generatePlanet(seed, options);
      const candidateSetup = createMatchSetup(
        candidatePlanet,
        players,
        options.ownershipVariant,
      );
      planet = candidatePlanet;
      setup = candidateSetup;
    } catch (error) {
      generationError = error;
    }
  }
  if (!planet || !setup) {
    throw new Error(
      `World/setup generation failed after deterministic retries: ${generationError instanceof Error ? generationError.message : String(generationError)}\n` +
        `Simulation reproduction: ${JSON.stringify(
          {
            requestedSeed: options.seed,
            generatorVersion: 3,
            territoryCount: options.territoryCount,
            continentCount: options.continentCount,
            playerCount: options.playerCount,
            ownershipVariant: options.ownershipVariant,
            policy: options.policy,
          },
          null,
          2,
        )}`,
    );
  }
  deepFreeze(planet);
  const runOptions = { ...options, seed: planet.seed };
  let state = createMatch(planet, setup);
  const trace: TraceEntry[] = [];
  const random = createSeededRandom(
    `${planet.seed}|simulation|${options.ownershipVariant}|${options.policy}`,
  );
  assertInvariants(planet, null, state, null, runOptions, trace);
  const maxActions = options.maxActions ?? 2_000;
  for (let actionCount = 0; actionCount < maxActions; actionCount += 1) {
    if (state.phase === 'game-over') {
      return {
        worldSeed: planet.seed,
        outcome: 'victory',
        winnerId: state.winnerId,
        actionCount,
        turnNumber: state.turnNumber,
        finalState: state,
      };
    }
    const action = chooseAction(planet, state, options.policy, random);
    const before = state;
    trace.push({
      turn: before.turnNumber,
      phase: before.phase,
      playerId: before.activePlayerId,
      action,
    });
    const result = gameReducer(planet, before, action);
    if (result.error)
      fail(
        `Legal-action strategy was rejected: ${result.error.code}`,
        runOptions,
        before,
        trace,
      );
    state = result.state;
    assertInvariants(planet, before, state, action, runOptions, trace);
  }
  return {
    worldSeed: planet.seed,
    outcome: state.phase === 'game-over' ? 'victory' : 'action-limit',
    winnerId: state.winnerId,
    actionCount: maxActions,
    turnNumber: state.turnNumber,
    finalState: state,
  };
}
