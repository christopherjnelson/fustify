import { z } from 'zod';

export const BALANCE_STUDY_SCHEMA_VERSION = 1 as const;
export const studyStatusSchema = z.enum([
  'planning',
  'running',
  'completed',
  'failed',
  'interrupted',
]);

export const studyFindingSchema = z.object({
  classification: z.enum(['failure', 'warning', 'informational']),
  code: z.string().max(100),
  message: z.string().max(2_000),
  configurationId: z.string().max(200).optional(),
  reproduction: z.string().max(5_000).optional(),
});

export const seatSummarySchema = z.object({
  seat: z.number().int().min(1).max(6),
  samples: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
  equalSeatBaseline: z.number().min(0).max(1),
  differenceFromBaseline: z.number().min(-1).max(1),
  confidenceInterval95: z.tuple([
    z.number().min(0).max(1),
    z.number().min(0).max(1),
  ]),
  meanStartingTerritories: z.number().nonnegative(),
});

export const studyAggregateSchema = z.object({
  matchesRequested: z.number().int().nonnegative(),
  matchesStarted: z.number().int().nonnegative(),
  matchesCompleted: z.number().int().nonnegative(),
  outcomes: z.object({
    victory: z.number().int().nonnegative(),
    stalemate: z.number().int().nonnegative(),
    turnCap: z.number().int().nonnegative(),
    commandCap: z.number().int().nonnegative(),
    engineError: z.number().int().nonnegative(),
  }),
  invariantFailures: z.number().int().nonnegative(),
  seatSummaries: z.array(seatSummarySchema).max(6),
  playerCountSeatSummaries: z
    .array(
      z.object({
        playerCount: z.number().int().min(2).max(6),
        purpose: z.enum(['product-balance', 'engine-coverage']),
        seats: z.array(seatSummarySchema).max(6),
      }),
    )
    .optional(),
  turns: z.object({
    mean: z.number().nonnegative(),
    minimum: z.number().nonnegative(),
    median: z.number().nonnegative(),
    p90: z.number().nonnegative(),
    p95: z.number().nonnegative(),
    p99: z.number().nonnegative(),
    maximum: z.number().nonnegative(),
  }),
  attacks: z.number().int().nonnegative(),
  captures: z.number().int().nonnegative(),
  leadChanges: z.number().int().nonnegative(),
  longestTurnsWithoutCapture: z.number().int().nonnegative(),
  eliminationsBySeat: z.record(z.string(), z.number().int().nonnegative()),
  continentControlTurnsBySeat: z.record(
    z.string(),
    z.number().int().nonnegative(),
  ),
  runtimeMs: z.number().nonnegative(),
  gamesPerSecond: z.number().nonnegative(),
});

export const configurationAggregateSchema = z.object({
  id: z.string().max(200),
  group: z.string().max(100),
  purpose: z.enum(['product-balance', 'engine-coverage']).optional(),
  playerCount: z.number().int().min(2).max(6),
  territoryCount: z.number().int().min(12).max(48),
  continentCount: z.number().int().min(2).max(8),
  worldSize: z.enum(['small', 'standard', 'large']),
  matchesRequested: z.number().int().nonnegative(),
  matchesCompleted: z.number().int().nonnegative(),
  outcomes: z.record(z.string(), z.number().int().nonnegative()),
  seatWinRates: z.record(z.string(), z.number().min(0).max(1)),
  meanTurns: z.number().nonnegative(),
  p95Turns: z.number().nonnegative(),
  gamesPerSecond: z.number().nonnegative(),
});

export const balanceStudyReportSchema = z.object({
  schemaVersion: z.literal(BALANCE_STUDY_SCHEMA_VERSION),
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/),
  preset: z.string().max(100),
  presetVersion: z.number().int().positive().optional(),
  purpose: z.enum(['product-balance', 'engine-coverage', 'mixed']).optional(),
  configLabel: z.string().max(200),
  configHash: z.string().regex(/^[a-f0-9]{64}$/),
  matrixHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: studyStatusSchema,
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  processId: z.number().int().positive().optional(),
  repository: z.object({
    branch: z.string().max(500),
    commit: z.string().regex(/^[a-f0-9]{7,64}$/),
    worktreeCleanAtStart: z.boolean(),
    resumeCommitMismatch: z.boolean().optional(),
  }),
  plan: z.object({
    configurations: z.number().int().nonnegative(),
    matchesPerConfiguration: z.number().int().positive(),
    totalMatches: z.number().int().nonnegative(),
    workers: z.number().int().positive(),
    checkpointEvery: z.number().int().positive(),
    seedPrefix: z.string().max(200),
    estimatedRuntimeMs: z.number().nonnegative(),
    estimatedDiskBytes: z.number().nonnegative(),
    estimateSource: z.string().max(200).optional(),
    estimateQuality: z
      .enum(['historical-exact', 'historical-similar', 'conservative-fallback'])
      .optional(),
    estimatedRuntimeRangeMs: z
      .tuple([z.number().nonnegative(), z.number().nonnegative()])
      .optional(),
    warningThresholds: z
      .object({
        seatDifference: z.number(),
        capRate: z.number(),
        stalemateRate: z.number(),
        minimumSamples: z.number().int(),
        lowVictoryRate: z.number(),
      })
      .optional(),
  }),
  aggregate: studyAggregateSchema,
  configurations: z.array(configurationAggregateSchema).max(5_000),
  findings: z.array(studyFindingSchema).max(1_000),
  reproductions: z.array(z.string().max(5_000)).max(1_000),
  checkpoint: z.object({
    completedMatchIndices: z.array(z.number().int().nonnegative()).max(500_000),
    lastWrittenAt: z.string().datetime(),
    resumable: z.boolean(),
  }),
});

export type BalanceStudyReport = z.infer<typeof balanceStudyReportSchema>;
export type StudyAggregate = z.infer<typeof studyAggregateSchema>;

export function parseBalanceStudyReport(value: unknown): BalanceStudyReport {
  return balanceStudyReportSchema.parse(value);
}
