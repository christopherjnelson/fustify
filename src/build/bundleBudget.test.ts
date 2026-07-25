import { describe, expect, it } from 'vitest';
import {
  BUNDLE_BUDGETS,
  evaluateBundleBudgets,
  findChunkKeyByName,
  findEntryKey,
  findForbiddenModules,
  largestJavaScriptAsset,
  measureRoute,
  routeAssets,
  staticClosure,
  type AssetSizes,
  type BundleManifest,
} from './bundleBudget';

/**
 * A miniature manifest shaped like Fustify's real analysis output: one HTML
 * entry, a dynamically loaded public shell, two dynamically loaded route
 * chunks, one shared chunk reached by both routes, and an isolated admin
 * route. File names deliberately carry fake hashes so nothing in these tests
 * depends on real content hashes.
 */
function manifest(): BundleManifest {
  return {
    'index.html': {
      file: 'assets/index-aaaa.js',
      name: 'index',
      isEntry: true,
      dynamicImports: [
        '_BrowserApp-bbbb.js',
        'src/admin/AdminApp.tsx',
        'src/admin/reportSource.ts',
        'src/auth/AuthCallbackPage.tsx',
      ],
    },
    '_BrowserApp-bbbb.js': {
      file: 'assets/BrowserApp-bbbb.js',
      name: 'BrowserApp',
      isDynamicEntry: true,
      imports: ['index.html', '_authFlow-cccc.js'],
      dynamicImports: ['src/app/App.tsx', 'src/multiplayer/MultiplayerApp.tsx'],
    },
    '_authFlow-cccc.js': {
      file: 'assets/authFlow-cccc.js',
      name: 'authFlow',
      imports: ['_schemas-dddd.js'],
    },
    '_schemas-dddd.js': { file: 'assets/schemas-dddd.js', name: 'schemas' },
    '_GameSetup-eeee.js': {
      file: 'assets/GameSetup-eeee.js',
      name: 'GameSetup',
      imports: ['index.html', '_schemas-dddd.js', '_BrowserApp-bbbb.js'],
    },
    'src/app/App.tsx': {
      file: 'assets/App-ffff.js',
      name: 'App',
      isDynamicEntry: true,
      imports: ['index.html', '_GameSetup-eeee.js', '_BrowserApp-bbbb.js'],
    },
    'src/multiplayer/MultiplayerApp.tsx': {
      file: 'assets/MultiplayerApp-gggg.js',
      name: 'MultiplayerApp',
      isDynamicEntry: true,
      imports: ['index.html', '_GameSetup-eeee.js', '_BrowserApp-bbbb.js'],
    },
    'src/admin/AdminApp.tsx': {
      file: 'assets/AdminApp-hhhh.js',
      name: 'AdminApp',
      isDynamicEntry: true,
      imports: ['index.html'],
    },
    'src/admin/reportSource.ts': {
      file: 'assets/reportSource-iiii.js',
      name: 'reportSource',
      isDynamicEntry: true,
      imports: ['_schemas-dddd.js'],
    },
    'src/auth/AuthCallbackPage.tsx': {
      file: 'assets/AuthCallbackPage-jjjj.js',
      name: 'AuthCallbackPage',
      isDynamicEntry: true,
      imports: ['index.html', '_authFlow-cccc.js'],
    },
  };
}

const sizes: AssetSizes = {
  'assets/index-aaaa.js': { raw: 1000, gzip: 100 },
  'assets/BrowserApp-bbbb.js': { raw: 2000, gzip: 200 },
  'assets/authFlow-cccc.js': { raw: 4000, gzip: 400 },
  'assets/schemas-dddd.js': { raw: 8000, gzip: 800 },
  'assets/GameSetup-eeee.js': { raw: 16_000, gzip: 1600 },
  'assets/App-ffff.js': { raw: 32, gzip: 16 },
  'assets/MultiplayerApp-gggg.js': { raw: 64, gzip: 32 },
  'assets/AdminApp-hhhh.js': { raw: 128, gzip: 64 },
  'assets/reportSource-iiii.js': { raw: 256, gzip: 128 },
  'assets/AuthCallbackPage-jjjj.js': { raw: 512, gzip: 256 },
};

