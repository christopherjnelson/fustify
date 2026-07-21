import {
  controllerDecisionSeed,
  createGameObservation,
  deterministicFallback,
  getLegalGameCommands,
  heuristicController,
  HEURISTIC_CONTROLLER_VERSION,
  type GameCommand,
} from '../controllers';
import { createMatch } from '../game/createMatch';
import { gameReducer } from '../game/gameReducer';
import type { MatchState } from '../game/types';
import { getFullyOwnedContinents } from '../game/reinforcement';
import { generatePlanet } from '../generation/generatePlanet';
import { createDefaultPlayerConfigs } from '../setup/playerConfig';
import { createMatchSetup } from '../setup/startingPositions';
import type { PlanetDefinition } from '../types/planet';
import {
  inspectMatchInvariants,
  type SimulationViolation,
} from './matchInvariants';
import { BRAND } from '../../branding';

export type HeadlessOutcome =
  'victory' | 'stalemate' | 'turn-cap' | 'command-cap' | 'engine-error';

export interface HeadlessMatchOptions {
  worldSeed: string;
  matchSeed: string;
  territoryCount: number;
  continentCount: number;
  playerCount: number;
  ownershipVariant?: number;
  maxTurns?: number;
  maxCommands?: number;
  maxTurnsWithoutCapture?: number;
  trace?: boolean;
  seatRotation?: number;
}

export interface ReproductionDescriptor {
  worldSeed: string;
  matchSeed: string;
  territoryCount: number;
  continentCount: number;
  playerCount: number;
  ownershipVariant: number;
  assignmentMode: 'random';
  controllers: string[];
  controllerVersion: string;
  maxTurns: number;
  maxCommands: number;
  maxTurnsWithoutCapture: number;
  seatRotation?: number;
  failingTurn?: number;
  failingCommandIndex?: number;
}

export interface MatchTraceEntry {
  commandIndex: number;
  turnNumber: number;
  phase: MatchState['phase'];
  playerId: string;
  command: GameCommand;
  result: 'applied' | 'rejected';
  territoryChanges: Record<
    string,
    {
      beforeOwner: string;
      afterOwner: string;
      beforeArmies: number;
      afterArmies: number;
    }
  >;
  error?: string;
}

export interface MatchMetrics {
  attacksAttempted: number;
  territoriesCaptured: number;
  eliminations: number;
  eliminationOrder: string[];
  armiesLostByPlayer: Record<string, number>;
  continentControlTurnsByPlayer: Record<string, number>;
  continentBonusEarnedByPlayer: Record<string, number>;
  territoryCheckpoints: Array<{
    turnNumber: number;
    territoriesByPlayer: Record<string, number>;
  }>;
  leadChanges: number;
  longestTurnsWithoutCapture: number;
  rejectedCommands: number;
  runtimeMs: number;
}

export interface HeadlessMatchResult {
  outcome: HeadlessOutcome;
  winnerPlayerId?: string;
  rounds: number;
  turns: number;
  commandsApplied: number;
  attacksAttempted: number;
  territoriesCaptured: number;
  eliminations: number;
  invariantViolations: SimulationViolation[];
  reason: string;
  reproduction: ReproductionDescriptor;
  metrics: MatchMetrics;
  trace?: MatchTraceEntry[];
  finalState: MatchState | null;
}

const DEFAULT_MAX_TURNS = 1_200;
const DEFAULT_MAX_COMMANDS = 30_000;
const DEFAULT_STALE_TURNS = 160;

function ownershipSignature(state: MatchState): string {
  return Object.entries(state.territories)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, territory]) => `${id}:${territory.ownerId}`)
    .join('|');
}

function territoryCounts(state: MatchState): Record<string, number> {
  const counts = Object.fromEntries(
    Object.keys(state.players).map((playerId) => [playerId, 0]),
  );
  Object.values(state.territories).forEach((territory) => {
    counts[territory.ownerId] = (counts[territory.ownerId] ?? 0) + 1;
  });
  return counts;
}

