import { describe, expect, it } from 'vitest';
import {
  createHeadlessPlayerAllocation,
  runBotSimulation,
  runHeadlessMatch,
} from './botMatch';

const focused = {
  worldSeed: 'bot-focused-world',
  matchSeed: 'bot-focused-match',
  territoryCount: 12,
  continentCount: 2,
  playerCount: 2,
  ownershipVariant: 0,
  maxTurns: 500,
  maxCommands: 8_000,
  maxTurnsWithoutCapture: 100,
};

describe('headless heuristic matches', () => {
  it(
    'replays identical configuration to identical authoritative results',
    { timeout: 120_000 },
    async () => {
      const first = await runHeadlessMatch(focused);
      const second = await runHeadlessMatch(focused);
      expect(first.outcome).toBe(second.outcome);
      expect(first.winnerPlayerId).toBe(second.winnerPlayerId);
      expect(first.commandsApplied).toBe(second.commandsApplied);
      expect(first.finalState).toEqual(second.finalState);
      expect(first.invariantViolations).toEqual([]);
    },
  );

  it(
    'classifies command, turn, and stalemate safeguards',
    { timeout: 120_000 },
    async () => {
      const commandCap = await runHeadlessMatch({ ...focused, maxCommands: 1 });
      expect(commandCap.outcome).toBe('command-cap');
      const turnCap = await runHeadlessMatch({ ...focused, maxTurns: 1 });
      expect(['victory', 'turn-cap']).toContain(turnCap.outcome);
      const stalemate = await runHeadlessMatch({
        ...focused,
        maxTurnsWithoutCapture: 1,
      });
      expect(['victory', 'stalemate']).toContain(stalemate.outcome);
    },
  );

  it(
    'applies the requested seat rotation to the authoritative turn order',
    { timeout: 120_000 },
    async () => {
      const unrotated = await runHeadlessMatch({
        ...focused,
        maxCommands: 1,
        trace: true,
        seatRotation: 0,
      });
      const rotated = await runHeadlessMatch({
        ...focused,
        maxCommands: 1,
        trace: true,
        seatRotation: 1,
      });
      expect(unrotated.trace?.[0]?.playerId).toBe('player-01');
      expect(rotated.trace?.[0]?.playerId).toBe('player-02');
    },
  );

  it('allocates assignment positions and controller streams explicitly', () => {
    const allocation = createHeadlessPlayerAllocation(6, 2, 3, 5);
    expect(allocation.players.map(({ id }) => id)).toEqual([
      'player-03',
      'player-04',
      'player-05',
      'player-06',
      'player-01',
      'player-02',
    ]);
    expect(allocation.assignmentPlayers.map(({ id }) => id)).toEqual([
      'player-06',
      'player-01',
      'player-02',
      'player-03',
      'player-04',
      'player-05',
    ]);
    expect(Object.fromEntries(allocation.controllerStreamByPlayer)).toEqual({
      'player-03': 'controller-6',
      'player-04': 'controller-1',
      'player-05': 'controller-2',
      'player-06': 'controller-3',
      'player-01': 'controller-4',
      'player-02': 'controller-5',
    });
  });

  it(
    'maps a complete deterministic match equivariantly under player-ID permutation',
    { timeout: 120_000 },
    async () => {
      const original = await runHeadlessMatch({ ...focused, trace: true });
      const renamed = await runHeadlessMatch({
        ...focused,
        trace: true,
        playerIds: ['label-z', 'label-a'],
      });
      const rename = new Map([
        ['player-01', 'label-z'],
        ['player-02', 'label-a'],
      ]);
      expect(renamed.outcome, renamed.reason).toBe(original.outcome);
      expect(renamed.winnerPlayerId).toBe(rename.get(original.winnerPlayerId!));
      expect(
        renamed.trace?.map(({ playerId, command }) => ({ playerId, command })),
      ).toEqual(
        original.trace?.map(({ playerId, command }) => ({
          playerId: rename.get(playerId),
          command,
        })),
      );
      const commandTypes = new Set(
        original.trace?.map(({ command }) => command.type),
      );
      expect(commandTypes.has('PLACE_REINFORCEMENT')).toBe(true);
      expect(commandTypes.has('ATTACK')).toBe(true);
      expect(commandTypes.has('MOVE_AFTER_CAPTURE')).toBe(true);
      expect(commandTypes.has('FORTIFY')).toBe(true);
    },
  );

  it(
    'produces a machine-readable quick aggregate',
    { timeout: 180_000 },
    async () => {
      const report = await runBotSimulation(
        3,
        {
          territoryCount: 12,
          continentCount: 2,
          playerCount: 2,
          maxTurns: 500,
          maxCommands: 8_000,
          maxTurnsWithoutCapture: 100,
        },
        'bot-quick',
      );
      expect(report.gamesCompleted).toBe(3);
      expect(report.project).toEqual({
        reportSchemaVersion: 1,
        productName: 'Fustify',
        packageSlug: 'fustify',
      });
      expect(report.outcomes['engine-error']).toBe(0);
      expect(report.results.every((result) => !('finalState' in result))).toBe(
        true,
      );
      expect(() => JSON.parse(JSON.stringify(report))).not.toThrow();
    },
  );

  it.runIf(process.env.BOT_SIMULATION_STRESS === '1')(
    'runs the moderate bot stress matrix',
    { timeout: 900_000 },
    async () => {
      const report = await runBotSimulation(
        30,
        {
          territoryCount: 18,
          continentCount: 3,
          playerCount: 3,
          maxTurns: 1_200,
          maxCommands: 30_000,
          maxTurnsWithoutCapture: 160,
        },
        'bot-stress',
      );
      expect(report.gamesCompleted).toBe(30);
      expect(report.outcomes['engine-error']).toBe(0);
    },
  );
});
