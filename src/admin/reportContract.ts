import { z } from 'zod';

export const VERIFICATION_SCHEMA_VERSION = 1 as const;

export const runStatusSchema = z.enum([
  'queued',
  'running',
  'passed',
  'failed',
  'interrupted',
]);
export const suiteStatusSchema = z.enum([
  'pending',
  'running',
  'passed',
  'failed',
  'skipped',
  'interrupted',
]);

const coverageMetricSchema = z.object({
  covered: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  percent: z.number().min(0).max(100),
});

export const coverageSummarySchema = z.object({
  statements: coverageMetricSchema,
  branches: coverageMetricSchema,
  functions: coverageMetricSchema,
  lines: coverageMetricSchema,
});

export const reproductionSchema = z.object({
  command: z.string().max(2_000),
  seed: z.string().max(500).optional(),
  configuration: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
  traceRef: z.string().max(500).optional(),
});

export const simulationSummarySchema = z.object({
  kind: z.enum(['generation', 'bot']),
  label: z.string().max(200),
  passed: z.boolean(),
  gamesRequested: z.number().int().nonnegative().optional(),
  gamesCompleted: z.number().int().nonnegative().optional(),
  configurations: z.number().int().nonnegative().optional(),
  outcomes: z.record(z.string(), z.number().int().nonnegative()).optional(),
  winDistribution: z.record(z.string(), z.number().nonnegative()).optional(),
  meanTurns: z.number().nonnegative().optional(),
  medianTurns: z.number().nonnegative().optional(),
  p95Turns: z.number().nonnegative().optional(),
  p99Turns: z.number().nonnegative().optional(),
  stalemates: z.number().int().nonnegative().optional(),
  turnCaps: z.number().int().nonnegative().optional(),
  commandCaps: z.number().int().nonnegative().optional(),
  engineErrors: z.number().int().nonnegative().optional(),
  invariantFailures: z.number().int().nonnegative().optional(),
  runtimeMs: z.number().nonnegative().optional(),
  gamesPerSecond: z.number().nonnegative().optional(),
  reproductions: z.array(reproductionSchema).max(100).optional(),
});

export const suiteResultSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  displayName: z.string().max(200),
  category: z.enum([
    'unit',
    'typecheck',
    'interaction',
    'visual',
    'coverage',
    'lint',
    'build',
    'format',
    'repository',
    'generation-quick',
    'generation-stress',
    'bot-quick',
    'bot-stress',
    'bot-extended',
  ]),
  status: suiteStatusSchema,
  command: z.string().max(2_000),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().nonnegative().optional(),
  counts: z
    .object({
      passed: z.number().int().nonnegative().optional(),
      failed: z.number().int().nonnegative().optional(),
      skipped: z.number().int().nonnegative().optional(),
      total: z.number().int().nonnegative().optional(),
    })
    .optional(),
  exitCode: z.number().int().nullable().optional(),
  summary: z.string().max(2_000).optional(),
  failureExcerpt: z.string().max(12_000).optional(),
  artifactRefs: z.array(z.string().max(500)).max(20).optional(),
  reproductions: z.array(reproductionSchema).max(100).optional(),
  complete: z.boolean(),
});

export const verificationFailureSchema = z.object({
  suiteId: z.string(),
  message: z.string().max(2_000),
  excerpt: z.string().max(12_000).optional(),
  reproduction: reproductionSchema.optional(),
});

export const verificationRunSchema = z.object({
  schemaVersion: z.literal(VERIFICATION_SCHEMA_VERSION),
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/),
  profile: z.string().max(100),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  status: runStatusSchema,
  repository: z.object({
    branch: z.string().max(500),
    commit: z.string().regex(/^[a-f0-9]{7,64}$/),
    shortCommit: z.string().regex(/^[a-f0-9]{7,16}$/),
    commitSubject: z.string().max(1_000).optional(),
    worktreeCleanAtStart: z.boolean(),
    worktreeCleanAtEnd: z.boolean().optional(),
    changedFileCount: z.number().int().nonnegative().optional(),
  }),
  environment: z.object({
    nodeVersion: z.string().max(100).optional(),
    platform: z.string().max(100).optional(),
    interruptedReason: z.string().max(1_000).optional(),
  }),
  suites: z.array(suiteResultSchema).max(100),
  coverage: coverageSummarySchema.optional(),
  simulations: z.array(simulationSummarySchema).max(100).optional(),
  failures: z.array(verificationFailureSchema).max(100),
  totals: z.object({
    suites: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    interrupted: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative().optional(),
  }),
});

export type VerificationRun = z.infer<typeof verificationRunSchema>;
export type VerificationSuiteResult = z.infer<typeof suiteResultSchema>;
export type CoverageSummary = z.infer<typeof coverageSummarySchema>;
export type SimulationSummary = z.infer<typeof simulationSummarySchema>;

export function summarizeRun(run: VerificationRun): VerificationRun['totals'] {
  const finished = run.suites.filter(
    (suite) => !['pending', 'running'].includes(suite.status),
  );
  return {
    suites: run.suites.length,
    completed: finished.length,
    passed: run.suites.filter((suite) => suite.status === 'passed').length,
    failed: run.suites.filter((suite) => suite.status === 'failed').length,
    skipped: run.suites.filter((suite) => suite.status === 'skipped').length,
    interrupted: run.suites.filter((suite) => suite.status === 'interrupted')
      .length,
    durationMs:
      Date.parse(run.completedAt ?? run.updatedAt) - Date.parse(run.startedAt),
  };
}

export function parseVerificationRun(value: unknown): VerificationRun {
  return verificationRunSchema.parse(value);
}

export function isSafeRunId(id: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(id);
}
