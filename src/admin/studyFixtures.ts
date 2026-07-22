import type { BalanceStudyReport } from './balanceStudyContract';

function playerCountSummary(
  playerCount: 4 | 5 | 6,
  matches: number,
  victories: number,
) {
  const wins = Array.from(
    { length: playerCount },
    (_, index) =>
      Math.floor(victories / playerCount) +
      (index < victories % playerCount ? 1 : 0),
  );
  return {
    playerCount,
    purpose: 'product-balance' as const,
    matches,
    victories,
    unresolved: matches - victories,
    stalemates: Math.floor((matches - victories) / 2),
    turnCaps: matches - victories - Math.floor((matches - victories) / 2),
    seats: wins.map((seatWins, index) => ({
      seat: index + 1,
      samples: matches,
      wins: seatWins,
      winRate: seatWins / matches,
      equalSeatBaseline: 1 / playerCount,
      differenceFromBaseline: seatWins / matches - 1 / playerCount,
      confidenceInterval95: [
        Math.max(0, seatWins / matches - 0.04),
        Math.min(1, seatWins / matches + 0.04),
      ] as [number, number],
      meanStartingTerritories: 42 / playerCount,
      victories,
      unresolved: matches - victories,
      outcomeAdjustedBaseline: victories / playerCount / matches,
      differenceFromOutcomeAdjustedBaseline:
        seatWins / matches - victories / playerCount / matches,
      decidedVictoryShare: seatWins / victories,
      equalDecidedVictoryBaseline: 1 / playerCount,
      differenceFromDecidedVictoryBaseline:
        seatWins / victories - 1 / playerCount,
      decidedVictoryConfidenceInterval95: [
        Math.max(0, seatWins / victories - 0.04),
        Math.min(1, seatWins / victories + 0.04),
      ] as [number, number],
    })),
  };
}

const base: BalanceStudyReport = {
  schemaVersion: 1,
  id: 'balance-fixture-completed',
  preset: 'quick',
  presetVersion: 2,
  purpose: 'mixed',
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
    estimateSource: '3 valid completed configuration timing samples',
    estimateQuality: 'historical-similar',
    estimatedRuntimeRangeMs: [12000, 20000],
    warningThresholds: {
      seatDifference: 0.08,
      capRate: 0.05,
      stalemateRate: 0.05,
      minimumSamples: 30,
      lowVictoryRate: 0.8,
    },
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
    playerCountSeatSummaries: [
      playerCountSummary(4, 1_000, 960),
      playerCountSummary(5, 1_000, 880),
      playerCountSummary(6, 1_000, 838),
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
    diagnostic: {
      rotationDesign:
        'Six logical-player/turn rotations crossed with six assignment-order rotations.',
      pairRotationCount: 36,
      logicalPlayerWins: {
        'player-01': 7,
        'player-02': 6,
        'player-03': 6,
        'player-04': 7,
        'player-05': 6,
        'player-06': 6,
      },
      assignmentPositionWins: {
        'assignment-1': 6,
        'assignment-2': 6,
        'assignment-3': 7,
        'assignment-4': 6,
        'assignment-5': 7,
        'assignment-6': 6,
      },
      logicalPlayerSummaries: [],
      assignmentPositionSummaries: [],
      factorAssessment: 'No clear factor exceeds the diagnostic threshold.',
      suspiciousReproductions: [],
    },
  },
  configurations: [
    {
      id: 'small-2p-12t-2c-0',
      group: 'small',
      purpose: 'engine-coverage',
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
      purpose: 'product-balance',
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
      classification: 'warning',
      code: 'configuration-cap-rate',
      configurationId: 'standard-4p-32t-5c-1',
      message:
        'standard-4p-32t-5c-1: 5.0% reached the configured turn cap (40 matches).',
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
    if (status === 'running')
      report.heartbeat = {
        runId: report.id,
        processId: 4321,
        writtenAt: report.updatedAt,
        commandCount: 800,
        matchIndex: 17,
      };
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
