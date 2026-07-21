import { describe, expect, it } from 'vitest';
import {
  aggregateStudy,
  BALANCE_PRESETS,
  balanceStudyConfigSchema,
  createStudyMatrix,
  percentile,
  stableHash,
  wilson95,
  type CompletedStudyMatch,
} from './balanceStudy';
import type { HeadlessMatchResult } from './botMatch';

function completed(
  input: ReturnType<typeof createStudyMatrix>[number],
  winner = 'player-01',
  outcome: HeadlessMatchResult['outcome'] = 'victory',
): CompletedStudyMatch {
  return {
    input,
    result: {
      outcome,
      winnerPlayerId: outcome === 'victory' ? winner : undefined,
      rounds: 5,
      turns: 10 + input.index,
      commandsApplied: 50,
      attacksAttempted: 8,
      territoriesCaptured: 3,
      eliminations: 1,
      invariantViolations: [],
      reason: 'fixture',
      reproduction: {
        worldSeed: input.worldSeed,
        matchSeed: input.matchSeed,
        territoryCount: input.territoryCount,
        continentCount: input.continentCount,
        playerCount: input.playerCount,
        ownershipVariant: input.ownershipVariant,
        assignmentMode: 'random',
        controllers: Array.from(
          { length: input.playerCount },
          () => 'heuristic-bot',
        ),
        controllerVersion: 'balanced-v1',
        maxTurns: input.maxTurns,
        maxCommands: input.maxCommands,
        maxTurnsWithoutCapture: input.maxTurnsWithoutCapture,
        seatRotation: input.seatRotation,
      },
      metrics: {
        attacksAttempted: 8,
        territoriesCaptured: 3,
        eliminations: 1,
        eliminationOrder: ['player-02'],
        armiesLostByPlayer: {},
        continentControlTurnsByPlayer: { 'player-01': 2, 'player-02': 1 },
        continentBonusEarnedByPlayer: {},
        territoryCheckpoints: [
          {
            turnNumber: 1,
            territoriesByPlayer: { 'player-01': 6, 'player-02': 6 },
          },
        ],
        leadChanges: 2,
        longestTurnsWithoutCapture: 4,
        rejectedCommands: 0,
        runtimeMs: 100,
      },
    },
  };
}

describe('balance study configuration and aggregation', () => {
  it('runtime-validates presets and rejects invalid combinations', () => {
    expect(
      balanceStudyConfigSchema.parse(BALANCE_PRESETS.quick).configurations,
    ).toHaveLength(5);
    expect(() =>
      balanceStudyConfigSchema.parse({
        ...BALANCE_PRESETS.quick,
        configurations: [
          {
            group: 'bad',
            playerCount: 6,
            territoryCount: 12,
            continentCount: 13,
          },
        ],
      }),
    ).toThrow();
  });
  it('generates a stable varied matrix with paired seeds and rotations', () => {
    const first = createStudyMatrix(BALANCE_PRESETS.quick);
    const second = createStudyMatrix(BALANCE_PRESETS.quick);
    expect(first).toEqual(second);
    expect(stableHash(first)).toBe(stableHash(second));
    expect(first).toHaveLength(20);
    expect(new Set(first.map((item) => item.playerCount)).size).toBeGreaterThan(
      1,
    );
    expect(first[0]?.worldSeed).toBe(first[1]?.worldSeed);
    expect(first[0]?.seatRotation).not.toBe(first[1]?.seatRotation);
  });
  it('uses nearest-rank percentiles and Wilson uncertainty', () => {
    expect(percentile([1, 2, 3, 4, 100], 0.9)).toBe(100);
    const interval = wilson95(55, 100);
    expect(interval[0]).toBeLessThan(0.55);
    expect(interval[1]).toBeGreaterThan(0.55);
  });
  it('aggregates outcomes, rotated seats, breakdowns, and warning classifications without double counting', () => {
    const matrix = createStudyMatrix({
      ...BALANCE_PRESETS.quick,
      configurations: [BALANCE_PRESETS.quick.configurations[0]!],
      matchesPerConfiguration: 2,
    });
    const rows = [completed(matrix[0]!), completed(matrix[1]!)];
    const result = aggregateStudy(matrix, rows, 200, {
      seatDifference: 0.01,
      capRate: 0.5,
      stalemateRate: 0.5,
      minimumSamples: 30,
      lowVictoryRate: 0.8,
    });
    expect(result.aggregate.matchesCompleted).toBe(2);
    expect(result.aggregate.outcomes.victory).toBe(2);
    expect(result.aggregate.seatSummaries.map((seat) => seat.wins)).toEqual([
      1, 0, 0, 1,
    ]);
    expect(result.configurations[0]?.matchesCompleted).toBe(2);
    expect(
      result.findings.some((item) => item.classification === 'failure'),
    ).toBe(false);
    expect(result.aggregate.playerCountSeatSummaries?.[0]?.playerCount).toBe(4);
  });

  it('warns for configuration pacing only after the minimum sample size', () => {
    const matrix = createStudyMatrix({
      ...BALANCE_PRESETS.quick,
      configurations: [BALANCE_PRESETS.quick.configurations[0]!],
      matchesPerConfiguration: 30,
    });
    const rows = matrix.map((input) =>
      completed(input, 'player-01', 'turn-cap'),
    );
    const result = aggregateStudy(
      matrix,
      rows,
      3_000,
      BALANCE_PRESETS.quick.warningThresholds,
    );
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'configuration-cap-rate',
          configurationId: matrix[0]!.configurationId,
        }),
      ]),
    );
    const lowSample = aggregateStudy(
      matrix,
      rows.slice(0, 2),
      200,
      BALANCE_PRESETS.quick.warningThresholds,
    );
    expect(
      lowSample.findings.some((item) => item.code === 'configuration-cap-rate'),
    ).toBe(false);
  });
});
