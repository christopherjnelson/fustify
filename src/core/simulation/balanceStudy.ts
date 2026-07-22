import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { HeadlessMatchResult, ReproductionDescriptor } from './botMatch';
import { HEURISTIC_CONTROLLER_VERSION } from '../controllers';
import type {
  BalanceStudyReport,
  StudyAggregate,
} from '../../admin/balanceStudyContract';

const dimensionSchema = z.object({
  group: z.string().min(1).max(100),
  purpose: z.enum(['product-balance', 'engine-coverage']),
  playerCount: z.number().int().min(2).max(6),
  territoryCount: z.number().int().min(12).max(48),
  continentCount: z.number().int().min(2).max(8),
});

export const balanceStudyConfigSchema = z
  .object({
    label: z.string().min(1).max(200),
    presetVersion: z.number().int().positive().default(2),
    seedPrefix: z.string().min(1).max(200),
    matchesPerConfiguration: z.number().int().positive().max(100_000),
    rotations: z.number().int().min(1).max(6).default(1),
    assignmentRotations: z.number().int().min(1).max(6).default(1),
    diagnostic: z.boolean().default(false),
    ownershipVariants: z.number().int().min(1).max(64).default(2),
    maxTurns: z.number().int().positive().max(100_000).default(1_200),
    maxCommands: z.number().int().positive().max(2_000_000).default(30_000),
    maxTurnsWithoutCapture: z
      .number()
      .int()
      .positive()
      .max(100_000)
      .default(160),
    checkpointEvery: z.number().int().positive().max(10_000).default(10),
    warningThresholds: z
      .object({
        seatDifference: z.number().min(0).max(1).default(0.08),
        capRate: z.number().min(0).max(1).default(0.05),
        stalemateRate: z.number().min(0).max(1).default(0.05),
        minimumSamples: z.number().int().positive().default(30),
        lowVictoryRate: z.number().min(0).max(1).default(0.8),
      })
      .default({
        seatDifference: 0.08,
        capRate: 0.05,
        stalemateRate: 0.05,
        minimumSamples: 30,
        lowVictoryRate: 0.8,
      }),
    configurations: z.array(dimensionSchema).min(1).max(5_000),
  })
  .superRefine((config, context) => {
    config.configurations.forEach((entry, index) => {
      if (entry.continentCount > entry.territoryCount)
        context.addIssue({
          code: 'custom',
          path: ['configurations', index, 'continentCount'],
          message: 'Continent count cannot exceed territory count.',
        });
      if (entry.territoryCount < entry.playerCount * 2)
        context.addIssue({
          code: 'custom',
          path: ['configurations', index, 'territoryCount'],
          message: 'Each player needs at least two territories.',
        });
    });
  });

export type BalanceStudyConfig = z.infer<typeof balanceStudyConfigSchema>;

const product = [4, 5, 6].map((playerCount) => ({
  group: 'recommended',
  purpose: 'product-balance' as const,
  playerCount,
  territoryCount: 42,
  continentCount: 6,
}));
const engine = [
  {
    group: 'edge-small',
    purpose: 'engine-coverage' as const,
    playerCount: 2,
    territoryCount: 12,
    continentCount: 2,
  },
  {
    group: 'edge-density',
    purpose: 'engine-coverage' as const,
    playerCount: 3,
    territoryCount: 18,
    continentCount: 4,
  },
];

function preset(
  matches: number,
  configurations: ReadonlyArray<z.infer<typeof dimensionSchema>> = product,
): BalanceStudyConfig {
  return balanceStudyConfigSchema.parse({
    label: 'Standard-play deterministic balance study',
    presetVersion: 2,
    seedPrefix: 'fustify-balance-v2',
    matchesPerConfiguration: matches,
    rotations: 2,
    ownershipVariants: 2,
    checkpointEvery: 10,
    configurations,
  });
}

export const BALANCE_PRESETS = {
  quick: preset(4, [...product, ...engine]),
  standard: preset(100, [...product, ...engine]),
  thorough: preset(1_000, product),
  exhaustive: preset(10_000, product),
  'engine-coverage': preset(10, engine),
} as const;

