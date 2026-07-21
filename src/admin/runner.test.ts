import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  executeVerification,
  type CommandRunner,
} from '../../scripts/verifyReport';

describe('verification runner', () => {
  const original = process.cwd();
  afterEach(() => process.chdir(original));
  async function coverageFixture(directory: string) {
    await mkdir(resolve(directory, 'coverage'));
    const metric = { total: 10, covered: 9, skipped: 0, pct: 90 };
    await writeFile(
      resolve(directory, 'coverage/coverage-summary.json'),
      JSON.stringify({
        total: {
          statements: metric,
          branches: metric,
          functions: metric,
          lines: metric,
        },
      }),
    );
  }
  async function botFixture(directory: string) {
    const target = resolve(directory, 'artifacts/bot-simulations');
    await mkdir(target, { recursive: true });
    await writeFile(
      resolve(target, 'fustify-bot-simulation-bot-extended-10.json'),
      JSON.stringify({
        project: {
          reportSchemaVersion: 1,
          productName: 'Fustify',
          packageSlug: 'fustify',
        },
        runId: 'bot-extended-10',
        timestamp: new Date().toISOString(),
        controllerVersion: 'balanced-v1',
        configuration: {
          territoryCount: 18,
          continentCount: 3,
          playerCount: 3,
        },
        gamesRequested: 10,
        gamesCompleted: 10,
        passed: true,
        outcomes: {
          victory: 10,
          stalemate: 0,
          'turn-cap': 0,
          'command-cap': 0,
          'engine-error': 0,
        },
        winRates: { 'player-1': 1 },
        averageTurns: 10,
        percentileTurns: { p50: 10, p95: 10, p99: 10 },
        invariantFailures: [],
        reproductions: [],
        runtimeMs: 100,
        gamesPerSecond: 100,
        results: [],
      }),
    );
  }
  it('persists incremental passed and failed command results and continues', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'fustify-runner-'));
    process.chdir(directory);
    await coverageFixture(directory);
    await botFixture(directory);
    const runner: CommandRunner = vi.fn(async (command, child) => {
      child(null);
      return {
        exitCode: command.includes('lint') ? 1 : 0,
        signal: null,
        output: command.includes('lint')
          ? '\u001b[31mlint failure\u001b[0m'
          : 'ok',
      };
    });
    const report = await executeVerification('standard', runner);
    expect(report.status).toBe('failed');
    expect(report.suites.find((suite) => suite.id === 'lint')?.status).toBe(
      'failed',
    );
    expect(report.suites.at(-1)?.status).toBe('passed');
    expect(report.failures).toHaveLength(1);
  });
  it('records runner exceptions as partial failures', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'fustify-exception-'));
    process.chdir(directory);
    const runner: CommandRunner = vi.fn(async () => {
      throw new Error('spawn exploded');
    });
    const report = await executeVerification('standard', runner);
    expect(report.status).toBe('failed');
    expect(report.suites.every((suite) => suite.status === 'failed')).toBe(
      true,
    );
  });
});
