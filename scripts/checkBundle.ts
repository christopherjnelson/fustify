import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';

type ManifestEntry = {
  file: string;
  isEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  name?: string;
  src?: string;
};

const reportRoot = resolve('.fustify/reports/bundle');
const outputRoot = resolve(reportRoot, 'dist');
const manifestPath = resolve(outputRoot, '.vite/manifest.json');
const statsPath = resolve(reportRoot, 'stats.json');

const budgets = {
  initialGameGzip: 385_000,
  initialAdminGzip: 125_000,
  largestJavaScriptRaw: 1_075_000,
} as const;

function dependencies(
  manifest: Record<string, ManifestEntry>,
  keys: string[],
): Set<string> {
  const found = new Set<string>();
  const pending = [...keys];
  while (pending.length > 0) {
    const key = pending.pop()!;
    if (found.has(key)) continue;
    found.add(key);
    pending.push(...(manifest[key]?.imports ?? []));
  }
  return found;
}

async function gzipBytes(path: string): Promise<number> {
  return gzipSync(await readFile(path)).byteLength;
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<
    string,
    ManifestEntry
  >;
  const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry);
  if (!entryKey) throw new Error('Bundle manifest has no browser entry.');

  const appKey = Object.keys(manifest).find((key) => key.endsWith('/App.tsx'));
  const adminKey = Object.keys(manifest).find((key) =>
    key.endsWith('/AdminDashboard.tsx'),
  );
  const reportSourceKey = Object.keys(manifest).find((key) =>
    key.endsWith('/reportSource.ts'),
  );
  if (!appKey || !adminKey || !reportSourceKey) {
    throw new Error(
      'Bundle manifest is missing the game or admin route chunk.',
    );
  }

  const routeSize = async (routeKey: string) => {
    const keys = dependencies(manifest, [entryKey, routeKey]);
    return (
      await Promise.all(
        [...keys]
          .map((key) => manifest[key]?.file)
          .filter((file): file is string => file?.endsWith('.js') ?? false)
          .map((file) => gzipBytes(resolve(outputRoot, file))),
      )
    ).reduce((sum, size) => sum + size, 0);
  };

  const gameGzip = await routeSize(appKey);
  const adminGzip = await (async () => {
    const keys = dependencies(manifest, [entryKey, adminKey, reportSourceKey]);
    return (
      await Promise.all(
        [...keys]
          .map((key) => manifest[key]?.file)
          .filter((file): file is string => file?.endsWith('.js') ?? false)
          .map((file) => gzipBytes(resolve(outputRoot, file))),
      )
    ).reduce((sum, size) => sum + size, 0);
  })();
  const jsFiles = Object.values(manifest)
    .map((entry) => entry.file)
    .filter((file) => file.endsWith('.js'));
  const rawSizes = await Promise.all(
    jsFiles.map(async (file) => ({
      file,
      bytes: (await stat(resolve(outputRoot, file))).size,
    })),
  );
  const largest = rawSizes.sort((a, b) => b.bytes - a.bytes)[0];

  const stats = await readFile(statsPath, 'utf8');
  const forbidden = [
    '@playwright/test',
    '/vitest/',
    '/scripts/balanceStudy',
    '/scripts/verifyReport',
    '/src/testSupport/',
    'node:child_process',
    'node:fs',
  ].filter((needle) => stats.includes(needle));

  const failures = [
    gameGzip > budgets.initialGameGzip &&
      `game initial gzip ${gameGzip} > ${budgets.initialGameGzip}`,
    adminGzip > budgets.initialAdminGzip &&
      `admin initial gzip ${adminGzip} > ${budgets.initialAdminGzip}`,
    largest.bytes > budgets.largestJavaScriptRaw &&
      `largest JS ${largest.bytes} > ${budgets.largestJavaScriptRaw}`,
    forbidden.length > 0 &&
      `browser graph contains forbidden modules: ${forbidden.join(', ')}`,
  ].filter(Boolean);

  console.log(`Initial game JS (gzip): ${gameGzip} bytes`);
  console.log(`Initial admin JS (gzip): ${adminGzip} bytes`);
  console.log(`Largest JS: ${largest.file} (${largest.bytes} bytes raw)`);
  if (failures.length > 0) {
    throw new Error(`Bundle budget failed:\n- ${failures.join('\n- ')}`);
  }
  console.log('Bundle budgets passed.');
}

await main();
