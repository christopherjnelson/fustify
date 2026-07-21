import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { balanceStudyFixtures } from './studyFixtures';
import { parseBalanceStudyReport } from './balanceStudyContract';
import {
  BALANCE_PRESETS,
  createStudyMatrix,
  stableHash,
} from '../core/simulation/balanceStudy';
import {
  finalizeStudy,
  readCheckpoint,
  readStudy,
  studyPaths,
  writeStudyProgress,
} from '../../scripts/balanceStudyStore';

describe('balance study report and checkpoint store', () => {
  it('atomically exposes progress and a resumable checkpoint', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'fustify-study-'));
    const config = BALANCE_PRESETS.quick;
    const matrix = createStudyMatrix(config);
    const checkpoint = {
      schemaVersion: 1 as const,
      runId: balanceStudyFixtures.running.id,
      preset: 'quick',
      config,
      configHash: stableHash(config),
      matrixHash: stableHash(matrix),
      commit: balanceStudyFixtures.running.repository.commit,
      startedAt: balanceStudyFixtures.running.startedAt,
      runtimeMs: 10,
      completed: [],
    };
    await writeStudyProgress(balanceStudyFixtures.running, checkpoint, root);
    expect(
      (await readStudy(balanceStudyFixtures.running.id, root)).status,
    ).toBe('running');
    expect(
      (await readCheckpoint(balanceStudyFixtures.running.id, root)).completed,
    ).toHaveLength(0);
    expect((await readdir(root)).some((name) => name.endsWith('.tmp'))).toBe(
      false,
    );
  });
  it('retains completed history without deleting active checkpoint data', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'fustify-study-history-'));
    for (let index = 0; index < 3; index += 1)
      await finalizeStudy(
        { ...balanceStudyFixtures.completed, id: `balance-complete-${index}` },
        2,
        root,
      );
    expect(await readdir(studyPaths(root).history)).toHaveLength(2);
  });
  it('rejects traversal-like run IDs', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'fustify-study-safe-'));
    await expect(readStudy('../escape', root)).rejects.toThrow('Invalid');
  });
  it('keeps historical schema-v1 reports without new seat metrics readable', () => {
    const legacy = structuredClone(balanceStudyFixtures.completed);
    delete legacy.aggregate.diagnostic;
    delete legacy.aggregate.playerCountSeatSummaries;
    delete legacy.plan.rotationDesign;
    delete legacy.plan.pairRotationCount;
    expect(parseBalanceStudyReport(legacy).id).toBe(legacy.id);
  });
});
