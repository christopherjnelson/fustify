import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  executeVerification,
  type CommandRunner,
} from '../../scripts/verifyReport';
import {
  DEFAULT_REPORT_DIRECTORY,
  readValidatedReport,
  reportPaths,
} from '../../scripts/verification/reportStore';

describe('verification runner', () => {
  const temporaryDirectories: string[] = [];
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
    vi.unstubAllEnvs();
  });
  async function temporaryDirectory(prefix: string) {
    const directory = await mkdtemp(resolve(tmpdir(), prefix));
    temporaryDirectories.push(directory);
    return directory;
  }
  it('persists incremental passed and failed command results and continues', async () => {
    const directory = await temporaryDirectory('fustify-runner-');
    const reportDirectory = resolve(directory, 'reports');
    const commands: string[] = [];
    const runner: CommandRunner = vi.fn(async (command, child) => {
      commands.push(command);
      child(null);
      const failed =
        command === 'pnpm lint' ||
        command === 'pnpm test:coverage' ||
        command.startsWith('pnpm simulate:bots');
      return {
        exitCode: failed ? 1 : 0,
        signal: null,
        output:
          command === 'pnpm lint'
            ? '\u001b[31mlint failure\u001b[0m'
            : failed
              ? 'fixture failure'
              : 'ok',
      };
    });
    const report = await executeVerification(
      'standard',
      runner,
      reportDirectory,
    );
    expect(report.status).toBe('failed');
    expect(report.suites.find((suite) => suite.id === 'lint')?.status).toBe(
      'failed',
    );
    expect(commands).toEqual([
      'pnpm test',
      'pnpm exec tsc -b',
      'pnpm lint',
      'pnpm build',
      'pnpm format:check',
      'git diff --check',
      'pnpm simulate:bots -- --games 10',
      'pnpm test:coverage',
    ]);
    expect(report.failures).toHaveLength(3);
    expect(
      (await readValidatedReport(reportPaths(reportDirectory).latest)).id,
    ).toBe(report.id);
    expect(await readdir(reportPaths(reportDirectory).history)).toEqual([
      `${report.id}.json`,
    ]);
    expect(reportPaths(reportDirectory).root).not.toBe(
      DEFAULT_REPORT_DIRECTORY,
    );
  });
  it('records runner exceptions as partial failures', async () => {
    const directory = await temporaryDirectory('fustify-exception-');
    const reportDirectory = resolve(directory, 'reports');
    const runner: CommandRunner = vi.fn(async () => {
      throw new Error('spawn exploded');
    });
    const report = await executeVerification(
      'standard',
      runner,
      reportDirectory,
    );
    expect(report.status).toBe('failed');
    expect(report.suites.every((suite) => suite.status === 'failed')).toBe(
      true,
    );
  });
  it('keeps latest and retention cleanup inside the supplied directory', async () => {
    const directory = await temporaryDirectory('fustify-retention-');
    const reportDirectory = resolve(directory, 'reports');
    const outside = resolve(directory, 'outside.json');
    await writeFile(outside, 'preserve me');
    vi.stubEnv('FUSTIFY_REPORT_RETENTION', '2');
    const runner: CommandRunner = vi.fn(async () => {
      throw new Error('fixture failure');
    });

    const reports = [];
    for (let index = 0; index < 3; index += 1)
      reports.push(
        await executeVerification('standard', runner, reportDirectory),
      );

    expect(
      (await readValidatedReport(reportPaths(reportDirectory).latest)).id,
    ).toBe(reports.at(-1)?.id);
    expect(
      (await readdir(reportPaths(reportDirectory).history)).sort(),
    ).toEqual(
      reports
        .slice(-2)
        .map((report) => `${report.id}.json`)
        .sort(),
    );
    expect(await readFile(outside, 'utf8')).toBe('preserve me');
  });
});
