import { access, mkdtemp, readdir } from 'node:fs/promises';
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
  createStudyHeartbeatWriter,
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
  it('retains completed history and deletes only completed checkpoints', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'fustify-study-history-'));
    const activeCheckpoint = {
      schemaVersion: 1 as const,
      runId: balanceStudyFixtures.running.id,
      preset: 'quick',
      config: BALANCE_PRESETS.quick,
      configHash: stableHash(BALANCE_PRESETS.quick),
      matrixHash: stableHash(createStudyMatrix(BALANCE_PRESETS.quick)),
      commit: balanceStudyFixtures.running.repository.commit,
      startedAt: balanceStudyFixtures.running.startedAt,
      runtimeMs: 10,
      completed: [],
    };
    await writeStudyProgress(
      balanceStudyFixtures.running,
      activeCheckpoint,
      root,
    );
    for (let index = 0; index < 3; index += 1) {
      const report = {
        ...balanceStudyFixtures.completed,
        id: `balance-complete-${index}`,
      };
      await writeStudyProgress(
        { ...report, status: 'running', completedAt: undefined },
        { ...activeCheckpoint, runId: report.id },
        root,
      );
      await finalizeStudy(report, 2, root);
    }
    expect(await readdir(studyPaths(root).history)).toHaveLength(2);
    await expect(
      access(
        resolve(
          studyPaths(root).checkpoints,
          `${balanceStudyFixtures.running.id}.json`,
        ),
      ),
    ).resolves.toBeUndefined();
    await expect(
      access(resolve(studyPaths(root).checkpoints, 'balance-complete-2.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
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
  it('rate-limits atomic heartbeat writes and cleans them up on finalize', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'fustify-heartbeat-'));
    let clock = Date.parse('2026-07-21T12:00:00.000Z');
    let writes = 0;
    const heartbeat = createStudyHeartbeatWriter({
      runId: balanceStudyFixtures.running.id,
      directory: root,
      now: () => clock,
      write: async (path, value) => {
        writes += 1;
        const { atomicStudyWrite } =
          await import('../../scripts/balanceStudyStore');
        await atomicStudyWrite(path, value);
      },
    });
    expect(await heartbeat({ commandCount: 0 }, true)).toBe(true);
    clock += 1_000;
    expect(await heartbeat({ commandCount: 100 })).toBe(false);
    clock += 4_000;
    expect(await heartbeat({ commandCount: 200 })).toBe(true);
    expect(writes).toBe(2);
    expect(
      (await readdir(studyPaths(root).heartbeats)).some((name) =>
        name.endsWith('.tmp'),
      ),
    ).toBe(false);
    await finalizeStudy(balanceStudyFixtures.completed, 20, root);
    await expect(
      access(
        resolve(
          studyPaths(root).heartbeats,
          `${balanceStudyFixtures.completed.id}.json`,
        ),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