function leadingPlayer(state: MatchState): string {
  return Object.entries(territoryCounts(state)).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )[0]![0];
}

function changedTerritories(before: MatchState, after: MatchState) {
  return Object.fromEntries(
    Object.keys(before.territories)
      .filter((id) => {
        const left = before.territories[id]!;
        const right = after.territories[id]!;
        return (
          left.ownerId !== right.ownerId || left.armyCount !== right.armyCount
        );
      })
      .map((id) => {
        const left = before.territories[id]!;
        const right = after.territories[id]!;
        return [
          id,
          {
            beforeOwner: left.ownerId,
            afterOwner: right.ownerId,
            beforeArmies: left.armyCount,
            afterArmies: right.armyCount,
          },
        ];
      }),
  );
}

function reproduction(options: HeadlessMatchOptions): ReproductionDescriptor {
  return {
    worldSeed: options.worldSeed,
    matchSeed: options.matchSeed,
    territoryCount: options.territoryCount,
    continentCount: options.continentCount,
    playerCount: options.playerCount,
    ownershipVariant: options.ownershipVariant ?? 0,
    assignmentMode: 'random',
    controllers: Array.from(
      { length: options.playerCount },
      () => 'heuristic-bot',
    ),
    controllerVersion: HEURISTIC_CONTROLLER_VERSION,
    maxTurns: options.maxTurns ?? DEFAULT_MAX_TURNS,
    maxCommands: options.maxCommands ?? DEFAULT_MAX_COMMANDS,
    maxTurnsWithoutCapture:
      options.maxTurnsWithoutCapture ?? DEFAULT_STALE_TURNS,
    seatRotation: options.seatRotation,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach((nested) => deepFreeze(nested));
    Object.freeze(value);
  }
  return value;
}

function finalize(
  outcome: HeadlessOutcome,
  reason: string,
  state: MatchState,
  commandsApplied: number,
  captures: number,
  violations: SimulationViolation[],
  reproductionDescriptor: ReproductionDescriptor,
  metrics: MatchMetrics,
  startedAt: number,
  trace: MatchTraceEntry[] | undefined,
): HeadlessMatchResult {
  metrics.runtimeMs = performance.now() - startedAt;
  metrics.longestTurnsWithoutCapture = Math.max(
    metrics.longestTurnsWithoutCapture,
    0,
  );
  return {
    outcome,
    winnerPlayerId: state.winnerId ?? undefined,
    rounds: Math.ceil(state.turnNumber / Object.keys(state.players).length),
    turns: state.turnNumber,
    commandsApplied,
    attacksAttempted: metrics.attacksAttempted,
    territoriesCaptured: captures,
    eliminations: metrics.eliminations,
    invariantViolations: violations,
    reason,
    reproduction: reproductionDescriptor,
    metrics,
    trace,
    finalState: state,
  };
}

