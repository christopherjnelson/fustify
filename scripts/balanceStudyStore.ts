import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import {
  parseBalanceStudyReport,
  type BalanceStudyReport,
} from '../src/admin/balanceStudyContract';
import {
  balanceStudyConfigSchema,
  type BalanceStudyConfig,
  type CompletedStudyMatch,
} from '../src/core/simulation/balanceStudy';

export const STUDY_ROOT = resolve('.fustify', 'reports', 'studies');
export function studyPaths(directory = STUDY_ROOT) {
  const root = resolve(directory);
  return {
    root,
    latest: resolve(root, 'latest.json'),
    history: resolve(root, 'history'),
    checkpoints: resolve(root, 'checkpoints'),
    traces: resolve(root, 'traces'),
  };
}
export async function atomicStudyWrite(path: string, value: unknown) {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporary, path);
}
export interface StudyCheckpoint {
  schemaVersion: 1;
  runId: string;
  preset: string;
  config: BalanceStudyConfig;
  configHash: string;
  matrixHash: string;
  commit: string;
  startedAt: string;
  runtimeMs: number;
  completed: CompletedStudyMatch[];
}
export async function writeStudyProgress(
  report: BalanceStudyReport,
  checkpoint: StudyCheckpoint,
  directory = STUDY_ROOT,
) {
  const paths = studyPaths(directory);
  await atomicStudyWrite(
    resolve(paths.checkpoints, `${report.id}.json`),
    checkpoint,
  );
  await atomicStudyWrite(paths.latest, parseBalanceStudyReport(report));
}
export async function finalizeStudy(
  report: BalanceStudyReport,
  retention = 20,
  directory = STUDY_ROOT,
) {
  const paths = studyPaths(directory);
  const parsed = parseBalanceStudyReport(report);
  await atomicStudyWrite(paths.latest, parsed);
  await atomicStudyWrite(resolve(paths.history, `${report.id}.json`), parsed);
  const files = (await readdir(paths.history))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .reverse();
  await Promise.all(
    files
      .slice(Math.max(1, retention))
      .map((name) => unlink(resolve(paths.history, basename(name)))),
  );
}
export async function readStudy(id: string, directory = STUDY_ROOT) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(id))
    throw new Error('Invalid study run ID.');
  const paths = studyPaths(directory);
  for (const path of [resolve(paths.history, `${id}.json`), paths.latest]) {
    try {
      const report = parseBalanceStudyReport(
        JSON.parse(await readFile(path, 'utf8')),
      );
      if (report.id === id) return report;
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== 'ENOENT' &&
        path !== paths.latest
      )
        throw error;
    }
  }
  throw new Error(`Study ${id} was not found.`);
}

export async function readCompletedStudies(directory = STUDY_ROOT) {
  const paths = studyPaths(directory);
  try {
    const files = (await readdir(paths.history)).filter((name) =>
      name.endsWith('.json'),
    );
    const reports = await Promise.all(
      files.map(async (name) => {
        try {
          return parseBalanceStudyReport(
            JSON.parse(await readFile(resolve(paths.history, name), 'utf8')),
          );
        } catch {
          return null;
        }
      }),
    );
    return reports.filter(
      (report): report is BalanceStudyReport =>
        report !== null &&
        report.status === 'completed' &&
        report.aggregate.matchesCompleted > 0 &&
        report.aggregate.runtimeMs > 0 &&
        report.aggregate.outcomes.engineError === 0 &&
        report.aggregate.invariantFailures === 0,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
export async function readCheckpoint(
  id: string,
  directory = STUDY_ROOT,
): Promise<StudyCheckpoint> {
  const value = JSON.parse(
    await readFile(
      resolve(studyPaths(directory).checkpoints, `${id}.json`),
      'utf8',
    ),
  ) as StudyCheckpoint;
  if (value.schemaVersion !== 1 || value.runId !== id)
    throw new Error('Invalid or incompatible study checkpoint.');
  value.preset ??= 'custom';
  value.config = balanceStudyConfigSchema.parse(value.config);
  return value;
}
