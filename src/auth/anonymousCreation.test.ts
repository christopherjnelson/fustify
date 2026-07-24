import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

async function productionFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (path.endsWith(join('src', 'testSupport'))) return [];
        return productionFiles(path);
      }
      if (
        !['.ts', '.tsx'].includes(extname(entry.name)) ||
        entry.name.includes('.test.')
      ) {
        return [];
      }
      return [path];
    }),
  );
  return nested.flat();
}

describe('production Auth flows', () => {
  it('contain no anonymous-user creation path', async () => {
    const files = (
      await Promise.all([
        productionFiles('src'),
        productionFiles('supabase/functions'),
      ])
    ).flat();
    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      if (source.includes('signInAnonymously')) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