export async function runHeadlessMatch(
  options: HeadlessMatchOptions,
): Promise<HeadlessMatchResult> {
  const startedAt = performance.now();
  const descriptor = reproduction(options);
  const configuredPlayers = createDefaultPlayerConfigs(options.playerCount).map(
    (player) => ({
      ...player,
      controllerType: 'heuristic-bot' as const,
    }),
  );
  const rotation = (options.seatRotation ?? 0) % configuredPlayers.length;
  const players = [
    ...configuredPlayers.slice(rotation),
    ...configuredPlayers.slice(0, rotation),
  ];
  const emptyMetrics: MatchMetrics = {
    attacksAttempted: 0,
    territoriesCaptured: 0,
    eliminations: 0,
    eliminationOrder: [],
    armiesLostByPlayer: Object.fromEntries(
      players.map((player) => [player.id, 0]),
    ),
    continentControlTurnsByPlayer: Object.fromEntries(
      players.map((player) => [player.id, 0]),
    ),
    continentBonusEarnedByPlayer: Object.fromEntries(
      players.map((player) => [player.id, 0]),
    ),
    territoryCheckpoints: [],
    leadChanges: 0,
    longestTurnsWithoutCapture: 0,
    rejectedCommands: 0,
    runtimeMs: 0,
  };
  let planet: PlanetDefinition;
  let state: MatchState;
  try {
    planet = generatePlanet(options.worldSeed, options);
    const setup = createMatchSetup(
      planet,
      players,
      options.ownershipVariant ?? 0,
    );
    state = createMatch(planet, setup, { matchSeed: options.matchSeed });
    deepFreeze(planet);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emptyMetrics.runtimeMs = performance.now() - startedAt;
    return {
      outcome: 'engine-error',
      rounds: 0,
      turns: 0,
      commandsApplied: 0,
      attacksAttempted: 0,
      territoriesCaptured: 0,
      eliminations: 0,
      invariantViolations: [
        {
          code: 'SETUP_ERROR',
          message,
          turnNumber: 0,
          commandIndex: 0,
        },
      ],
      reason: `Headless match setup failed: ${message}`,
      reproduction: {
        ...descriptor,
        failingTurn: 0,
        failingCommandIndex: 0,
      },
      metrics: emptyMetrics,
      trace: options.trace ? [] : undefined,
      finalState: null,
    };
  }
  const metrics: MatchMetrics = {
    attacksAttempted: 0,
    territoriesCaptured: 0,
    eliminations: 0,
    eliminationOrder: [],
    armiesLostByPlayer: Object.fromEntries(
      players.map((player) => [player.id, 0]),
    ),
    continentControlTurnsByPlayer: Object.fromEntries(
      players.map((player) => [player.id, 0]),
    ),
    continentBonusEarnedByPlayer: Object.fromEntries(
      players.map((player) => [player.id, 0]),
    ),
    territoryCheckpoints: [
      { turnNumber: 1, territoriesByPlayer: territoryCounts(state) },
    ],
    leadChanges: 0,
    longestTurnsWithoutCapture: 0,
    rejectedCommands: 0,
    runtimeMs: 0,
  };
  const trace: MatchTraceEntry[] | undefined = options.trace ? [] : undefined;
  const violations = inspectMatchInvariants(planet, null, state, null, 0);
  let commandsApplied = 0;
  let captures = 0;
  let turnsWithoutCapture = 0;
  let turnStartOwnership = ownershipSignature(state);
  let leader = leadingPlayer(state);

  while (true) {
    if (state.phase === 'game-over') {
      return finalize(
        'victory',
        'The authoritative victory rule completed the match.',
        state,
        commandsApplied,
        captures,
        violations,
        descriptor,
        metrics,
        startedAt,
        trace,
      );
    }
    if (violations.length > 0) {
      descriptor.failingTurn = state.turnNumber;
      descriptor.failingCommandIndex = commandsApplied;
      return finalize(
        'engine-error',
        'A post-command invariant failed.',
        state,
        commandsApplied,
        captures,
        violations,
        descriptor,
        metrics,
        startedAt,
        trace,
      );
    }
    if (commandsApplied >= descriptor.maxCommands) {
      return finalize(
        'command-cap',
        'Maximum command count reached.',
        state,
        commandsApplied,
        captures,
        violations,
        descriptor,
        metrics,
        startedAt,
        trace,
      );
    }
    if (state.turnNumber > descriptor.maxTurns) {
      return finalize(
        'turn-cap',
        'Maximum turn count reached.',
        state,
        commandsApplied,
        captures,
        violations,
        descriptor,
        metrics,
        startedAt,
        trace,
      );
    }
    if (turnsWithoutCapture >= descriptor.maxTurnsWithoutCapture) {
      return finalize(
        'stalemate',
        'No territory changed ownership within the configured window.',
        state,
        commandsApplied,
        captures,
        violations,
        descriptor,
        metrics,
        startedAt,
        trace,
      );
    }

    const before = state;
    const legal = getLegalGameCommands(planet, before);
    const observation = createGameObservation(planet, before);
    const decisionIndex = commandsApplied;
    let command: GameCommand;
    try {
      command = await heuristicController.chooseAction(observation, legal, {
        controllerType: 'heuristic-bot',
        controllerVersion: HEURISTIC_CONTROLLER_VERSION,
        decisionIndex,
        decisionSeed: controllerDecisionSeed(observation, decisionIndex),
      });
      if (
        !legal.some((item) => JSON.stringify(item) === JSON.stringify(command))
      ) {
        throw new Error('Controller selected a command outside the legal set.');
      }
    } catch {
      const fallback = deterministicFallback(legal);
      if (!fallback) {
        descriptor.failingTurn = before.turnNumber;
        descriptor.failingCommandIndex = commandsApplied;
        return finalize(
          'engine-error',
          'No legal controller command or fallback exists.',
          before,
          commandsApplied,
          captures,
          violations,
          descriptor,
          metrics,
          startedAt,
          trace,
        );
      }
      command = fallback;
    }
    const transition = gameReducer(planet, before, command);
    if (transition.error) {
      metrics.rejectedCommands += 1;
      descriptor.failingTurn = before.turnNumber;
      descriptor.failingCommandIndex = commandsApplied;
      trace?.push({
        commandIndex: commandsApplied,
        turnNumber: before.turnNumber,
        phase: before.phase,
        playerId: before.activePlayerId,
        command,
        result: 'rejected',
        territoryChanges: {},
        error: `${transition.error.code}: ${transition.error.message}`,
      });
      return finalize(
        'engine-error',
        `The reducer rejected a controller command: ${transition.error.code}.`,
        before,
        commandsApplied,
        captures,
        violations,
        descriptor,
        metrics,
        startedAt,
        trace,
      );
    }
    state = transition.state;
    commandsApplied += 1;
    if (command.type === 'ATTACK') {
      metrics.attacksAttempted += 1;
      const event = state.events.at(-1);
      if (event?.type === 'combat') {
        metrics.armiesLostByPlayer[before.activePlayerId] +=
          event.attackerLosses ?? 0;
        const defenderId = before.territories[command.toTerritoryId]!.ownerId;
        metrics.armiesLostByPlayer[defenderId] += event.defenderLosses ?? 0;
      }
    }
    const captureDelta = state.events
      .slice(before.events.length)
      .filter((event) => event.type === 'territory-captured').length;
    captures += captureDelta;
    metrics.territoriesCaptured = captures;
    const eliminated = state.events
      .slice(before.events.length)
      .filter((event) => event.type === 'player-eliminated');
    metrics.eliminations += eliminated.length;
    metrics.eliminationOrder.push(
      ...eliminated.map((event) => event.playerId!).filter(Boolean),
    );
    trace?.push({
      commandIndex: commandsApplied - 1,
      turnNumber: before.turnNumber,
      phase: before.phase,
      playerId: before.activePlayerId,
      command,
      result: 'applied',
      territoryChanges: changedTerritories(before, state),
    });
    violations.push(
      ...inspectMatchInvariants(
        planet,
        before,
        state,
        command,
        commandsApplied,
      ),
    );
    if (command.type === 'END_TURN') {
      const controlledContinents = getFullyOwnedContinents(
        planet,
        before,
        before.activePlayerId,
      );
      metrics.continentControlTurnsByPlayer[before.activePlayerId] +=
        controlledContinents.length;
      metrics.continentBonusEarnedByPlayer[before.activePlayerId] +=
        controlledContinents.reduce(
          (sum, continent) => sum + continent.bonus,
          0,
        );
      const ownership = ownershipSignature(state);
      const ownershipChanged = ownership !== turnStartOwnership;
      turnsWithoutCapture = ownershipChanged ? 0 : turnsWithoutCapture + 1;
      metrics.longestTurnsWithoutCapture = Math.max(
        metrics.longestTurnsWithoutCapture,
        turnsWithoutCapture,
      );
      turnStartOwnership = ownership;
      if (ownershipChanged || state.turnNumber % 10 === 0) {
        metrics.territoryCheckpoints.push({
          turnNumber: state.turnNumber,
          territoriesByPlayer: territoryCounts(state),
        });
      }
      const nextLeader = leadingPlayer(state);
      if (nextLeader !== leader) metrics.leadChanges += 1;
      leader = nextLeader;
    }
  }
}

