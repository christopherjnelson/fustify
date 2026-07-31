// Pure bundle-budget evaluation.
//
// This module deliberately contains no filesystem, zlib, or process access so
// that it can be unit tested directly. `scripts/checkBundle.ts` performs the
// I/O (reading the Vite manifest, stat-ing and gzipping assets) and hands the
// resulting plain data to `evaluateBundleBudgets`.
//
// Budget semantics are documented in docs/operations/bundle-analysis.md.
// In short: a route budget is the transitive closure of *static* imports from
// the HTML entry chunk plus the chunks that the router loads for that route.
// Dynamic imports are excluded, because they are what code splitting is for;
// each asset is counted exactly once even when several roots reach it.

export interface BundleManifestEntry {
  file: string;
  name?: string;
  src?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
}

export type BundleManifest = Record<string, BundleManifestEntry>;

export interface AssetSize {
  raw: number;
  gzip: number;
}

/** Sizes keyed by emitted file path, relative to the build output root. */
export type AssetSizes = Record<string, AssetSize>;

export interface RouteBudget {
  /** Stable identifier used in output and in the audit artifact. */
  id: string;
  /** Human description of what a browser downloads for this route. */
  description: string;
  /**
   * Rollup chunk names (manifest `name` fields) the router loads for the
   * route. The HTML entry chunk is always included implicitly. Names are used
   * rather than manifest keys or file names because they are stable across
   * content hashes and across Rollup's promotion of a dynamic entry to a
   * shared chunk.
   */
  chunkNames: string[];
  /**
   * Prefixes for emitted JavaScript resources that Vite does not expose as
   * manifest imports, notably module workers created with `new Worker()`.
   */
  additionalAssetPrefixes?: string[];
  /** Maximum permitted gzip total, in bytes, for the whole route closure. */
  gzipBudget: number;
}

export interface BundleBudgets {
  routes: RouteBudget[];
  largestJavaScriptRaw: number;
}

export interface RouteAsset {
  file: string;
  raw: number;
  gzip: number;
}

export interface RouteMeasurement {
  id: string;
  description: string;
  gzipBudget: number;
  gzip: number;
  raw: number;
  /** Contributing JavaScript assets, largest gzip first. Deterministic. */
  assets: RouteAsset[];
}

export interface BundleEvaluation {
  routes: RouteMeasurement[];
  largest: RouteAsset & { budget: number };
  failures: string[];
}

/**
 * Route budgets for Fustify's hand-rolled router (see src/main.tsx and
 * src/browser/BrowserApp.tsx). Baselines and headroom rationale live in
 * docs/operations/bundle-analysis.md.
 */
export const BUNDLE_BUDGETS: BundleBudgets = {
  routes: [
    {
      id: 'public-shell',
      description: 'Signed-out or signed-in homepage at /',
      chunkNames: ['BrowserApp'],
      gzipBudget: 158_000,
    },
    {
      id: 'homepage-preview',
      description:
        'Homepage after the deferred generated-globe preview is loaded',
      chunkNames: ['BrowserApp', 'HomeWorldPreview'],
      additionalAssetPrefixes: ['assets/homeWorld.worker-'],
      gzipBudget: 470_000,
    },
    {
      id: 'auth-page',
      description: 'Standalone /auth/* callback page',
      chunkNames: ['AuthCallbackPage'],
      gzipBudget: 150_000,
    },
    {
      id: 'auth-profile-completion',
      description: 'Standalone Discord profile confirmation page',
      chunkNames: ['DiscordProfileCompletionPage'],
      gzipBudget: 150_000,
    },
    {
      id: 'local-game',
      description: 'Local setup before active match controls load at /local',
      chunkNames: ['BrowserApp', 'App'],
      gzipBudget: 472_000,
    },
    {
      id: 'local-active-match',
      description: 'Local match after active controls load at /local',
      chunkNames: ['BrowserApp', 'App', 'LocalActiveMatchSurface'],
      gzipBudget: 496_000,
    },
    {
      id: 'multiplayer-entry',
      description: 'Multiplayer lobby and room before the match surface loads',
      chunkNames: ['BrowserApp', 'MultiplayerApp'],
      gzipBudget: 475_500,
    },
    {
      id: 'multiplayer-match',
      description: 'Multiplayer match after the authoritative surface loads',
      chunkNames: ['BrowserApp', 'MultiplayerApp', 'MultiplayerGameScene'],
      gzipBudget: 504_000,
    },
    {
      id: 'admin',
      description: 'Restricted administration dashboard at /admin',
      chunkNames: ['AdminApp', 'reportSource'],
      gzipBudget: 166_000,
    },
  ],
  largestJavaScriptRaw: 1_080_000,
};

/**
 * Module substrings that must never appear in the browser module graph.
 * Matched against the rollup-plugin-visualizer raw-data stats file.
 */
export const FORBIDDEN_BROWSER_MODULES = [
  '@playwright/test',
  '/vitest/',
  '/scripts/balanceStudy',
  '/scripts/verifyReport',
  '/src/testSupport/',
  '/src/build/',
  'node:child_process',
  'node:fs',
] as const;

export function findEntryKey(manifest: BundleManifest): string {
  const keys = Object.keys(manifest)
    .filter((key) => manifest[key]?.isEntry)
    .sort();
  if (keys.length !== 1) {
    throw new Error(
      `Bundle manifest must have exactly one browser entry, found ${keys.length}.`,
    );
  }
  return keys[0]!;
}

