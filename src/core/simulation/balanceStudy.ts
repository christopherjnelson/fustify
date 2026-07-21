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
      const pair = Math.floor(localIndex / Math.max(1, entry.playerCount));
      const seatRotation =
        localIndex % Math.min(config.rotations, entry.playerCount);
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
          return [
            {
              playerCount,
              purpose,
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
                return {
                  seat,
                  samples,
                  wins,
                  winRate,
                  equalSeatBaseline: baseline,
                  differenceFromBaseline: winRate - baseline,
                  confidenceInterval95: wilson95(wins, samples),
                  meanStartingTerritories: territories / samples,
                };
              }),
            },
          ];
        },
      );
    });
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
  seatSummaries
    .filter(
      (seat) =>
        seat.samples >= thresholds.minimumSamples &&
        Math.abs(seat.differenceFromBaseline) >= thresholds.seatDifference,
    )
    .forEach((seat) =>
      findings.push({
        classification: 'warning',
        code: 'seat-imbalance',
        message: `Seat ${seat.seat} observed ${(seat.winRate * 100).toFixed(1)}% wins (${seat.samples} samples; 95% Wilson interval ${(seat.confidenceInterval95[0] * 100).toFixed(1)}–${(seat.confidenceInterval95[1] * 100).toFixed(1)}%). This is an association, not evidence of causation.`,
      }),
    );
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
    if ((turnCaps + commandCaps) / samples >= thresholds.capRate)
      add(
        'configuration-cap-rate',
        `${configuration.id}: ${(((turnCaps + commandCaps) / samples) * 100).toFixed(1)}% reached a configured cap (${samples} matches).`,
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