export const SIX_SEAT_DIAGNOSTIC_PRESETS = {
  smoke: preset(12, [product[2]!]),
  block: preset(36, [product[2]!]),
  standard: preset(600, [product[2]!]),
  thorough: preset(1_800, [product[2]!]),
} as const;
Object.entries(SIX_SEAT_DIAGNOSTIC_PRESETS).forEach(([scale, config]) => {
  config.label = 'Six-seat paired rotation diagnostic';
  config.seedPrefix = `fustify-six-seat-diagnostic-v1-${scale === 'block' ? 'standard' : scale}`;
  config.rotations = 6;
  config.assignmentRotations = 6;
  config.diagnostic = true;
  config.checkpointEvery = scale === 'smoke' ? 6 : scale === 'block' ? 36 : 25;
});

export type BalancePreset = keyof typeof BALANCE_PRESETS;

export interface StudyMatchInput {
  index: number;
  configurationId: string;
  group: string;
  purpose: 'product-balance' | 'engine-coverage';
  playerCount: number;
  territoryCount: number;
  continentCount: number;
  worldSeed: string;
  matchSeed: string;
  ownershipVariant: number;
  seatRotation: number;
  assignmentRotation: number;
  controllerStreamRotation: number;
  maxTurns: number;
  maxCommands: number;
  maxTurnsWithoutCapture: number;
}

export function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function worldSize(territories: number): 'small' | 'standard' | 'large' {
  return territories <= 20 ? 'small' : territories <= 36 ? 'standard' : 'large';
}

export function createStudyMatrix(configValue: unknown): StudyMatchInput[] {
  const config = balanceStudyConfigSchema.parse(configValue);
  const matrix: StudyMatchInput[] = [];
  config.configurations.forEach((entry, configurationIndex) => {
    const configurationId = `${entry.group}-${entry.playerCount}p-${entry.territoryCount}t-${entry.continentCount}c-${configurationIndex}`;
    for (
      let localIndex = 0;
      localIndex < config.matchesPerConfiguration;
      localIndex += 1
    ) {
      const rotationSpan = config.diagnostic
        ? Math.min(config.rotations, entry.playerCount) *
          Math.min(config.assignmentRotations, entry.playerCount)
        : Math.max(1, entry.playerCount);
      const pair = Math.floor(localIndex / rotationSpan);
      const seatRotation =
        localIndex % Math.min(config.rotations, entry.playerCount);
      const assignmentRotation = config.diagnostic
        ? Math.floor(
            localIndex / Math.min(config.rotations, entry.playerCount),
          ) % Math.min(config.assignmentRotations, entry.playerCount)
        : 0;
      const controllerStreamRotation = config.diagnostic
        ? (seatRotation + assignmentRotation) % entry.playerCount
        : 0;
      const ownershipVariant = pair % config.ownershipVariants;
      const shared = `${config.seedPrefix}-${configurationId}-pair-${pair}`;
      matrix.push({
        index: matrix.length,
        configurationId,
        ...entry,
        worldSeed: `${shared}-world`,
        matchSeed: `${shared}-match`,
        ownershipVariant,
        seatRotation,
        assignmentRotation,
        controllerStreamRotation,
        maxTurns: config.maxTurns,
        maxCommands: config.maxCommands,
        maxTurnsWithoutCapture: config.maxTurnsWithoutCapture,
      });
    }
  });
  return matrix;
}

export function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)
  ]!;
}

export function wilson95(wins: number, samples: number): [number, number] {
  if (!samples) return [0, 0];
  const z = 1.959963984540054;
  const p = wins / samples;
  const denominator = 1 + (z * z) / samples;
  const center = (p + (z * z) / (2 * samples)) / denominator;
  const spread =
    (z / denominator) *
    Math.sqrt((p * (1 - p)) / samples + (z * z) / (4 * samples * samples));
  return [Math.max(0, center - spread), Math.min(1, center + spread)];
}

export interface CompletedStudyMatch {
  input: StudyMatchInput;
  result: Omit<HeadlessMatchResult, 'finalState' | 'trace'>;
}

function playerId(number: number): string {
  return `player-${String(number).padStart(2, '0')}`;
}

export interface DiagnosticPlayerMapping {
  logicalPlayerId: string;
  turnSeat: number;
  assignmentPosition: number;
  controllerStreamId: string;
}

