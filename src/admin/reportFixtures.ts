import { summarizeRun, type VerificationRun } from './reportContract';

const base: VerificationRun = {
  schemaVersion: 1,
  id: 'fixture-passed',
  profile: 'standard',
  startedAt: '2026-07-20T14:00:00.000Z',
  completedAt: '2026-07-20T14:03:42.000Z',
  updatedAt: '2026-07-20T14:03:42.000Z',
  status: 'passed',
  repository: {
    branch: 'feat/admin-verification-dashboard-with-a-purposefully-long-name',
    commit: 'b6c7c06c7f7d11ed8a2bc014f2cc7b2fc536ebac',
    shortCommit: 'b6c7c06c7f7d',
    commitSubject:
      'feat: add deterministic controllers and simulation reporting with a long descriptive subject',
    worktreeCleanAtStart: true,
    worktreeCleanAtEnd: true,
  },
  environment: { nodeVersion: 'v22.17.0', platform: 'linux' },
  suites: [
    {
      id: 'unit',
      displayName: 'Unit tests',
      category: 'unit',
      status: 'passed',
      command: 'pnpm test',
      startedAt: '2026-07-20T14:00:00.000Z',
      completedAt: '2026-07-20T14:00:08.000Z',
      durationMs: 8000,
      counts: { passed: 184, failed: 0, skipped: 3, total: 187 },
      exitCode: 0,
      summary: '184 tests passed across 21 files.',
      complete: true,
    },
    {
      id: 'typecheck',
      displayName: 'TypeScript',
      category: 'typecheck',
      status: 'passed',
      command: 'pnpm exec tsc -b',
      durationMs: 4200,
      exitCode: 0,
      summary: 'No type errors.',
      complete: true,
    },
    {
      id: 'coverage',
      displayName: 'Coverage',
      category: 'coverage',
      status: 'passed',
      command: 'pnpm test:coverage',
      durationMs: 9200,
      exitCode: 0,
      summary: 'Coverage thresholds satisfied.',
      complete: true,
    },
    {
      id: 'bot-quick',
      displayName: 'Quick deterministic bot-match simulation',
      category: 'bot-quick',
      status: 'passed',
      command: 'pnpm test:bot',
      durationMs: 6800,
      exitCode: 0,
      summary: '30 bounded matches completed.',
      complete: true,
    },
  ],
  coverage: {
    statements: { covered: 1280, total: 1380, percent: 92.75 },
    branches: { covered: 410, total: 474, percent: 86.5 },
    functions: { covered: 142, total: 142, percent: 100 },
    lines: { covered: 1200, total: 1280, percent: 93.75 },
  },
  simulations: [
    {
      kind: 'bot',
      label: 'Quick bot matrix',
      passed: true,
      gamesRequested: 30,
      gamesCompleted: 30,
      outcomes: {
        victory: 29,
        stalemate: 1,
        'turn-cap': 0,
        'command-cap': 0,
        'engine-error': 0,
      },
      winDistribution: { 'Player 1': 0.52, 'Player 2': 0.48 },
      meanTurns: 25.7,
      medianTurns: 15,
      p95Turns: 87,
      p99Turns: 140,
      stalemates: 1,
      turnCaps: 0,
      commandCaps: 0,
      engineErrors: 0,
      invariantFailures: 0,
      runtimeMs: 19560,
      gamesPerSecond: 1.53,
    },
  ],
  failures: [],
  totals: {
    suites: 4,
    completed: 4,
    passed: 4,
    failed: 0,
    skipped: 0,
    interrupted: 0,
    durationMs: 222000,
  },
};

function variant(
  id: string,
  status: VerificationRun['status'],
): VerificationRun {
  const run = structuredClone(base);
  run.id = `fixture-${id}`;
  run.status = status;
  if (status === 'running') {
    delete run.completedAt;
    run.updatedAt = new Date().toISOString();
    run.suites[1]!.status = 'running';
    run.suites[1]!.complete = false;
    run.suites[2]!.status = 'pending';
    run.suites[2]!.complete = false;
    run.suites[3]!.status = 'pending';
    run.suites[3]!.complete = false;
  }
  if (status === 'failed') {
    run.suites[1]!.status = 'failed';
    run.suites[1]!.summary = 'TypeScript found an incompatible report adapter.';
    run.suites[1]!.failureExcerpt =
      'src/admin/source.ts(42,7): error TS2322: Type unknown is not assignable to VerificationRun. This deliberately long excerpt should wrap without widening the dashboard.';
    run.failures = [
      {
        suiteId: 'typecheck',
        message: 'TypeScript failed',
        excerpt: run.suites[1]!.failureExcerpt,
        reproduction: {
          seed: 'bot-fixture-world-7',
          configuration: { players: 3, territories: 18 },
          command:
            'pnpm simulate:bots -- --reproduce \'{"worldSeed":"bot-fixture-world-7"}\' --trace',
          traceRef: 'traces/fixture-failure.json',
        },
      },
    ];
  }
  if (status === 'interrupted') {
    run.suites[1]!.status = 'interrupted';
    run.suites[1]!.complete = false;
    run.suites[1]!.summary = 'Runner received SIGINT.';
    run.suites[2]!.status = 'pending';
    run.suites[2]!.complete = false;
    run.environment.interruptedReason = 'Runner received SIGINT';
  }
  run.totals = summarizeRun(run);
  return run;
}

export const adminFixtures = {
  passed: base,
  running: variant('running', 'running'),
  failed: variant('failed', 'failed'),
  interrupted: variant('interrupted', 'interrupted'),
};
