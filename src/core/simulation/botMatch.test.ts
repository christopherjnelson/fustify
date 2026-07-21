import { describe, expect, it } from 'vitest';
import { runBotSimulation, runHeadlessMatch } from './botMatch';

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