export interface DiagnosticDebugRow {
  fixtureBlockId: string;
  worldSeed: string;
  matchSeed: string;
  seatRotation: number;
  assignmentRotation: number;
  controllerStreamRotation: number;
  logicalPlayersBySeat: string[];
  players: DiagnosticPlayerMapping[];
  winnerSeat: number | null;
  winnerLogicalPlayer: string | null;
  winnerAssignmentPosition: number | null;
  winnerControllerStream: string | null;
  outcome: HeadlessMatchResult['outcome'];
  matchLength: number;
}

export function diagnosticPlayerMappings(
  input: StudyMatchInput,
): DiagnosticPlayerMapping[] {
  return Array.from({ length: input.playerCount }, (_, logicalIndex) => {
    const turnIndex =
      (logicalIndex - input.seatRotation + input.playerCount) %
      input.playerCount;
    const assignmentPosition =
      ((turnIndex - input.assignmentRotation + input.playerCount) %
        input.playerCount) +
      1;
    const streamPosition =
      ((turnIndex + input.controllerStreamRotation) % input.playerCount) + 1;
    return {
      logicalPlayerId: playerId(logicalIndex + 1),
      turnSeat: turnIndex + 1,
      assignmentPosition,
      controllerStreamId: `controller-${streamPosition}`,
    };
  });
}

export function diagnosticDebugRows(
  completed: CompletedStudyMatch[],
): DiagnosticDebugRow[] {
  return completed
    .filter(({ input }) => input.playerCount === 6)
    .map(({ input, result }) => {
      const players = diagnosticPlayerMappings(input);
      const winner = players.find(
        (mapping) => mapping.logicalPlayerId === result.winnerPlayerId,
      );
      return {
        fixtureBlockId: `${input.configurationId}:pair:${input.worldSeed}`,
        worldSeed: input.worldSeed,
        matchSeed: input.matchSeed,
        seatRotation: input.seatRotation,
        assignmentRotation: input.assignmentRotation,
        controllerStreamRotation: input.controllerStreamRotation,
        logicalPlayersBySeat: players
          .slice()
          .sort((left, right) => left.turnSeat - right.turnSeat)
          .map(({ logicalPlayerId }) => logicalPlayerId),
        players,
        winnerSeat: winner?.turnSeat ?? null,
        winnerLogicalPlayer: winner?.logicalPlayerId ?? null,
        winnerAssignmentPosition: winner?.assignmentPosition ?? null,
        winnerControllerStream: winner?.controllerStreamId ?? null,
        outcome: result.outcome,
        matchLength: result.turns,
      };
    });
}

function reproductionCommand(descriptor: ReproductionDescriptor): string {
  return `pnpm study:balance --reproduce '${JSON.stringify(descriptor)}' --verbose`;
}

export function aggregateStudy(
  matrix: StudyMatchInput[],
  completed: CompletedStudyMatch[],
  runtimeMs: number,
  thresholds: BalanceStudyConfig['warningThresholds'],
): Pick<
  BalanceStudyReport,
  'aggregate' | 'configurations' | 'findings' | 'reproductions'
