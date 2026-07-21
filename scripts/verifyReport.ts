import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import {
  summarizeRun,
  type VerificationRun,
  type VerificationSuiteResult,
} from '../src/admin/reportContract';
import {
  boundedOutput,
  finalizeReport,
  writeLatest,
} from './verification/reportStore';
import {
  adaptBotSimulation,
  readCoverageSummary,
} from './verification/adapters';
import type { BotSimulationReport } from '../src/core/simulation/botMatch';

interface SuiteDefinition extends Pick<
  VerificationSuiteResult,
  'id' | 'displayName' | 'category' | 'command'
> {
  fullOnly?: boolean;
}

const suites: SuiteDefinition[] = [
  {
    id: 'unit',
    displayName: 'Unit tests',
    category: 'unit',
    command: 'pnpm test',
  },
  {
    id: 'typecheck',
    displayName: 'TypeScript',
    category: 'typecheck',
    command: 'pnpm exec tsc -b',
  },
  { id: 'lint', displayName: 'Lint', category: 'lint', command: 'pnpm lint' },
  {
    id: 'build',
    displayName: 'Production build',
    category: 'build',
    command: 'pnpm build',
  },
  {
    id: 'format',
    displayName: 'Formatting',
    category: 'format',
    command: 'pnpm format:check',
  },
  {
    id: 'repository',
    displayName: 'Repository consistency',
    category: 'repository',
    command: 'git diff --check',
  },
  {
    id: 'generation-quick',
    displayName: 'Generation simulation',
    category: 'generation-quick',
    command: 'pnpm test:simulation',
  },
  {
    id: 'bot-quick',
    displayName: 'Quick bot simulation',
    category: 'bot-quick',
    command: 'pnpm simulate:bots -- --games 10',
  },
  {
    id: 'coverage',
    displayName: 'Coverage',
    category: 'coverage',
    command: 'pnpm test:coverage',
  },
  {
    id: 'interaction',
    displayName: 'Playwright interaction',
    category: 'interaction',
    command: 'pnpm test:e2e',
    fullOnly: true,
  },
  {
    id: 'visual',
    displayName: 'Visual comparisons',
    category: 'visual',
    command: 'pnpm test:visual',
    fullOnly: true,
  },
  {
    id: 'generation-stress',
    displayName: 'Generation stress simulation',
    category: 'generation-stress',
    command: 'pnpm test:simulation:stress',
    fullOnly: true,
  },
  {
    id: 'bot-stress',
    displayName: 'Bot stress simulation',
    category: 'bot-stress',
    command: 'pnpm test:bot:stress',
    fullOnly: true,
  },
];

function git(...args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}
function repository() {
  const status = git('status', '--porcelain');
  const commit = git('rev-parse', 'HEAD') || '0000000';
  return {
    branch: git('branch', '--show-current') || 'detached',
    commit,
    shortCommit: commit.slice(0, 12),
    commitSubject: git('show', '-s', '--format=%s', 'HEAD'),
    worktreeCleanAtStart: !status,
    changedFileCount: status ? status.split('\n').length : 0,
  };
}

export interface CommandResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  output: string;
}
export type CommandRunner = (
  command: string,
  onChild: (child: ChildProcess | null) => void,
) => Promise<CommandResult>;
export const runCommand: CommandRunner = (command, onChild) =>
  new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    onChild(child);
    let output = '';
    child.stdout?.on('data', (chunk) => {
      process.stdout.write(chunk);
      output += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      process.stderr.write(chunk);
      output += String(chunk);
    });
    child.on('close', (exitCode, signal) => {
      onChild(null);
      resolve({ exitCode, signal, output });
    });
  });