export interface BotSimulationReport {
  project: {
    reportSchemaVersion: 1;
    productName: string;
    packageSlug: string;
  };
  runId: string;
  timestamp: string;
  controllerVersion: string;
  configuration: Omit<
    HeadlessMatchOptions,
    'worldSeed' | 'matchSeed' | 'trace'
  >;
  gamesRequested: number;
  gamesCompleted: number;
  passed: boolean;
  outcomes: Record<HeadlessOutcome, number>;
  winRates: Record<string, number>;
  averageTurns: number;
  percentileTurns: { p50: number; p95: number; p99: number };
  invariantFailures: Array<{
    reproduction: ReproductionDescriptor;
    violations: SimulationViolation[];
  }>;
  reproductions: ReproductionDescriptor[];
  runtimeMs: number;
  gamesPerSecond: number;
  results: Array<Omit<HeadlessMatchResult, 'finalState' | 'trace'>>;
}

function percentile(sorted: number[], ratio: number): number {
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0
  );
}

export async function runBotSimulation(
  games: number,
  base: Omit<HeadlessMatchOptions, 'worldSeed' | 'matchSeed'>,
  seedPrefix = 'bot-matrix',
): Promise<BotSimulationReport> {
  const startedAt = performance.now();
  const completed: Array<Omit<HeadlessMatchResult, 'finalState' | 'trace'>> =
    [];
  for (let index = 0; index < games; index += 1) {
    const result = await runHeadlessMatch({
      ...base,
      worldSeed: `${seedPrefix}-world-${index}`,
      matchSeed: `${seedPrefix}-match-${index}`,
    });
    const { finalState, trace, ...summary } = result;
    void finalState;
    void trace;
    completed.push(summary);
  }
  const runtimeMs = performance.now() - startedAt;
  const turns = completed.map((result) => result.turns).sort((a, b) => a - b);
  const outcomes = Object.fromEntries(
    ['victory', 'stalemate', 'turn-cap', 'command-cap', 'engine-error'].map(
      (outcome) => [
        outcome,
        completed.filter((result) => result.outcome === outcome).length,
      ],
    ),
  ) as Record<HeadlessOutcome, number>;
  const wins = new Map<string, number>();
  completed.forEach((result) => {
    if (result.winnerPlayerId)
      wins.set(
        result.winnerPlayerId,
        (wins.get(result.winnerPlayerId) ?? 0) + 1,
      );
  });
  return {
    project: {
      reportSchemaVersion: 1,
      productName: BRAND.productName,
      packageSlug: BRAND.packageSlug,
    },
    runId: `${seedPrefix}-${games}`,
    timestamp: new Date().toISOString(),
    controllerVersion: HEURISTIC_CONTROLLER_VERSION,
    configuration: base,
    gamesRequested: games,
    gamesCompleted: completed.length,
    passed: outcomes['engine-error'] === 0,
    outcomes,
    winRates: Object.fromEntries(
      [...wins].map(([id, count]) => [id, count / Math.max(1, games)]),
    ),
    averageTurns:
      turns.reduce((sum, value) => sum + value, 0) / Math.max(1, turns.length),
    percentileTurns: {
      p50: percentile(turns, 0.5),
      p95: percentile(turns, 0.95),
      p99: percentile(turns, 0.99),
    },
    invariantFailures: completed
      .filter((result) => result.invariantViolations.length)
      .map((result) => ({
        reproduction: result.reproduction,
        violations: result.invariantViolations,
      })),
    reproductions: completed
      .filter((result) => result.outcome !== 'victory')
      .map((result) => result.reproduction),
    runtimeMs,
    gamesPerSecond: completed.length / Math.max(runtimeMs / 1_000, 0.001),
    results: completed,
  };
}