> {
  const outcomes = {
    victory: 0,
    stalemate: 0,
    turnCap: 0,
    commandCap: 0,
    engineError: 0,
  };
  const turns = completed.map(({ result }) => result.turns);
  const maxSeats = Math.max(0, ...matrix.map((item) => item.playerCount));
  const seats = Array.from({ length: maxSeats }, (_, index) => ({
    seat: index + 1,
    samples: 0,
    wins: 0,
    territories: 0,
  }));
  let invariantFailures = 0;
  let attacks = 0;
  let captures = 0;
  let leadChanges = 0;
  let longestTurnsWithoutCapture = 0;
  const eliminationsBySeat: Record<string, number> = {};
  const continentControlTurnsBySeat: Record<string, number> = {};
  const reproductions: string[] = [];
  completed.forEach(({ input, result }) => {
    if (result.outcome === 'turn-cap') outcomes.turnCap += 1;
    else if (result.outcome === 'command-cap') outcomes.commandCap += 1;
    else if (result.outcome === 'engine-error') outcomes.engineError += 1;
    else outcomes[result.outcome] += 1;
    invariantFailures += result.invariantViolations.length;
    attacks += result.metrics.attacksAttempted;
    captures += result.metrics.territoriesCaptured;
    leadChanges += result.metrics.leadChanges;
    longestTurnsWithoutCapture = Math.max(
      longestTurnsWithoutCapture,
      result.metrics.longestTurnsWithoutCapture,
    );
    for (let seat = 0; seat < input.playerCount; seat += 1) {
      const summary = seats[seat]!;
      summary.samples += 1;
      const playerNumber =
        ((seat + input.seatRotation) % input.playerCount) + 1;
      summary.territories +=
        result.metrics.territoryCheckpoints[0]?.territoriesByPlayer[
          playerId(playerNumber)
        ] ?? 0;
      if (result.winnerPlayerId === playerId(playerNumber)) summary.wins += 1;
      eliminationsBySeat[String(seat + 1)] =
        (eliminationsBySeat[String(seat + 1)] ?? 0) +
        result.metrics.eliminationOrder.filter(
          (id) => id === playerId(playerNumber),
        ).length;
      continentControlTurnsBySeat[String(seat + 1)] =
        (continentControlTurnsBySeat[String(seat + 1)] ?? 0) +
        (result.metrics.continentControlTurnsByPlayer[playerId(playerNumber)] ??
          0);
    }
    if (result.outcome === 'engine-error' || result.invariantViolations.length)
      reproductions.push(reproductionCommand(result.reproduction));
  });
  const seatSummaries = seats
    .filter((seat) => seat.samples)
    .map((seat) => {
      const playerCounts = completed
        .filter(({ input }) => input.playerCount >= seat.seat)
        .map(({ input }) => input.playerCount);
      const baseline =
        playerCounts.reduce((sum, count) => sum + 1 / count, 0) /
        Math.max(1, playerCounts.length);
      const winRate = seat.wins / seat.samples;
      return {
        seat: seat.seat,
        samples: seat.samples,
        wins: seat.wins,
        winRate,
        equalSeatBaseline: baseline,
        differenceFromBaseline: winRate - baseline,
        confidenceInterval95: wilson95(seat.wins, seat.samples),
        meanStartingTerritories: seat.territories / seat.samples,
      };
    });
  const playerCountSeatSummaries = [
    ...new Set(completed.map(({ input }) => input.playerCount)),
  ]
    .sort((a, b) => a - b)
    .flatMap((playerCount) => {
      const rows = completed.filter(
        ({ input }) => input.playerCount === playerCount,
      );
      return (['product-balance', 'engine-coverage'] as const).flatMap(
        (purpose) => {
          const purposeRows = rows.filter(
            ({ input }) => input.purpose === purpose,
          );
          if (!purposeRows.length) return [];
          const victories = purposeRows.filter(
            ({ result }) => result.outcome === 'victory',
          ).length;
          const stalemates = purposeRows.filter(
            ({ result }) => result.outcome === 'stalemate',
          ).length;
          const turnCaps = purposeRows.filter(
            ({ result }) => result.outcome === 'turn-cap',
          ).length;
          return [
            {
              playerCount,
              purpose,
              matches: purposeRows.length,
              victories,
              unresolved: purposeRows.length - victories,
              stalemates,
              turnCaps,
              seats: Array.from({ length: playerCount }, (_, index) => {
                const seat = index + 1;
                let wins = 0;
                let territories = 0;
                purposeRows.forEach(({ input, result }) => {
                  const playerNumber =
                    ((index + input.seatRotation) % playerCount) + 1;
                  if (result.winnerPlayerId === playerId(playerNumber))
                    wins += 1;
                  territories +=
                    result.metrics.territoryCheckpoints[0]?.territoriesByPlayer[
                      playerId(playerNumber)
                    ] ?? 0;
                });
                const samples = purposeRows.length;
                const winRate = wins / samples;
                const baseline = 1 / playerCount;
                const outcomeAdjustedBaseline =
                  victories / playerCount / Math.max(1, samples);
                const decidedVictoryShare = wins / Math.max(1, victories);
                return {
                  seat,
                  samples,
                  wins,
                  winRate,
                  equalSeatBaseline: baseline,
                  differenceFromBaseline: winRate - baseline,
                  confidenceInterval95: wilson95(wins, samples),
                  meanStartingTerritories: territories / samples,
                  victories,
                  unresolved: samples - victories,
                  outcomeAdjustedBaseline,
                  differenceFromOutcomeAdjustedBaseline:
                    winRate - outcomeAdjustedBaseline,
                  decidedVictoryShare,
                  equalDecidedVictoryBaseline: baseline,
                  differenceFromDecidedVictoryBaseline:
                    decidedVictoryShare - baseline,
                  decidedVictoryConfidenceInterval95: wilson95(wins, victories),
                };
              }),
            },
          ];
        },
      );
    });
  const diagnosticRows = completed.filter(
    ({ input }) => input.playerCount === 6,
  );
  const logicalPlayerWins: Record<string, number> = {};
  const assignmentPositionWins: Record<string, number> = {};
  const controllerStreamWins: Record<string, number> = {};
  if (diagnosticRows.length)
    for (let index = 1; index <= 6; index += 1) {
      logicalPlayerWins[playerId(index)] = 0;
      assignmentPositionWins[`assignment-${index}`] = 0;
      controllerStreamWins[`controller-${index}`] = 0;
    }
  diagnosticRows.forEach(({ input, result }) => {
    if (!result.winnerPlayerId) return;
    logicalPlayerWins[result.winnerPlayerId] =
      (logicalPlayerWins[result.winnerPlayerId] ?? 0) + 1;
    const winnerMapping = diagnosticPlayerMappings(input).find(
      (mapping) => mapping.logicalPlayerId === result.winnerPlayerId,
    );
    if (!winnerMapping) return;
    const assignmentKey = `assignment-${winnerMapping.assignmentPosition}`;
    assignmentPositionWins[assignmentKey] =
      (assignmentPositionWins[assignmentKey] ?? 0) + 1;
    controllerStreamWins[winnerMapping.controllerStreamId] =
      (controllerStreamWins[winnerMapping.controllerStreamId] ?? 0) + 1;
  });
  const spread = (values: number[]) =>
    values.length ? Math.max(...values) - Math.min(...values) : 0;
  const diagnosticVictories = diagnosticRows.filter(
    ({ result }) => result.outcome === 'victory',
  ).length;
  const factorThreshold = Math.max(2, diagnosticVictories * 0.08);
  const seatSpread = spread(seats.slice(0, 6).map(({ wins }) => wins));
  const playerSpread = spread(Object.values(logicalPlayerWins));
  const assignmentSpread = spread(Object.values(assignmentPositionWins));
  const controllerStreamSpread = spread(Object.values(controllerStreamWins));
  const mappingKeys = (mapping: DiagnosticPlayerMapping) => [
    `seat-${mapping.turnSeat}`,
    `assignment-${mapping.assignmentPosition}`,
    mapping.controllerStreamId,
  ];
  const exposureCounts = new Map<string, number>();
  matrix
    .filter((input) => input.playerCount === 6)
    .flatMap(diagnosticPlayerMappings)
    .forEach((mapping) =>
      mappingKeys(mapping).forEach((key) =>
        exposureCounts.set(
          `${mapping.logicalPlayerId}:${key}`,
          (exposureCounts.get(`${mapping.logicalPlayerId}:${key}`) ?? 0) + 1,
        ),
      ),
    );
  const diagnosticInputs = matrix.filter((input) => input.playerCount === 6);
  const completeRotationBlocks = diagnosticInputs.length % 36 === 0;
  const mappingValid =
    diagnosticInputs.every(
      (input) =>
        input.controllerStreamRotation ===
        (input.seatRotation + input.assignmentRotation) % input.playerCount,
    ) &&
    new Set(
      diagnosticInputs.map(
        (input) =>
          `${input.worldSeed}:${input.seatRotation}:${input.assignmentRotation}`,
      ),
    ).size === diagnosticInputs.length &&
    (!completeRotationBlocks || new Set(exposureCounts.values()).size <= 1);
  const strongestFactor = [
    ['turn position', seatSpread],
    ['controller stream position', controllerStreamSpread],
    ['logical player ID', playerSpread],
    ['assignment position', assignmentSpread],
  ]
    .slice()
    .sort((left, right) => Number(right[1]) - Number(left[1]))[0] as [
    string,
    number,
  ];
  const factorAssessment = !mappingValid
    ? 'Diagnostic mapping invalid; factor attribution is unavailable.'
    : diagnosticRows.length < 36 || diagnosticRows.length % 36 !== 0
      ? 'Insufficient sample size: complete a full 36-match rotation block.'
      : diagnosticVictories < thresholds.minimumSamples * 6
        ? `Insufficient sample size for factor classification: ${diagnosticVictories} decided victories; ${thresholds.minimumSamples * 6} required (${thresholds.minimumSamples} per factor position).`
        : strongestFactor[1] < factorThreshold
          ? 'No clear correlation exceeds the diagnostic threshold.'
          : strongestFactor[0] === 'turn position'
            ? 'Outcomes most strongly follow turn position; association only, not causal proof.'
            : strongestFactor[0] === 'controller stream position'
              ? 'Outcomes most strongly follow controller stream position; investigate deterministic controller choices.'
              : strongestFactor[0] === 'logical player ID'
                ? 'Outcomes most strongly follow logical player ID; player labels are not intended bot personalities.'
                : 'Outcomes most strongly follow assignment position; investigate starting assignment.';
  const suspiciousReproductions =
    diagnosticVictories >= thresholds.minimumSamples * 6 &&
    !factorAssessment.startsWith('No clear correlation')
      ? diagnosticRows
          .filter(({ result }) => result.outcome === 'victory')
          .slice(0, 6)
          .map(({ result }) => reproductionCommand(result.reproduction))
      : [];
  const factorSummaries = (wins: Record<string, number>) =>
    Object.entries(wins)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, count]) => ({
        key,
        wins: count,
        decidedVictoryShare: count / Math.max(1, diagnosticVictories),
        confidenceInterval95: wilson95(count, diagnosticVictories),
      }));
  const aggregate: StudyAggregate = {
    matchesRequested: matrix.length,
    matchesStarted: completed.length,
    matchesCompleted: completed.length,
    outcomes,
    invariantFailures,
    seatSummaries,
    playerCountSeatSummaries,
    turns: {
      mean: turns.reduce((a, b) => a + b, 0) / Math.max(1, turns.length),
      minimum: turns.length ? Math.min(...turns) : 0,
      median: percentile(turns, 0.5),
      p90: percentile(turns, 0.9),
      p95: percentile(turns, 0.95),
      p99: percentile(turns, 0.99),
      maximum: turns.length ? Math.max(...turns) : 0,
    },
    attacks,
    captures,
    leadChanges,
    longestTurnsWithoutCapture,
    eliminationsBySeat,
    continentControlTurnsBySeat,
    runtimeMs,
    gamesPerSecond: completed.length / Math.max(0.001, runtimeMs / 1000),
    ...(matrix.some((item) => item.assignmentRotation !== 0)
      ? {
          diagnostic: {
            rotationDesign:
              'Canonical six-seat fixtures cross six logical-player/turn rotations with six assignment-order rotations and balanced explicit controller streams while holding world and match seeds within each 36-match block.',
            pairRotationCount: new Set(
              matrix.map(
                (item) =>
                  `${item.worldSeed}:${item.seatRotation}:${item.assignmentRotation}`,
              ),
            ).size,
            logicalPlayerWins,
            assignmentPositionWins,
            controllerStreamWins,
            mappingValid,
            logicalPlayerSummaries: factorSummaries(logicalPlayerWins),
            assignmentPositionSummaries: factorSummaries(
              assignmentPositionWins,
            ),
            controllerStreamSummaries: factorSummaries(controllerStreamWins),
            factorAssessment,
            suspiciousReproductions,
          },
        }
      : {}),
  };
  const configurations = [
    ...new Set(matrix.map((item) => item.configurationId)),
  ].map((id) => {
    const inputs = matrix.filter((item) => item.configurationId === id);
    const rows = completed.filter((item) => item.input.configurationId === id);
    const first = inputs[0]!;
    const configTurns = rows.map((row) => row.result.turns);
    const configRuntime = rows.reduce(
      (sum, row) => sum + row.result.metrics.runtimeMs,
      0,
    );
    const configOutcomes: Record<string, number> = {};
    const seatWins: Record<string, number> = {};
    rows.forEach(({ input, result }) => {
      configOutcomes[result.outcome] =
        (configOutcomes[result.outcome] ?? 0) + 1;
      if (result.winnerPlayerId) {
        const playerNumber = Number(result.winnerPlayerId.slice(-2));
        const seat =
          ((playerNumber - 1 - input.seatRotation + input.playerCount) %
            input.playerCount) +
          1;
        const key = `seat-${seat}`;
        seatWins[key] = (seatWins[key] ?? 0) + 1;
      }
    });
    return {
      id,
      group: first.group,
      purpose: first.purpose,
      playerCount: first.playerCount,
      territoryCount: first.territoryCount,
      continentCount: first.continentCount,
      worldSize: worldSize(first.territoryCount),
      matchesRequested: inputs.length,
      matchesCompleted: rows.length,
      outcomes: configOutcomes,
      seatWinRates: Object.fromEntries(
        Object.entries(seatWins).map(([key, value]) => [
          key,
          value / Math.max(1, rows.length),
        ]),
      ),
      meanTurns:
        configTurns.reduce((a, b) => a + b, 0) /
        Math.max(1, configTurns.length),
      p95Turns: percentile(configTurns, 0.95),
      gamesPerSecond: rows.length / Math.max(0.001, configRuntime / 1000),
    };
  });
  const findings: BalanceStudyReport['findings'] = [];
  if (outcomes.engineError || invariantFailures)
    findings.push({
      classification: 'failure',
      code: 'engine-integrity',
      message: `${outcomes.engineError} engine errors and ${invariantFailures} invariant failures observed.`,
    });
  playerCountSeatSummaries.forEach((summary) => {
    summary.seats.forEach((seat) => {
      if (seat.samples < thresholds.minimumSamples) return;
      if (
        Math.abs(seat.differenceFromOutcomeAdjustedBaseline) >=
        thresholds.seatDifference
      )
        findings.push({
          classification: 'warning',
          code: 'unconditional-win-rate-imbalance',
          message: `${summary.playerCount}-seat seat ${seat.seat} won ${(seat.winRate * 100).toFixed(1)}% of all matches versus the ${(seat.outcomeAdjustedBaseline * 100).toFixed(1)}% outcome-adjusted baseline (${seat.samples} matches).`,
        });
      if (
        seat.victories >= thresholds.minimumSamples &&
        Math.abs(seat.differenceFromDecidedVictoryBaseline) >=
          thresholds.seatDifference &&
        (seat.decidedVictoryConfidenceInterval95[1] <
          seat.equalDecidedVictoryBaseline ||
          seat.decidedVictoryConfidenceInterval95[0] >
            seat.equalDecidedVictoryBaseline)
      )
        findings.push({
          classification: 'warning',
          code: 'decided-victory-seat-imbalance',
          message: `${summary.playerCount}-seat seat ${seat.seat} held ${(seat.decidedVictoryShare * 100).toFixed(1)}% of decided victories versus ${(seat.equalDecidedVictoryBaseline * 100).toFixed(2)}% equal share (${seat.victories} victories; association only, not causal proof).`,
        });
    });
  });
  const capRate =
    (outcomes.turnCap + outcomes.commandCap) / Math.max(1, completed.length);
  if (capRate >= thresholds.capRate)
    findings.push({
      classification: 'warning',
      code: 'cap-rate',
      message: `${(capRate * 100).toFixed(1)}% of completed matches reached a configured cap.`,
    });
  const stalemateRate = outcomes.stalemate / Math.max(1, completed.length);
  if (stalemateRate >= thresholds.stalemateRate)
    findings.push({
      classification: 'warning',
      code: 'stalemate-rate',
      message: `${(stalemateRate * 100).toFixed(1)}% of completed matches ended in stalemate.`,
    });
  const unresolvedRate =
    (outcomes.stalemate + outcomes.turnCap + outcomes.commandCap) /
    Math.max(1, completed.length);
  if (
    completed.length >= thresholds.minimumSamples &&
    unresolvedRate >= 1 - thresholds.lowVictoryRate
  )
    findings.push({
      classification: 'warning',
      code: 'overall-unresolved-rate',
      message: `${(unresolvedRate * 100).toFixed(1)}% of completed matches had no winner.`,
    });
  if (aggregate.diagnostic && completed.length >= thresholds.minimumSamples) {
    const assessment = aggregate.diagnostic.factorAssessment;
    if (assessment.includes('player ID'))
      findings.push({
        classification: 'warning',
        code: 'possible-player-id-correlation',
        message: assessment,
      });
    if (assessment.includes('controller stream'))
      findings.push({
        classification: 'warning',
        code: 'possible-controller-stream-correlation',
        message: assessment,
      });
    if (assessment.includes('mapping invalid'))
      findings.push({
        classification: 'warning',
        code: 'diagnostic-mapping-invalid',
        message: assessment,
      });
    if (assessment.includes('assignment position'))
      findings.push({
        classification: 'warning',
        code: 'possible-assignment-position-correlation',
        message: assessment,
      });
  }
  configurations.forEach((configuration) => {
    if (configuration.matchesCompleted < thresholds.minimumSamples) return;
    const turnCaps = configuration.outcomes['turn-cap'] ?? 0;
    const commandCaps = configuration.outcomes['command-cap'] ?? 0;
    const stalemates = configuration.outcomes.stalemate ?? 0;
    const victories = configuration.outcomes.victory ?? 0;
    const samples = configuration.matchesCompleted;
    const add = (code: string, message: string) =>
      findings.push({
        classification: 'warning',
        code,
        configurationId: configuration.id,
        message,
      });
    if (turnCaps / samples >= thresholds.capRate)
      add(
        'configuration-turn-cap-rate',
        `${configuration.id}: ${((turnCaps / samples) * 100).toFixed(1)}% reached the turn cap (${samples} matches).`,
      );
    if (commandCaps / samples >= thresholds.capRate)
      add(
        'configuration-command-cap-rate',
        `${configuration.id}: ${((commandCaps / samples) * 100).toFixed(1)}% reached the command cap (${samples} matches).`,
      );
    if (stalemates / samples >= thresholds.stalemateRate)
      add(
        'configuration-stalemate-rate',
        `${configuration.id}: ${((stalemates / samples) * 100).toFixed(1)}% ended in stalemate (${samples} matches).`,
      );
    if (victories / samples < thresholds.lowVictoryRate)
      add(
        'configuration-low-victory-rate',
        `${configuration.id}: ${((victories / samples) * 100).toFixed(1)}% ended in normal victory (${samples} matches).`,
      );
    if (
      configuration.p95Turns >=
      matrix.find((item) => item.configurationId === configuration.id)!.maxTurns
    )
      add(
        'configuration-length-cap',
        `${configuration.id}: p95 match length reached the configured turn cap.`,
      );
    Object.entries(configuration.seatWinRates).forEach(([seat, winRate]) => {
      const baseline = 1 / configuration.playerCount;
      const wins = Math.round(winRate * samples);
      const interval = wilson95(wins, samples);
      if (
        Math.abs(winRate - baseline) >= thresholds.seatDifference &&
        (interval[1] < baseline || interval[0] > baseline)
      )
        add(
          'configuration-seat-dominance',
          `${configuration.id}: ${seat} won ${(winRate * 100).toFixed(1)}% versus the ${(baseline * 100).toFixed(2)}% equal-seat baseline (${samples} matches; 95% Wilson interval ${(interval[0] * 100).toFixed(1)}–${(interval[1] * 100).toFixed(1)}%). This is an association, not evidence of causation.`,
        );
    });
  });
  findings.push({
    classification: 'informational',
    code: 'method',
    message: `Seat uncertainty uses a 95% Wilson score interval. Configuration warnings require ${thresholds.minimumSamples} samples; cap/stalemate thresholds are ${(thresholds.capRate * 100).toFixed(0)}%/${(thresholds.stalemateRate * 100).toFixed(0)}%, low-victory is below ${(thresholds.lowVictoryRate * 100).toFixed(0)}%. Controller ${HEURISTIC_CONTROLLER_VERSION}.`,
  });
  return { aggregate, configurations, findings, reproductions };
}
