import type { BalanceStudyReport } from './balanceStudyContract';

const base: BalanceStudyReport = {
  schemaVersion: 1,
  id: 'balance-fixture-completed',
  preset: 'quick',
  configLabel: 'Representative multi-configuration study',
  configHash: 'a'.repeat(64),
  matrixHash: 'b'.repeat(64),
  status: 'completed',
  startedAt: '2026-07-21T12:00:00.000Z',
  updatedAt: '2026-07-21T12:02:00.000Z',
  completedAt: '2026-07-21T12:02:00.000Z',
  repository: {
    branch: 'research/bot-balance-study',
    commit: 'bdf2eba1fdc2993f25cba5c1457859ee0ae71c65',
    worktreeCleanAtStart: true,
  },
  plan: {
    configurations: 4,
    matchesPerConfiguration: 10,
    totalMatches: 40,
    workers: 1,
    checkpointEvery: 10,
    seedPrefix: 'fixture',
    estimatedRuntimeMs: 15000,
    estimatedDiskBytes: 36000,
  },
  aggregate: {
    matchesRequested: 40,
    matchesStarted: 40,
    matchesCompleted: 40,
    outcomes: {
      victory: 38,
      stalemate: 1,
      turnCap: 1,
      commandCap: 0,
      engineError: 0,
    },
    invariantFailures: 0,
    seatSummaries: [
      {
        seat: 1,
        samples: 40,
        wins: 25,
        winRate: 0.625,
        equalSeatBaseline: 0.5,
        differenceFromBaseline: 0.125,
        confidenceInterval95: [0.47, 0.76],
        meanStartingTerritories: 9,
      },
      {
        seat: 2,
        samples: 40,
        wins: 13,
        winRate: 0.325,
        equalSeatBaseline: 0.5,
        differenceFromBaseline: -0.175,
        confidenceInterval95: [0.2, 0.48],
        meanStartingTerritories: 9,
      },
    ],
    turns: {
      mean: 28.4,
      minimum: 5,
      median: 19,
      p90: 72,
      p95: 91,
      p99: 144,
      maximum: 144,
    },
    attacks: 930,
    captures: 312,
    leadChanges: 88,
    longestTurnsWithoutCapture: 41,
    eliminationsBySeat: { '1': 13, '2': 25 },
    continentControlTurnsBySeat: { '1': 81, '2': 72 },
    runtimeMs: 120000,
    gamesPerSecond: 0.33,
  },
  configurations: [
    {
      id: 'small-2p-12t-2c-0',
      group: 'small',
      playerCount: 2,
      territoryCount: 12,
      continentCount: 2,
      worldSize: 'small',
      matchesRequested: 20,
      matchesCompleted: 20,
      outcomes: { victory: 19, stalemate: 1 },
      seatWinRates: { 'player-1': 0.6, 'player-2': 0.35 },
      meanTurns: 18,
      p95Turns: 50,
      gamesPerSecond: 0.5,
    },
    {
      id: 'standard-4p-32t-5c-1',
      group: 'standard',
      playerCount: 4,
      territoryCount: 32,
      continentCount: 5,
      worldSize: 'standard',
      matchesRequested: 20,
      matchesCompleted: 20,
      outcomes: { victory: 19, 'turn-cap': 1 },
      seatWinRates: { 'player-1': 0.3 },
      meanTurns: 38.8,
      p95Turns: 91,
      gamesPerSecond: 0.2,
    },
  ],
  findings: [
    {
      classification: 'warning',
      code: 'seat-imbalance',
      message:
        'Seat 1 observed 62.5% wins (40 samples; 95% Wilson interval 47.0–76.0%). This is an association, not evidence of causation.',
    },
    {
      classification: 'informational',
      code: 'method',
      message: 'Seat uncertainty uses a 95% Wilson score interval.',
    },
  ],
  reproductions: [],
  checkpoint: {
    completedMatchIndices: Array.from({ length: 40 }, (_, i) => i),
    lastWrittenAt: '2026-07-21T12:02:00.000Z',
    resumable: false,
  },
};

function variant(status: BalanceStudyReport['status']): BalanceStudyReport {
  const report = structuredClone(base);
  report.id = `balance-fixture-${status}`;
  report.status = status;
  if (status === 'running' || status === 'interrupted') {
    delete report.completedAt;
    report.aggregate.matchesCompleted = status === 'running' ? 17 : 23;
    report.aggregate.matchesStarted = report.aggregate.matchesCompleted;
    report.checkpoint.completedMatchIndices = Array.from(
      { length: report.aggregate.matchesCompleted },
      (_, i) => i,
    );
    report.checkpoint.resumable = true;
  }
  if (status === 'failed') {
    report.aggregate.outcomes.engineError = 1;
    report.aggregate.invariantFailures = 1;
    report.findings.unshift({
      classification: 'failure',
      code: 'engine-integrity',
      message: 'One invariant failure was preserved.',
      reproduction: `pnpm study:balance --reproduce '{"worldSeed":"fixture-failure"}' --verbose`,
    });
    report.reproductions = [report.findings[0]!.reproduction!];
  }
  return report;
}
export const balanceStudyFixtures = {
  completed: base,
  running: variant('running'),
  interrupted: variant('interrupted'),
  failed: variant('failed'),
  warning: base,
};