describe('manifest traversal', () => {
  it('resolves the single browser entry', () => {
    expect(findEntryKey(manifest())).toBe('index.html');
  });

  it('rejects a manifest with more than one entry', () => {
    const broken = manifest();
    broken['second.html'] = { file: 'assets/second.js', isEntry: true };
    expect(() => findEntryKey(broken)).toThrow(/exactly one browser entry/);
  });

  it('resolves route chunks by stable Rollup name, not by hashed file', () => {
    expect(findChunkKeyByName(manifest(), 'BrowserApp')).toBe(
      '_BrowserApp-bbbb.js',
    );
    expect(findChunkKeyByName(manifest(), 'App')).toBe('src/app/App.tsx');
  });

  it('fails loudly when a route chunk is renamed away', () => {
    expect(() => findChunkKeyByName(manifest(), 'Missing')).toThrow(
      /no chunk named "Missing"/,
    );
  });

  it('fails loudly when a chunk name is ambiguous', () => {
    const ambiguous = manifest();
    ambiguous['_App-zzzz.js'] = { file: 'assets/App-zzzz.js', name: 'App' };
    expect(() => findChunkKeyByName(ambiguous, 'App')).toThrow(/2 chunks/);
  });

  it('follows static imports only, ignoring dynamic imports', () => {
    const closure = staticClosure(manifest(), ['index.html']);
    expect([...closure]).toEqual(['index.html']);
  });

  it('terminates on cyclic static imports', () => {
    const cyclic = manifest();
    cyclic['_schemas-dddd.js']!.imports = ['_authFlow-cccc.js'];
    const closure = staticClosure(cyclic, ['_authFlow-cccc.js']);
    expect([...closure].sort()).toEqual([
      '_authFlow-cccc.js',
      '_schemas-dddd.js',
    ]);
  });

  it('counts a shared chunk reached through several paths exactly once', () => {
    const assets = routeAssets(
      manifest(),
      ['index.html', 'src/app/App.tsx', 'src/multiplayer/MultiplayerApp.tsx'],
      sizes,
    );
    const schemas = assets.filter(
      (asset) => asset.file === 'assets/schemas-dddd.js',
    );
    expect(schemas).toHaveLength(1);
    const files = assets.map((asset) => asset.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it('produces a deterministic asset ordering', () => {
    const first = routeAssets(
      manifest(),
      ['index.html', 'src/app/App.tsx'],
      sizes,
    );
    const second = routeAssets(
      manifest(),
      ['src/app/App.tsx', 'index.html'],
      sizes,
    );
    expect(second).toEqual(first);
    expect(first.map((asset) => asset.gzip)).toEqual(
      [...first.map((asset) => asset.gzip)].sort((a, b) => b - a),
    );
  });

  it('refuses to grade a manifest whose asset sizes are missing', () => {
    expect(() => routeAssets(manifest(), ['index.html'], {})).toThrow(
      /missing a size/,
    );
  });
});

describe('route isolation', () => {
  const budgets = BUNDLE_BUDGETS;
  const route = (id: string) => {
    const definition = budgets.routes.find((candidate) => candidate.id === id);
    if (!definition) throw new Error(`Unknown route budget ${id}`);
    return measureRoute(manifest(), definition, sizes);
  };
  const files = (id: string) => route(id).assets.map((asset) => asset.file);

  it('keeps gameplay and admin chunks out of the public shell', () => {
    expect(files('public-shell')).toEqual([
      'assets/schemas-dddd.js',
      'assets/authFlow-cccc.js',
      'assets/BrowserApp-bbbb.js',
      'assets/index-aaaa.js',
    ]);
    expect(files('public-shell')).not.toContain('assets/GameSetup-eeee.js');
    expect(files('public-shell')).not.toContain('assets/App-ffff.js');
    expect(files('public-shell')).not.toContain(
      'assets/MultiplayerApp-gggg.js',
    );
    expect(files('public-shell')).not.toContain('assets/AdminApp-hhhh.js');
  });

  it('keeps gameplay chunks out of the standalone auth page', () => {
    expect(files('auth-page')).not.toContain('assets/GameSetup-eeee.js');
    expect(files('auth-page')).not.toContain('assets/BrowserApp-bbbb.js');
  });

  it('keeps admin isolated from every game chunk', () => {
    const admin = files('admin');
    expect(admin).not.toContain('assets/GameSetup-eeee.js');
    expect(admin).not.toContain('assets/App-ffff.js');
    expect(admin).not.toContain('assets/MultiplayerApp-gggg.js');
    expect(admin).not.toContain('assets/BrowserApp-bbbb.js');
    expect(admin).not.toContain('assets/authFlow-cccc.js');
  });

  it('keeps the multiplayer chunk out of the local game route', () => {
    expect(files('local-game')).not.toContain('assets/MultiplayerApp-gggg.js');
  });

  it('keeps the local game chunk out of the multiplayer route', () => {
    expect(files('multiplayer-entry')).not.toContain('assets/App-ffff.js');
  });

  it('loads gameplay only behind the account-gated route chunks', () => {
    expect(files('local-game')).toContain('assets/GameSetup-eeee.js');
    expect(files('multiplayer-entry')).toContain('assets/GameSetup-eeee.js');
  });
});

describe('budget evaluation', () => {
  it('passes when every route is inside budget', () => {
    const result = evaluateBundleBudgets(manifest(), sizes, '', BUNDLE_BUDGETS);
    expect(result.failures).toEqual([]);
  });

  it('reports the largest raw JavaScript asset', () => {
    expect(largestJavaScriptAsset(manifest(), sizes).file).toBe(
      'assets/GameSetup-eeee.js',
    );
  });

  it('fails and lists the contributing assets when a route exceeds budget', () => {
    const result = evaluateBundleBudgets(manifest(), sizes, '', {
      routes: [
        {
          id: 'public-shell',
          description: 'shell',
          chunkNames: ['BrowserApp'],
          gzipBudget: 1000,
        },
      ],
      largestJavaScriptRaw: 1_000_000,
    });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('public-shell gzip 1500 > 1000');
    expect(result.failures[0]).toContain('over by 500');
    expect(result.failures[0]).toContain('assets/authFlow-cccc.js');
    expect(result.failures[0]).toContain('assets/index-aaaa.js');
  });

  it('fails when the largest raw chunk exceeds its threshold', () => {
    const result = evaluateBundleBudgets(manifest(), sizes, '', {
      routes: [],
      largestJavaScriptRaw: 15_999,
    });
    expect(result.failures[0]).toContain('largest JS assets/GameSetup-eeee.js');
    expect(result.failures[0]).toContain('over by 1');
  });

  it('fails when test-only or Node-only modules reach the browser graph', () => {
    const result = evaluateBundleBudgets(
      manifest(),
      sizes,
      '{"id":"/src/testSupport/visualScenarios.ts"}',
      BUNDLE_BUDGETS,
    );
    expect(result.failures.at(-1)).toContain('/src/testSupport/');
  });

  it('detects each forbidden module family', () => {
    expect(
      findForbiddenModules('node:child_process and /vitest/ and node:fs'),
    ).toEqual(['/vitest/', 'node:child_process', 'node:fs']);
    expect(findForbiddenModules('clean graph')).toEqual([]);
  });

  it('covers every routed application area', () => {
    expect(BUNDLE_BUDGETS.routes.map((route) => route.id)).toEqual([
      'public-shell',
      'auth-page',
      'local-game',
      'multiplayer-entry',
      'admin',
    ]);
  });
});
