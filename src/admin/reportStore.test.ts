import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adminFixtures } from './reportFixtures';
import {
  atomicWriteJson,
  boundedOutput,
  finalizeReport,
  readValidatedReport,
  reportPaths,
  writeLatest,
} from '../../scripts/verification/reportStore';

describe('verification artifact store', () => {
  it('atomically replaces latest and validates it', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'fustify-reports-'));
    await writeLatest(adminFixtures.running, root);
    await writeLatest(adminFixtures.passed, root);
    expect((await readValidatedReport(reportPaths(root).latest)).status).toBe(
      'passed',
    );
    expect((await readdir(root)).some((name) => name.endsWith('.tmp'))).toBe(
      false,
    );
  });
  it('creates history and enforces retention', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'fustify-history-'));
    for (let index = 0; index < 3; index += 1)
      await finalizeReport(
        { ...adminFixtures.passed, id: `fixture-${index}` },
        2,
        root,
      );
    expect((await readdir(reportPaths(root).history)).length).toBe(2);
  });
  it('rejects unsafe IDs before creating history outside the root', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'fustify-safe-'));
    await expect(
      finalizeReport({ ...adminFixtures.passed, id: '../escape' }, 2, root),
    ).rejects.toThrow('Unsafe');
  });
  it('strips ANSI and truncates bounded diagnostics', () => {
    const output = boundedOutput(
      '\u001b[31mfailed\u001b[0m ' + 'x'.repeat(100),
      20,
    );
    expect(output).not.toContain('\u001b');
    expect(output).toContain('truncated');
  });
  it('writes valid JSON through the generic atomic primitive', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'fustify-atomic-'));
    const path = resolve(root, 'nested', 'value.json');
    await atomicWriteJson(path, { ok: true });
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ ok: true });
  });
});
