import { readFile, rm } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type CleanupMode = 'transient' | 'reports' | 'all';

const TRANSIENT_TARGETS = [
  'dist',
  'dist-api',
  'coverage',
  'test-results',
  'playwright-report',
  '.fustify/reports/bundle',
  '.fustify/release',
] as const;

const REPORT_TARGETS = [
  '.fustify/reports',
  'artifacts',
  '.fustify/brand-reference',
] as const;

export function cleanupTargets(mode: CleanupMode): string[] {
  if (mode === 'transient') return [...TRANSIENT_TARGETS];
  if (mode === 'reports') return [...REPORT_TARGETS];
  return [
    ...TRANSIENT_TARGETS.filter(
      (target) => target !== '.fustify/reports/bundle',
    ),
    ...REPORT_TARGETS,
  ];
}

export function resolveCleanupTarget(root: string, target: string): string {
  const repositoryRoot = resolve(root);
  const resolvedTarget = resolve(repositoryRoot, target);
  const pathFromRoot = relative(repositoryRoot, resolvedTarget);
  if (
    pathFromRoot === '' ||
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  ) {
    throw new Error(`Refusing cleanup target outside repository: ${target}`);
  }
  return resolvedTarget;
}

async function assertRepositoryRoot(root: string): Promise<void> {
  const packageJson = JSON.parse(
    await readFile(resolve(root, 'package.json'), 'utf8'),
  ) as { name?: unknown };
  if (packageJson.name !== 'fustify') {
    throw new Error(
      `Refusing to clean non-Fustify directory: ${resolve(root)}`,
    );
  }
}

export async function cleanGenerated({
  root = process.cwd(),
  mode,
  dryRun = false,
  remove = rm,
  log = console.log,
}: {
  root?: string;
  mode: CleanupMode;
  dryRun?: boolean;
  remove?: (
    path: string,
    options: { recursive: true; force: true },
  ) => Promise<void>;
  log?: (message: string) => void;
}): Promise<string[]> {
  const repositoryRoot = resolve(root);
  await assertRepositoryRoot(repositoryRoot);
  const targets = cleanupTargets(mode).map((target) =>
    resolveCleanupTarget(repositoryRoot, target),
  );
  for (const target of targets) {
    if (!dryRun) await remove(target, { recursive: true, force: true });
    log(
      `${dryRun ? 'Would remove' : 'Removed'} ${relative(repositoryRoot, target)}`,
    );
  }
  return targets;
}

function parseArguments(arguments_: string[]): {
  mode: CleanupMode;
  dryRun: boolean;
} {
  const modeArguments = arguments_.filter((argument) =>
    ['--transient', '--reports', '--all'].includes(argument),
  );
  const unknown = arguments_.filter(
    (argument) =>
      argument !== '--dry-run' &&
      !['--transient', '--reports', '--all'].includes(argument),
  );
  if (unknown.length > 0)
    throw new Error(`Unknown cleanup option: ${unknown.join(', ')}`);
  if (modeArguments.length !== 1)
    throw new Error('Choose exactly one cleanup mode.');
  return {
    mode: modeArguments[0]!.slice(2) as CleanupMode,
    dryRun: arguments_.includes('--dry-run'),
  };
}

const directEntry = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (directEntry) {
  const options = parseArguments(process.argv.slice(2));
  await cleanGenerated(options);
}