export async function executeVerification(
  profile: 'standard' | 'full',
  commandRunner: CommandRunner = runCommand,
): Promise<VerificationRun> {
  const startedAt = new Date().toISOString();
  const selected = suites.filter(
    (suite) => profile === 'full' || !suite.fullOnly,
  );
  const run: VerificationRun = {
    schemaVersion: 1,
    id: `${startedAt.replaceAll(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`,
    profile,
    startedAt,
    updatedAt: startedAt,
    status: 'running',
    repository: repository(),
    environment: { nodeVersion: process.version, platform: process.platform },
    suites: selected.map((suite) => ({
      ...suite,
      status: 'pending',
      complete: false,
    })),
    failures: [],
    totals: {
      suites: selected.length,
      completed: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      interrupted: 0,
    },
  };
  let activeChild: ChildProcess | null = null;
  let interruption: string | null = null;
  const interrupt = (signal: NodeJS.Signals) => {
    interruption = `Runner received ${signal}`;
    activeChild?.kill('SIGTERM');
  };
  const sigint = () => interrupt('SIGINT');
  const sigterm = () => interrupt('SIGTERM');
  process.once('SIGINT', sigint);
  process.once('SIGTERM', sigterm);
  try {
    await writeLatest(run);
    for (const suite of run.suites) {
      if (interruption) break;
      suite.status = 'running';
      suite.startedAt = new Date().toISOString();
      run.updatedAt = suite.startedAt;
      await writeLatest(run);
      try {
        const result = await commandRunner(suite.command, (child) => {
          activeChild = child;
        });
        suite.completedAt = new Date().toISOString();
        suite.durationMs =
          Date.parse(suite.completedAt) - Date.parse(suite.startedAt);
        suite.exitCode = result.exitCode;
        suite.complete = !result.signal;
        suite.status =
          interruption || result.signal
            ? 'interrupted'
            : result.exitCode === 0
              ? 'passed'
              : 'failed';
        suite.summary =
          suite.status === 'passed'
            ? 'Command completed successfully.'
            : `Command ${suite.status}.`;
        if (suite.status !== 'passed')
          suite.failureExcerpt = boundedOutput(result.output);
        if (suite.category === 'coverage' && suite.status === 'passed')
          run.coverage = await readCoverageSummary();
        if (suite.category === 'bot-quick' && suite.status === 'passed') {
          const botReport = JSON.parse(
            await readFile(
              'artifacts/bot-simulations/fustify-bot-simulation-bot-extended-10.json',
              'utf8',
            ),
          ) as BotSimulationReport;
          run.simulations = [
            ...(run.simulations ?? []),
            adaptBotSimulation(botReport, suite.displayName),
          ];
        }
        if (
          (suite.category === 'generation-quick' ||
            suite.category === 'generation-stress') &&
          suite.status === 'passed'
        ) {
          run.simulations = [
            ...(run.simulations ?? []),
            {
              kind: 'generation',
              label: suite.displayName,
              passed: true,
              configurations: suite.category === 'generation-stress' ? 270 : 20,
              runtimeMs: suite.durationMs,
            },
          ];
        }
        if (suite.status === 'failed')
          run.failures.push({
            suiteId: suite.id,
            message: `${suite.displayName} failed`,
            excerpt: suite.failureExcerpt,
          });
      } catch (error) {
        suite.status = 'failed';
        suite.complete = false;
        suite.completedAt = new Date().toISOString();
        suite.durationMs =
          Date.parse(suite.completedAt) - Date.parse(suite.startedAt);
        suite.summary = 'Runner exception.';
        suite.failureExcerpt = boundedOutput(
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
        );
        run.failures.push({
          suiteId: suite.id,
          message: `${suite.displayName} runner exception`,
          excerpt: suite.failureExcerpt,
        });
      }
      run.updatedAt = new Date().toISOString();
      run.totals = summarizeRun(run);
      await writeLatest(run);
    }
    if (interruption) {
      const active = run.suites.find((suite) => suite.status === 'running');
      if (active) {
        active.status = 'interrupted';
        active.complete = false;
        active.completedAt = new Date().toISOString();
      }
      run.status = 'interrupted';
      run.environment.interruptedReason = interruption;
    } else run.status = run.failures.length ? 'failed' : 'passed';
  } catch (error) {
    run.status = interruption ? 'interrupted' : 'failed';
    const message = error instanceof Error ? error.message : String(error);
    run.environment.interruptedReason =
      interruption ?? `Unexpected runner exception: ${message}`;
    run.failures.push({ suiteId: 'runner', message });
  } finally {
    process.off('SIGINT', sigint);
    process.off('SIGTERM', sigterm);
    run.completedAt = new Date().toISOString();
    run.updatedAt = run.completedAt;
    run.repository.worktreeCleanAtEnd = !git('status', '--porcelain');
    run.totals = summarizeRun(run);
    await finalizeReport(
      run,
      Number(process.env.FUSTIFY_REPORT_RETENTION ?? 20),
    );
  }
  return run;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const profile = process.argv.includes('--full') ? 'full' : 'standard';
  const report = await executeVerification(profile);
  process.stdout.write(
    `\nVerification ${report.status}; run ID: ${report.id}\n`,
  );
  process.exitCode =
    report.status === 'passed' ? 0 : report.status === 'interrupted' ? 130 : 1;
}
