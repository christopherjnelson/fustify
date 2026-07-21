import { readFile } from 'node:fs/promises';
import type { BotSimulationReport } from '../../src/core/simulation/botMatch';
import type {
  CoverageSummary,
  SimulationSummary,
} from '../../src/admin/reportContract';

interface IstanbulMetric {
  total: number;
  covered: number;
  pct: number;
}
interface IstanbulSummary {
  total: {
    statements: IstanbulMetric;
    branches: IstanbulMetric;
    functions: IstanbulMetric;
    lines: IstanbulMetric;
  };
}

export async function readCoverageSummary(
  path = 'coverage/coverage-summary.json',
): Promise<CoverageSummary> {
  const summary = JSON.parse(await readFile(path, 'utf8')) as IstanbulSummary;
  const metric = (value: IstanbulMetric) => ({
    covered: value.covered,
    total: value.total,
    percent: value.pct,
  });
  return {
    statements: metric(summary.total.statements),
    branches: metric(summary.total.branches),
    functions: metric(summary.total.functions),
    lines: metric(summary.total.lines),
  };
}

export function adaptBotSimulation(
  report: BotSimulationReport,
  label = 'Bot simulation',
): SimulationSummary {
  return {
    kind: 'bot',
    label,
    passed: report.passed,
    gamesRequested: report.gamesRequested,
    gamesCompleted: report.gamesCompleted,
    outcomes: report.outcomes,
    winDistribution: report.winRates,
    meanTurns: report.averageTurns,
    medianTurns: report.percentileTurns.p50,
    p95Turns: report.percentileTurns.p95,
    p99Turns: report.percentileTurns.p99,
    stalemates: report.outcomes.stalemate,
    turnCaps: report.outcomes['turn-cap'],
    commandCaps: report.outcomes['command-cap'],
    engineErrors: report.outcomes['engine-error'],
    invariantFailures: report.invariantFailures.length,
    runtimeMs: report.runtimeMs,
    gamesPerSecond: report.gamesPerSecond,
    reproductions: report.reproductions.map((descriptor) => ({
      seed: descriptor.worldSeed,
      configuration: {
        matchSeed: descriptor.matchSeed,
        territories: descriptor.territoryCount,
        continents: descriptor.continentCount,
        players: descriptor.playerCount,
      },
      command: `pnpm simulate:bots -- --reproduce '${JSON.stringify(descriptor)}' --trace`,
    })),
  };
}
