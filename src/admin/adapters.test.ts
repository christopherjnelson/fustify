import { describe, expect, it } from 'vitest';
import { adaptBotSimulation } from '../../scripts/verification/adapters';
import type { BotSimulationReport } from '../core/simulation/botMatch';

describe('verification adapters', () => {
  it('maps the existing bot contract without inventing a competing model', () => {
    const report = {
      project: {
        reportSchemaVersion: 1,
        productName: 'Fustify',
        packageSlug: 'fustify',
      },
      runId: 'bot-1',
      timestamp: new Date().toISOString(),
      controllerVersion: 'balanced-v1',
      configuration: { territoryCount: 12, continentCount: 2, playerCount: 2 },
      gamesRequested: 2,
      gamesCompleted: 2,
      passed: false,
      outcomes: {
        victory: 1,
        stalemate: 0,
        'turn-cap': 1,
        'command-cap': 0,
        'engine-error': 0,
      },
      winRates: { 'player-1': 0.5 },
      averageTurns: 42,
      percentileTurns: { p50: 40, p95: 80, p99: 80 },
      invariantFailures: [],
      reproductions: [
        {
          worldSeed: 'world',
          matchSeed: 'match',
          territoryCount: 12,
          continentCount: 2,
          playerCount: 2,
          ownershipVariant: 0,
          assignmentMode: 'random',
          controllers: ['heuristic-bot', 'heuristic-bot'],
          controllerVersion: 'balanced-v1',
          maxTurns: 1200,
          maxCommands: 30000,
          maxTurnsWithoutCapture: 160,
        },
      ],
      runtimeMs: 1000,
      gamesPerSecond: 2,
      results: [],
    } satisfies BotSimulationReport;
    const adapted = adaptBotSimulation(report);
    expect(adapted.turnCaps).toBe(1);
    expect(adapted.reproductions?.[0]?.command).toContain('simulate:bots');
  });
});
