import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  BALANCE_STUDY_SCHEMA_VERSION,
  type BalanceStudyReport,
} from '../src/admin/balanceStudyContract';
import {
  runHeadlessMatch,
  type ReproductionDescriptor,
} from '../src/core/simulation/botMatch';
import {
  aggregateStudy,
  BALANCE_PRESETS,
  balanceStudyConfigSchema,
  createStudyMatrix,
  diagnosticDebugRows,
  SIX_SEAT_DIAGNOSTIC_PRESETS,
  stableHash,
  type BalancePreset,
  type BalanceStudyConfig,
  type CompletedStudyMatch,
} from '../src/core/simulation/balanceStudy';
import {
  finalizeStudy,
  readCheckpoint,
  readCompletedStudies,
  readStudy,
  studyPaths,
  writeStudyProgress,
  type StudyCheckpoint,
} from './balanceStudyStore';

function value(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}
function has(name: string) {
  return process.argv.includes(`--${name}`);
}
function git(args: string[], fallback: string) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'stdout' in error &&
      typeof error.stdout === 'string' &&
      error.stdout.trim()
    )
      return error.stdout.trim();
    return fallback;
  }
}
function repository() {
  return {
    branch: git(['branch', '--show-current'], 'unknown'),
    commit: git(['rev-parse', 'HEAD'], '0000000'),
    worktreeCleanAtStart: git(['status', '--porcelain'], 'dirty') === '',
  };
}
export function estimateRuntime(
  config: BalanceStudyConfig,
  history: BalanceStudyReport[] = [],
) {
  const matrix = createStudyMatrix(config);
  const exactRates = matrix.flatMap((item) =>
    history.flatMap((report) =>
      report.configurations
        .filter(
          (candidate) =>
            candidate.playerCount === item.playerCount &&
            candidate.territoryCount === item.territoryCount &&
            candidate.continentCount === item.continentCount &&
            candidate.matchesCompleted > 0 &&
            candidate.gamesPerSecond > 0,
        )
        .map((candidate) => candidate.gamesPerSecond),
    ),
  );
  const similarRates = matrix.flatMap((item) =>
    history.flatMap((report) =>
      report.configurations
        .filter(
          (candidate) =>
            candidate.playerCount === item.playerCount &&
            Math.abs(candidate.territoryCount - item.territoryCount) <= 12 &&
            candidate.matchesCompleted > 0 &&
            candidate.gamesPerSecond > 0,
        )
        .map((candidate) => candidate.gamesPerSecond),
    ),
  );
  const rates = exactRates.length ? exactRates : similarRates;
  if (rates.length) {
    const rate = rates.reduce((sum, value) => sum + value, 0) / rates.length;
    const midpoint = (matrix.length / rate) * 1_000;
    return {
      midpoint,
      range: [midpoint * 0.8, midpoint * 1.3] as [number, number],
      source: `${rates.length} valid completed configuration timing samples`,
      quality: (exactRates.length
        ? 'historical-exact'
        : 'historical-similar') as 'historical-exact' | 'historical-similar',
    };
  }
  const weightedSeconds = matrix.reduce(
    (sum, item) =>
      sum + 1.05 * (item.territoryCount / 42) * (item.playerCount / 4),
    0,
  );
  const midpoint = weightedSeconds * 1_000;
  return {
    midpoint,
    range: [midpoint * 0.65, midpoint * 1.65] as [number, number],
    source:
      'Conservative world-size and player-count fallback (no valid local history)',
    quality: 'conservative-fallback' as const,
  };
}
function safeRunId(preset: string) {
  return `balance-${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${preset}`;
}
function elapsed(ms: number) {
  const seconds = Math.round(ms / 1000);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

async function loadConfig(): Promise<{
  config: BalanceStudyConfig;
  preset: string;
}> {
  const configPath = value('config');
  if (configPath)
    return {
      config: balanceStudyConfigSchema.parse(
        JSON.parse(await readFile(resolve(configPath), 'utf8')),
      ),
      preset: 'custom',
    };
  const diagnostic = value('diagnose');
  if (diagnostic) {
    if (diagnostic !== 'six-seat')
      throw new Error('Unknown diagnostic. Choose six-seat.');
    const scale = value('scale') ?? 'smoke';
    if (!(scale in SIX_SEAT_DIAGNOSTIC_PRESETS))
      throw new Error(
        'Unknown diagnostic scale. Choose smoke, block, standard, or thorough.',
      );
    return {
      config: structuredClone(
        SIX_SEAT_DIAGNOSTIC_PRESETS[
          scale as keyof typeof SIX_SEAT_DIAGNOSTIC_PRESETS
        ],
      ),
      preset: `six-seat-diagnostic-${scale}`,
    };
  }
  const preset = (value('preset') ?? 'quick') as BalancePreset;
  if (!(preset in BALANCE_PRESETS))
    throw new Error(
      `Unknown preset ${preset}. Choose quick, standard, thorough, exhaustive, or engine-coverage.`,
    );
  return { config: structuredClone(BALANCE_PRESETS[preset]), preset };
}

function planText(
  config: BalanceStudyConfig,
  preset: string,
  history: BalanceStudyReport[] = [],
) {
  const matrix = createStudyMatrix(config);
  const runtimeEstimate = estimateRuntime(config, history);
  return [
    `Balance study plan (${preset})`,
    `Configurations: ${config.configurations.length}`,
    `Matches per configuration: ${config.matchesPerConfiguration}`,
    `Total matches: ${matrix.length}`,
    ...(config.diagnostic
      ? [
          `Pair/rotation count: ${new Set(matrix.map((item) => item.worldSeed)).size} canonical seed pairs / ${matrix.length} rotated matches`,
          'Rotation design: 6 logical-player/turn rotations × 6 assignment-order rotations with balanced explicit controller streams per complete canonical fixture',
        ]
      : []),
    `Estimated runtime: ${elapsed(runtimeEstimate.range[0])}–${elapsed(runtimeEstimate.range[1])} (midpoint ${elapsed(runtimeEstimate.midpoint)})`,
    `Estimate source: ${runtimeEstimate.quality} · ${runtimeEstimate.source}`,
    `Expected report path: ${studyPaths().history}/<run-id>.json`,
    `Concurrency: 1 worker (deterministic sequential aggregation; --workers 1)`,
    `Seeds: ${matrix[0]?.worldSeed ?? '—'} … ${matrix.at(-1)?.matchSeed ?? '—'}`,
    `Checkpoint frequency: every ${config.checkpointEvery} matches`,
    `Estimated disk use: about ${Math.ceil((matrix.length * 900) / 1024)} KiB while checkpointing`,
  ].join('\n');
}

function compact(report: BalanceStudyReport) {
  return {
    runId: report.id,
    commit: report.repository.commit,
    preset: report.preset,
    configuration: report.configLabel,
    matchesCompleted: report.aggregate.matchesCompleted,
    status: report.status,
    outcomes: report.aggregate.outcomes,
    seatWinRates: report.aggregate.seatSummaries.map(
      ({ seat, samples, winRate, confidenceInterval95 }) => ({
        seat,
        samples,
        winRate,
        confidenceInterval95,
      }),
    ),
    playerCountSeatMetrics: report.aggregate.playerCountSeatSummaries,
    diagnostic: report.aggregate.diagnostic,
    matchLength: report.aggregate.turns,
    findings: {
      warnings: report.findings.filter(
        (item) => item.classification === 'warning',
      ).length,
      failures: report.findings.filter(
        (item) => item.classification === 'failure',
      ).length,
    },
    reproductions: report.reproductions,
    reportPath: resolve(studyPaths().history, `${report.id}.json`),
  };
}

async function inspectRun(id: string) {
  const report = await readStudy(id);
  const format = value('format') ?? 'summary';
  if (format === 'json')
    process.stdout.write(`${JSON.stringify(compact(report), null, 2)}\n`);
  else if (format === 'csv') {
    const header =
      'configuration,group,players,territories,continents,completed,victories,stalemates,turn_caps,command_caps,engine_errors,mean_turns,p95_turns,games_per_second';
    const rows = report.configurations.map((item) =>
      [
        item.id,
        item.group,
        item.playerCount,
        item.territoryCount,
        item.continentCount,
        item.matchesCompleted,
        item.outcomes.victory ?? 0,
        item.outcomes.stalemate ?? 0,
        item.outcomes['turn-cap'] ?? 0,
        item.outcomes['command-cap'] ?? 0,
        item.outcomes['engine-error'] ?? 0,
        item.meanTurns,
        item.p95Turns,
        item.gamesPerSecond,
      ].join(','),
    );
    process.stdout.write(`${[header, ...rows].join('\n')}\n`);
  } else process.stdout.write(`${JSON.stringify(compact(report), null, 2)}\n`);
  const exportPath = value('export');
  if (exportPath)
    await writeFile(
      resolve(exportPath),
      `${JSON.stringify(compact(report), null, 2)}\n`,
      'utf8',
    );
}

async function reproduce(raw: string) {
  const descriptor = JSON.parse(raw) as ReproductionDescriptor;
  const result = await runHeadlessMatch({
    ...descriptor,
    trace: has('verbose'),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.outcome === 'engine-error') process.exitCode = 1;
}

async function execute(
  config: BalanceStudyConfig,
  preset: string,
  resume?: StudyCheckpoint,
) {
  if (Number(value('workers') ?? '1') !== 1)
    throw new Error(
      'This version supports --workers 1 only; sequential throughput is retained for predictable desktop load and deterministic ordering.',
    );
  const matrix = createStudyMatrix(config);
  const runtimeEstimate = estimateRuntime(config, await readCompletedStudies());
  const configHash = stableHash(config);
  const matrixHash = stableHash(matrix);
  const repo = repository();
  const runId = resume?.runId ?? safeRunId(preset);
  if (
    resume &&
    (resume.configHash !== configHash || resume.matrixHash !== matrixHash)
  )
    throw new Error('Checkpoint configuration or matrix is incompatible.');
  const mismatch = !!resume && resume.commit !== repo.commit;
  if (mismatch && !has('force'))
    throw new Error(
      `Checkpoint commit ${resume!.commit} differs from current ${repo.commit}. Re-run with --force to resume explicitly.`,
    );
  const startedAt = resume?.startedAt ?? new Date().toISOString();
  const completed: CompletedStudyMatch[] = resume?.completed ?? [];
  let runtimeMs = resume?.runtimeMs ?? 0;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const buildReport = (
    status: BalanceStudyReport['status'],
  ): BalanceStudyReport => {
    const summary = aggregateStudy(
      matrix,
      completed,
      runtimeMs,
      config.warningThresholds,
    );
    const now = new Date().toISOString();
    return {
      schemaVersion: BALANCE_STUDY_SCHEMA_VERSION,
      id: runId,
      preset,
      presetVersion: config.presetVersion,
      purpose: config.configurations.every(
        (item) => item.purpose === 'product-balance',
      )
        ? 'product-balance'
        : config.configurations.every(
              (item) => item.purpose === 'engine-coverage',
            )
          ? 'engine-coverage'
          : 'mixed',
      configLabel: config.label,
      configHash,
      matrixHash,
      status,
      startedAt,
      updatedAt: now,
      ...(status === 'completed' || status === 'failed'
        ? { completedAt: now }
        : {}),
      processId: process.pid,
      repository: { ...repo, resumeCommitMismatch: mismatch || undefined },
      plan: {
        configurations: config.configurations.length,
        matchesPerConfiguration: config.matchesPerConfiguration,
        totalMatches: matrix.length,
        workers: 1,
        checkpointEvery: config.checkpointEvery,
        seedPrefix: config.seedPrefix,
        estimatedRuntimeMs: runtimeEstimate.midpoint,
        estimatedRuntimeRangeMs: runtimeEstimate.range,
        estimateSource: runtimeEstimate.source,
        estimateQuality: runtimeEstimate.quality,
        warningThresholds: config.warningThresholds,
        estimatedDiskBytes: matrix.length * 900,
        ...(config.diagnostic
          ? {
              rotationDesign:
                '6 logical-player/turn rotations × 6 assignment-order rotations with balanced explicit controller streams per complete canonical fixture',
              pairRotationCount: new Set(
                matrix.map(
                  (item) =>
                    `${item.worldSeed}:${item.seatRotation}:${item.assignmentRotation}`,
                ),
              ).size,
            }
          : {}),
      },
      ...summary,
      checkpoint: {
        completedMatchIndices: completed.map((item) => item.input.index),
        lastWrittenAt: now,
        resumable: status === 'running' || status === 'interrupted',
      },
    };
  };
  const checkpoint = (): StudyCheckpoint => ({
    schemaVersion: 1,
    runId,
    preset: resume?.preset ?? preset,
    config,
    configHash,
    matrixHash,
    commit: resume?.commit ?? repo.commit,
    startedAt,
    runtimeMs,
    completed,
  });
  await writeStudyProgress(buildReport('running'), checkpoint());
  process.stdout.write(
    `Run ID: ${runId}\n${planText(config, preset, await readCompletedStudies())}\n`,
  );
  const completedIndices = new Set(completed.map((item) => item.input.index));
  for (const input of matrix) {
    if (completedIndices.has(input.index)) continue;
    if (interrupted) break;
    const started = performance.now();
    const result = await runHeadlessMatch(input);
    runtimeMs += performance.now() - started;
    const { finalState, trace, ...stored } = result;
    void finalState;
    void trace;
    completed.push({ input, result: stored });
    if (
      completed.length % config.checkpointEvery === 0 ||
      completed.length === matrix.length
    ) {
      await writeStudyProgress(buildReport('running'), checkpoint());
      const aggregate = buildReport('running').aggregate;
      process.stdout.write(
        `[${runId}] ${completed.length}/${matrix.length} (${((completed.length / matrix.length) * 100).toFixed(1)}%) · ${aggregate.gamesPerSecond.toFixed(2)} games/s · victories ${aggregate.outcomes.victory} · caps ${aggregate.outcomes.turnCap + aggregate.outcomes.commandCap} · errors ${aggregate.outcomes.engineError} · checkpoint saved\n`,
      );
    }
  }
  const hardFailure = completed.some(
    ({ result }) =>
      result.outcome === 'engine-error' ||
      result.invariantViolations.length > 0,
  );
  const status = interrupted
    ? 'interrupted'
    : hardFailure
      ? 'failed'
      : 'completed';
  const report = buildReport(status);
  if (has('debug-block'))
    process.stdout.write(
      `${JSON.stringify({ diagnosticDebug: diagnosticDebugRows(completed) }, null, 2)}\n`,
    );
  if (status === 'interrupted') await writeStudyProgress(report, checkpoint());
  else await finalizeStudy(report);
  process.stdout.write(
    `${status === 'interrupted' ? 'Interrupted safely; resume' : 'Study finished'}: ${runId} · ${completed.length}/${matrix.length} matches · report ${studyPaths().latest}\n`,
  );
  if (hardFailure) process.exitCode = 1;
}

try {
  const reproduceValue = value('reproduce');
  const inspectValue = value('inspect');
  const resumeValue = value('resume');
  if (reproduceValue) await reproduce(reproduceValue);
  else if (inspectValue) await inspectRun(inspectValue);
  else if (resumeValue) {
    const checkpoint = await readCheckpoint(resumeValue);
    await execute(checkpoint.config, checkpoint.preset, checkpoint);
  } else {
    const { config, preset } = await loadConfig();
    if (has('dry-run'))
      process.stdout.write(
        `${planText(config, preset, await readCompletedStudies())}\n`,
      );
    else await execute(config, preset);
  }
} catch (error) {
  process.stderr.write(
    `Balance study error: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