/**
 * Resolve a Rollup chunk name to its manifest key. Throws when the name is
 * missing or ambiguous so that a renamed or newly duplicated route chunk fails
 * loudly instead of silently shrinking a measured route.
 */
export function findChunkKeyByName(
  manifest: BundleManifest,
  name: string,
): string {
  const keys = Object.keys(manifest)
    .filter((key) => manifest[key]?.name === name)
    .sort();
  if (keys.length === 0) {
    throw new Error(`Bundle manifest has no chunk named "${name}".`);
  }
  if (keys.length > 1) {
    throw new Error(
      `Bundle manifest has ${keys.length} chunks named "${name}": ${keys.join(', ')}.`,
    );
  }
  return keys[0]!;
}

/**
 * Transitive closure over static imports only. The visited set makes the
 * traversal cycle-safe and guarantees a shared chunk reached through several
 * paths is counted exactly once.
 */
export function staticClosure(
  manifest: BundleManifest,
  roots: string[],
): Set<string> {
  const found = new Set<string>();
  const pending = [...roots];
  while (pending.length > 0) {
    const key = pending.pop()!;
    if (found.has(key)) continue;
    found.add(key);
    pending.push(...(manifest[key]?.imports ?? []));
  }
  return found;
}

function assetSize(sizes: AssetSizes, file: string): AssetSize {
  const size = sizes[file];
  if (!size) {
    throw new Error(
      `Bundle report is missing a size for emitted asset ${file}.`,
    );
  }
  return size;
}

/** Deterministic, de-duplicated list of JavaScript assets for a route. */
export function routeAssets(
  manifest: BundleManifest,
  roots: string[],
  sizes: AssetSizes,
  additionalAssetPrefixes: string[] = [],
): RouteAsset[] {
  const files = new Set<string>();
  for (const key of staticClosure(manifest, roots)) {
    const file = manifest[key]?.file;
    if (file?.endsWith('.js')) files.add(file);
  }
  for (const file of Object.keys(sizes)) {
    if (additionalAssetPrefixes.some((prefix) => file.startsWith(prefix))) {
      files.add(file);
    }
  }
  return [...files]
    .map((file) => ({ file, ...assetSize(sizes, file) }))
    .sort((a, b) => b.gzip - a.gzip || a.file.localeCompare(b.file));
}

export function measureRoute(
  manifest: BundleManifest,
  route: RouteBudget,
  sizes: AssetSizes,
): RouteMeasurement {
  const entryKey = findEntryKey(manifest);
  const roots = [
    entryKey,
    ...route.chunkNames.map((name) => findChunkKeyByName(manifest, name)),
  ];
  const assets = routeAssets(
    manifest,
    roots,
    sizes,
    route.additionalAssetPrefixes,
  );
  return {
    id: route.id,
    description: route.description,
    gzipBudget: route.gzipBudget,
    gzip: assets.reduce((sum, asset) => sum + asset.gzip, 0),
    raw: assets.reduce((sum, asset) => sum + asset.raw, 0),
    assets,
  };
}

export function largestJavaScriptAsset(
  _manifest: BundleManifest,
  sizes: AssetSizes,
): RouteAsset {
  const files = Object.keys(sizes).filter((file) => file.endsWith('.js'));
  if (files.length === 0) {
    throw new Error('Bundle manifest contains no JavaScript assets.');
  }
  return files
    .map((file) => ({ file, ...assetSize(sizes, file) }))
    .sort((a, b) => b.raw - a.raw || a.file.localeCompare(b.file))[0]!;
}

export function findForbiddenModules(stats: string): string[] {
  return FORBIDDEN_BROWSER_MODULES.filter((needle) => stats.includes(needle));
}

function formatAssets(assets: RouteAsset[]): string {
  return assets
    .map(
      (asset) =>
        `    ${String(asset.gzip).padStart(8)} gzip  ${String(asset.raw).padStart(9)} raw  ${asset.file}`,
    )
    .join('\n');
}

export function evaluateBundleBudgets(
  manifest: BundleManifest,
  sizes: AssetSizes,
  stats: string,
  budgets: BundleBudgets = BUNDLE_BUDGETS,
): BundleEvaluation {
  const routes = budgets.routes.map((route) =>
    measureRoute(manifest, route, sizes),
  );
  const largest = {
    ...largestJavaScriptAsset(manifest, sizes),
    budget: budgets.largestJavaScriptRaw,
  };
  const forbidden = findForbiddenModules(stats);

  const failures: string[] = [];
  for (const route of routes) {
    if (route.gzip > route.gzipBudget) {
      failures.push(
        `${route.id} gzip ${route.gzip} > ${route.gzipBudget} (over by ${route.gzip - route.gzipBudget})\n` +
          `  contributing assets:\n${formatAssets(route.assets)}`,
      );
    }
  }
  if (largest.raw > largest.budget) {
    failures.push(
      `largest JS ${largest.file} raw ${largest.raw} > ${largest.budget} (over by ${largest.raw - largest.budget})`,
    );
  }
  if (forbidden.length > 0) {
    failures.push(
      `browser graph contains forbidden modules: ${forbidden.join(', ')}`,
    );
  }

  return { routes, largest, failures };
}
