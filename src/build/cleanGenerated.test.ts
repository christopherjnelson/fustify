import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cleanGenerated,
  cleanupTargets,
  resolveCleanupTarget,
} from '../../scripts/cleanGenerated';

async function repositoryFixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'fustify-clean-'));
  await writeFile(
    resolve(root, 'package.json'),
    JSON.stringify({ name: 'fustify' }),
  );
  return root;
}

async function fixtureFile(root: string, path: string) {
  const target = resolve(root, path);
  await mkdir(resolve(target, '..'), { recursive: true });
  await writeFile(target, path);
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('generated-output cleanup', () => {
  it('keeps report history and private developer state during routine cleanup', async () => {
    const root = await repositoryFixture();
    await fixtureFile(root, 'dist/index.html');
    await fixtureFile(root, '.fustify/reports/bundle/stats.json');
    await fixtureFile(root, '.fustify/reports/history/run.json');
    await fixtureFile(root, 'artifacts/bot-simulations/report.json');
    await fixtureFile(root, '.env.local');
    await fixtureFile(root, 'node_modules/package/index.js');
    await fixtureFile(root, 'supabase/.temp/state');

    await cleanGenerated({ root, mode: 'transient', log: () => undefined });

    expect(await exists(resolve(root, 'dist'))).toBe(false);
    expect(await exists(resolve(root, '.fustify/reports/bundle'))).toBe(false);
    expect(
      await exists(resolve(root, '.fustify/reports/history/run.json')),
    ).toBe(true);
    expect(
      await exists(resolve(root, 'artifacts/bot-simulations/report.json')),
    ).toBe(true);
    expect(await readFile(resolve(root, '.env.local'), 'utf8')).toBe(
      '.env.local',
    );
    expect(await exists(resolve(root, 'node_modules/package/index.js'))).toBe(
      true,
    );
    expect(await exists(resolve(root, 'supabase/.temp/state'))).toBe(true);
  });

  it('removes reports and artifacts only in explicit report mode', async () => {
    const root = await repositoryFixture();
    await fixtureFile(root, 'dist/index.html');
    await fixtureFile(root, '.fustify/reports/studies/checkpoint.json');
    await fixtureFile(root, 'artifacts/bot-simulations/report.json');
    await fixtureFile(root, '.fustify/brand-reference/old.png');

    await cleanGenerated({ root, mode: 'reports', log: () => undefined });

    expect(await exists(resolve(root, 'dist/index.html'))).toBe(true);
    expect(await exists(resolve(root, '.fustify/reports'))).toBe(false);
    expect(await exists(resolve(root, 'artifacts'))).toBe(false);
    expect(await exists(resolve(root, '.fustify/brand-reference'))).toBe(false);
  });

  it('supports dry runs and missing targets without changing files', async () => {
    const root = await repositoryFixture();
    await fixtureFile(root, 'coverage/index.html');

    await cleanGenerated({
      root,
      mode: 'all',
      dryRun: true,
      log: () => undefined,
    });
    expect(await exists(resolve(root, 'coverage/index.html'))).toBe(true);

    await cleanGenerated({ root, mode: 'all', log: () => undefined });
    await cleanGenerated({ root, mode: 'all', log: () => undefined });
    expect(await exists(resolve(root, 'coverage'))).toBe(false);
  });

  it('rejects paths outside the repository and non-project roots', async () => {
    const root = await repositoryFixture();
    expect(() => resolveCleanupTarget(root, '../outside')).toThrow(
      'outside repository',
    );
    await writeFile(resolve(root, 'package.json'), '{"name":"another-app"}');
    await expect(
      cleanGenerated({ root, mode: 'transient', log: () => undefined }),
    ).rejects.toThrow('non-Fustify');
  });

  it('keeps cleanup modes explicit and allowlisted', () => {
    expect(cleanupTargets('transient')).not.toContain('.fustify/reports');
    expect(cleanupTargets('reports')).toEqual([
      '.fustify/reports',
      'artifacts',
      '.fustify/brand-reference',
    ]);
    expect(cleanupTargets('all')).not.toContain('.fustify/reports/bundle');
  });
});
