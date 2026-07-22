import { describe, expect, it } from 'vitest';
import {
  aggregateStudy,
  BALANCE_PRESETS,
  balanceStudyConfigSchema,
  createStudyMatrix,
  diagnosticPlayerMappings,
  diagnosticDebugRows,
  diagnosticBlockAccounting,
  percentile,
  stableHash,
  SIX_SEAT_DIAGNOSTIC_PRESETS,
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
  it.each([
    [12, 0, 12],
    [576, 16, 0],
    [600, 16, 24],
    [1_800, 50, 0],
  ])(
    'classifies %i diagnostic matches into complete blocks and remainder',
    (total, blocks, remainder) => {
      expect(diagnosticBlockAccounting(total)).toEqual({
        matchesPerBlock: 36,
        totalMatches: total,
        completeBlockCount: blocks,
        matchesInCompleteBlocks: blocks * 36,
        partialRemainder: remainder,
      });
    },
  );
  it('aligns standard and thorough scales to exact blocks', () => {
    expect(SIX_SEAT_DIAGNOSTIC_PRESETS.standard.matchesPerConfiguration).toBe(
      576,
    );
    expect(SIX_SEAT_DIAGNOSTIC_PRESETS.thorough.matchesPerConfiguration).toBe(
      1_800,
    );
  });
  it('classifies the completed smoke subset as a warned partial block', () => {
    const matrix = createStudyMatrix(SIX_SEAT_DIAGNOSTIC_PRESETS.smoke);
    const result = aggregateStudy(
      matrix,
      matrix.map((input) => completed(input)),
      1,
      SIX_SEAT_DIAGNOSTIC_PRESETS.smoke.warningThresholds,
    );
    expect(result.aggregate.diagnostic?.blockAccounting).toMatchObject({
      completeBlockCount: 0,
      partialRemainder: 12,
    });
    expect(result.aggregate.diagnostic?.factorAssessment).toContain(
      'complete a full 36-match rotation block',
    );
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'partial-diagnostic-block' }),
      ]),
    );
  });
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
  it('builds deterministic six-seat logical-player and assignment rotations', () => {
    const first = createStudyMatrix(SIX_SEAT_DIAGNOSTIC_PRESETS.smoke);
    expect(first).toEqual(createStudyMatrix(SIX_SEAT_DIAGNOSTIC_PRESETS.smoke));
    expect(first).toHaveLength(12);
    expect(new Set(first.map((item) => item.worldSeed))).toHaveLength(1);
    expect(first.slice(0, 6).map((item) => item.seatRotation)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(first.slice(0, 6).map((item) => item.assignmentRotation)).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
    expect(first.slice(6, 12).map((item) => item.assignmentRotation)).toEqual([
      1, 1, 1, 1, 1, 1,
    ]);
  });
  it('covers every seat, assignment, and controller stream in a full 36-match block', () => {
    const matrix = createStudyMatrix({
      ...SIX_SEAT_DIAGNOSTIC_PRESETS.standard,
      matchesPerConfiguration: 36,
    });
    const exposures = new Map<string, number>();
    matrix.flatMap(diagnosticPlayerMappings).forEach((mapping) => {
      [
        `seat-${mapping.turnSeat}`,
        `assignment-${mapping.assignmentPosition}`,
        mapping.controllerStreamId,
      ].forEach((factor) => {
        const key = `${mapping.logicalPlayerId}:${factor}`;
        exposures.set(key, (exposures.get(key) ?? 0) + 1);
      });
    });
    expect(exposures).toHaveLength(108);
    expect(new Set(exposures.values())).toEqual(new Set([6]));
    expect(matrix.map((input) => input.controllerStreamRotation)).toEqual(
      matrix.map(
        (input) => (input.seatRotation + input.assignmentRotation) % 6,
      ),
    );
  });
  it('serializes compact per-match diagnostic mapping and winner attribution', () => {
    const input = createStudyMatrix({
      ...SIX_SEAT_DIAGNOSTIC_PRESETS.standard,
      matchesPerConfiguration: 36,
    })[7]!;
    const row = diagnosticDebugRows([completed(input, 'player-03')])[0]!;
    const winner = diagnosticPlayerMappings(input).find(
      ({ logicalPlayerId }) => logicalPlayerId === 'player-03',
    )!;
    expect(row).toMatchObject({
      worldSeed: input.worldSeed,
      matchSeed: input.matchSeed,
      seatRotation: input.seatRotation,
      assignmentRotation: input.assignmentRotation,
      controllerStreamRotation: input.controllerStreamRotation,
      winnerLogicalPlayer: 'player-03',
      winnerSeat: winner.turnSeat,
      winnerAssignmentPosition: winner.assignmentPosition,
      winnerControllerStream: winner.controllerStreamId,
      outcome: 'victory',
      matchLength: 17,
    });
    expect(row.logicalPlayersBySeat).toHaveLength(6);
    expect(() => JSON.parse(JSON.stringify(row))).not.toThrow();
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

  it('separates all-match win rate from decided-victory share', () => {
    const matrix = createStudyMatrix({
      ...BALANCE_PRESETS.quick,
      configurations: [BALANCE_PRESETS.quick.configurations[0]!],
      matchesPerConfiguration: 4,
    });
    const rows = [
      completed(matrix[0]!, 'player-01'),
      completed(matrix[1]!, 'player-02'),
      completed(matrix[2]!, 'player-01', 'stalemate'),
      completed(matrix[3]!, 'player-01', 'turn-cap'),
    ];
    const result = aggregateStudy(
      matrix,
      rows,
      400,
      BALANCE_PRESETS.quick.warningThresholds,
    );
    const summary = result.aggregate.playerCountSeatSummaries![0]!;
    expect(summary.matches).toBe(4);
    expect(summary.victories).toBe(2);
    expect(summary.unresolved).toBe(2);
    expect(summary.seats[0]).toMatchObject({
      outcomeAdjustedBaseline: 0.125,
      equalDecidedVictoryBaseline: 0.25,
    });
    expect(summary.seats.reduce((sum, seat) => sum + seat.winRate, 0)).toBe(
      0.5,
    );
    expect(
      summary.seats.reduce(
        (sum, seat) => sum + (seat.decidedVictoryShare ?? 0),
        0,
      ),
    ).toBe(1);
  });

  it.each([
    [4, 0.25],
    [5, 0.2],
    [6, 1 / 6],
  ])(
    'uses the nominal decided-victory baseline for %i seats',
    (count, baseline) => {
      const matrix = createStudyMatrix({
        ...BALANCE_PRESETS.quick,
        configurations: [
          { ...BALANCE_PRESETS.quick.configurations[0]!, playerCount: count },
        ],
        matchesPerConfiguration: 1,
      });
      const result = aggregateStudy(
        matrix,
        [completed(matrix[0]!)],
        100,
        BALANCE_PRESETS.quick.warningThresholds,
      );
      expect(
        result.aggregate.playerCountSeatSummaries![0]!.seats[0]!
          .equalDecidedVictoryBaseline,
      ).toBeCloseTo(baseline);
    },
  );

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
          code: 'configuration-turn-cap-rate',
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
      lowSample.findings.some(
        (item) => item.code === 'configuration-turn-cap-rate',
      ),
    ).toBe(false);
  });

  it('classifies a rotated logical-player correlation without calling it an engine failure', () => {
    const matrix = createStudyMatrix({
      ...SIX_SEAT_DIAGNOSTIC_PRESETS.standard,
      matchesPerConfiguration: 180,
    });
    const result = aggregateStudy(
      matrix,
      matrix.map((input) => completed(input, 'player-06')),
      3_600,
      SIX_SEAT_DIAGNOSTIC_PRESETS.standard.warningThresholds,
    );
    expect(result.aggregate.diagnostic?.logicalPlayerWins['player-06']).toBe(
      180,
    );
    expect(result.aggregate.diagnostic?.factorAssessment).toContain(
      'logical player ID',
    );
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          classification: 'warning',
          code: 'possible-player-id-correlation',
        }),
      ]),
    );
    expect(
      result.findings.some((item) => item.classification === 'failure'),
    ).toBe(false);
  });
  it('classifies an independently attributed controller-stream correlation', () => {
    const matrix = createStudyMatrix({
      ...SIX_SEAT_DIAGNOSTIC_PRESETS.standard,
      matchesPerConfiguration: 180,
    });
    const rows = matrix.map((input) => {
      const winner = diagnosticPlayerMappings(input).find(
        ({ controllerStreamId }) => controllerStreamId === 'controller-1',
      )!;
      return completed(input, winner.logicalPlayerId);
    });
    const result = aggregateStudy(
      matrix,
      rows,
      3_600,
      SIX_SEAT_DIAGNOSTIC_PRESETS.standard.warningThresholds,
    );
    expect(result.aggregate.diagnostic).toMatchObject({
      mappingValid: true,
      controllerStreamWins: { 'controller-1': 180 },
    });
    expect(result.aggregate.diagnostic?.factorAssessment).toContain(
      'controller stream position',
    );
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'possible-controller-stream-correlation',
        }),
      ]),
    );
  });

  it('keeps a single complete block below the factor-classification sample floor', () => {
    const matrix = createStudyMatrix({
      ...SIX_SEAT_DIAGNOSTIC_PRESETS.standard,
      matchesPerConfiguration: 36,
    });
    const result = aggregateStudy(
      matrix,
      matrix.map((input) => completed(input, 'player-02')),
      3_600,
      SIX_SEAT_DIAGNOSTIC_PRESETS.standard.warningThresholds,
    );
    expect(result.aggregate.diagnostic?.mappingValid).toBe(true);
    expect(result.aggregate.diagnostic?.factorAssessment).toContain(
      'Insufficient sample size for factor classification',
    );
  });

  it('refuses factor attribution for an invalid rotation mapping', () => {
    const matrix = createStudyMatrix({
      ...SIX_SEAT_DIAGNOSTIC_PRESETS.standard,
      matchesPerConfiguration: 36,
    });
    matrix[5] = { ...matrix[5]!, controllerStreamRotation: 0 };
    const result = aggregateStudy(
      matrix,
      matrix.map((input) => completed(input)),
      3_500,
      SIX_SEAT_DIAGNOSTIC_PRESETS.standard.warningThresholds,
    );
    expect(result.aggregate.diagnostic?.mappingValid).toBe(false);
    expect(result.aggregate.diagnostic?.factorAssessment).toContain(
      'mapping invalid',
    );
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          classification: 'failure',
          code: 'diagnostic-mapping-invalid',
        }),
      ]),
    );
  });

  it('uses sixteen complete blocks and reports a 24-match remainder for 600 matches', () => {
    const matrix = createStudyMatrix({
      ...SIX_SEAT_DIAGNOSTIC_PRESETS.standard,
      matchesPerConfiguration: 600,
    });
    const result = aggregateStudy(
      matrix,
      matrix.map((input) => completed(input)),
      1,
      SIX_SEAT_DIAGNOSTIC_PRESETS.standard.warningThresholds,
    );
    expect(result.aggregate.diagnostic).toMatchObject({
      mappingValid: true,
      factorMatchesAnalyzed: 576,
      blockAccounting: {
        completeBlockCount: 16,
        matchesInCompleteBlocks: 576,
        partialRemainder: 24,
        totalMatches: 600,
      },
    });
    expect(result.aggregate.diagnostic?.factorAssessment).not.toContain(
      'complete a full',
    );
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'partial-diagnostic-block' }),
      ]),
    );
  });
});
