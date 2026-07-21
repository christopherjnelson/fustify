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
  isSafeRunId,
  parseVerificationRun,
  type VerificationRun,
} from '../../src/admin/reportContract';

export const DEFAULT_REPORT_DIRECTORY = resolve('.fustify', 'reports');

export function reportPaths(directory = DEFAULT_REPORT_DIRECTORY) {
  const root = resolve(directory);
  return {
    root,
    latest: resolve(root, 'latest.json'),
    history: resolve(root, 'history'),
  };
}

export async function atomicWriteJson(
  path: string,
  value: unknown,
): Promise<void> {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporary, path);
}

export async function writeLatest(
  run: VerificationRun,
  directory?: string,
): Promise<void> {
  await atomicWriteJson(
    reportPaths(directory).latest,
    parseVerificationRun(run),
  );
}

export async function finalizeReport(
  run: VerificationRun,
  retention = 20,
  directory?: string,
): Promise<void> {
  if (!isSafeRunId(run.id)) throw new Error('Unsafe verification run ID');
  const paths = reportPaths(directory);
  await writeLatest(run, directory);
  await mkdir(paths.history, { recursive: true });
  await atomicWriteJson(
    resolve(paths.history, `${run.id}.json`),
    parseVerificationRun(run),
  );
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

export async function readValidatedReport(
  path: string,
): Promise<VerificationRun> {
  return parseVerificationRun(JSON.parse(await readFile(path, 'utf8')));
}

export function stripAnsi(value: string): string {
  const escape = String.fromCharCode(27);
  return value.replace(new RegExp(`${escape}\\[[0-?]*[ -/]*[@-~]`, 'g'), '');
}

export function boundedOutput(value: string, limit = 12_000): string {
  const clean = stripAnsi(value).trim();
  return clean.length <= limit
    ? clean
    : `${clean.slice(0, limit)}\n… output truncated`;
}
