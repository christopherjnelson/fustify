import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  runBotSimulation,
  runHeadlessMatch,
  type ReproductionDescriptor,
} from '../src/core/simulation/botMatch';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

function integer(name: string, fallback: number): number {
  const value = Number.parseInt(argument(name) ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function gitCommit(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

const reproductionJson = argument('reproduce');
if (reproductionJson) {
  const descriptor = JSON.parse(reproductionJson) as ReproductionDescriptor;
  const result = await runHeadlessMatch({
    ...descriptor,
    trace: process.argv.includes('--trace'),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.outcome === 'engine-error' ? 1 : 0;
} else {
  const games = integer('games', 100);
  const report = await runBotSimulation(
    games,
    {
      territoryCount: integer('territories', 18),
      continentCount: integer('continents', 3),
      playerCount: integer('players', 3),
      ownershipVariant: integer('variant', 1) - 1,
      maxTurns: integer('max-turns', 1_200),
      maxCommands: integer('max-commands', 30_000),
      maxTurnsWithoutCapture: integer('stalemate-turns', 160),
    },
    argument('seed-prefix') ?? 'bot-extended',
  );
  const output = {
    ...report,
    gitCommit: gitCommit(),
  };
  const artifactDirectory = resolve('artifacts', 'bot-simulations');
  await mkdir(artifactDirectory, { recursive: true });
  const outputPath = resolve(
    artifactDirectory,
    `${report.runId.replaceAll(/[^a-zA-Z0-9._-]/g, '-')}.json`,
  );
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  process.stdout.write(
    [
      `Bot simulation: ${report.gamesCompleted}/${report.gamesRequested} games`,
      `Outcomes: ${JSON.stringify(report.outcomes)}`,
      `Average turns: ${report.averageTurns.toFixed(1)}; p95 ${report.percentileTurns.p95}`,
      `Runtime: ${(report.runtimeMs / 1_000).toFixed(2)}s; ${report.gamesPerSecond.toFixed(2)} games/s`,
      `Report: ${outputPath}`,
    ].join('\n') + '\n',
  );
  process.exitCode = report.passed ? 0 : 1;
}
