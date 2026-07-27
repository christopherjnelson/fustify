import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import {
  BUNDLE_BUDGETS,
  evaluateBundleBudgets,
  type AssetSizes,
  type BundleManifest,
} from '../src/build/bundleBudget.ts';

const reportRoot = resolve('.fustify/reports/bundle');
const outputRoot = resolve(reportRoot, 'dist');
const manifestPath = resolve(outputRoot, '.vite/manifest.json');
const statsPath = resolve(reportRoot, 'stats.json');
const auditPath = resolve(reportRoot, 'audit.json');

async function measureAssets(manifest: BundleManifest): Promise<AssetSizes> {
  const emittedAssets = await readdir(resolve(outputRoot, 'assets'));
  const files = [
    ...new Set([
      ...Object.values(manifest)
        .map((entry) => entry.file)
        .filter((file) => file.endsWith('.js')),
      ...emittedAssets
        .filter((file) => file.endsWith('.js'))
        .map((file) => `assets/${file}`),
    ]),
  ];
  const sizes: AssetSizes = {};
  await Promise.all(
    files.map(async (file) => {
      const path = resolve(outputRoot, file);
      const [info, contents] = await Promise.all([stat(path), readFile(path)]);
      sizes[file] = { raw: info.size, gzip: gzipSync(contents).byteLength };
    }),
  );
  return sizes;
}

/**
 * Refuse to grade a report whose visualizer stats predate the manifest. Vite
 * empties the analysis dist directory on every build, but stats.json is
 * overwritten in place, so a build that fails after emitting the manifest
 * could otherwise be graded against a previous run's module graph.
 */
async function assertFreshStats(): Promise<void> {
  const [manifestInfo, statsInfo] = await Promise.all([
    stat(manifestPath),
    stat(statsPath).catch(() => null),
  ]);
  if (!statsInfo) {
    throw new Error(
      'Bundle stats.json is missing. Run `pnpm bundle:analyze` before checking budgets.',
    );
  }
  if (statsInfo.mtimeMs < manifestInfo.mtimeMs - 1_000) {
    throw new Error(
      'Bundle stats.json is older than the manifest. The report is stale; rerun `pnpm bundle:analyze`.',
    );
  }
}

async function main() {
  await assertFreshStats();
  const manifest = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  ) as BundleManifest;
  const sizes = await measureAssets(manifest);
  const stats = await readFile(statsPath, 'utf8');
  const evaluation = evaluateBundleBudgets(
    manifest,
    sizes,
    stats,
    BUNDLE_BUDGETS,
  );

  for (const route of evaluation.routes) {
    const headroom = route.gzipBudget - route.gzip;
    console.log(
      `${route.id.padEnd(18)} gzip ${String(route.gzip).padStart(7)} / ${String(route.gzipBudget).padStart(7)} (${headroom >= 0 ? '+' : ''}${headroom})  ${route.description}`,
    );
  }
  console.log(
    `largest JS         raw  ${evaluation.largest.raw} / ${evaluation.largest.budget}  ${evaluation.largest.file}`,
  );

  await writeFile(
    auditPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        node: process.version,
        routes: evaluation.routes,
        largest: evaluation.largest,
        failures: evaluation.failures,
      },
      null,
      2,
    )}\n`,
  );

  if (evaluation.failures.length > 0) {
    throw new Error(
      `Bundle budget failed:\n- ${evaluation.failures.join('\n- ')}`,
    );
  }
  console.log('Bundle budgets passed.');
}

await main();
