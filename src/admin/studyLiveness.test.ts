import { describe, expect, it } from 'vitest';
import { balanceStudyFixtures } from './studyFixtures';
import { classifyStudyRunner } from './studyLiveness';

describe('study runner liveness', () => {
  const now = Date.parse('2026-07-21T12:03:00.000Z');
  const running = (ageMs: number) => ({
    ...structuredClone(balanceStudyFixtures.running),
    heartbeat: {
      runId: balanceStudyFixtures.running.id,
      processId: 123,
      writtenAt: new Date(now - ageMs).toISOString(),
      commandCount: 400,
      matchIndex: 2,
    },
  });

  it('tolerates browser polls and marks only several missed windows resumable', () => {
    expect(classifyStudyRunner(running(19_999), now).state).toBe('running');
    expect(classifyStudyRunner(running(20_000), now).state).toBe(
      'heartbeat-delayed',
    );
    expect(classifyStudyRunner(running(59_999), now).state).toBe(
      'heartbeat-delayed',
    );
    expect(classifyStudyRunner(running(60_000), now).state).toBe('resumable');
  });

  it('lets terminal report state override heartbeat data', () => {
    expect(
      classifyStudyRunner({ ...running(90_000), status: 'completed' }, now)
        .state,
    ).toBe('completed');
    expect(
      classifyStudyRunner({ ...running(1), status: 'failed' }, now).state,
    ).toBe('failed');
  });

  it('keeps historical reports without heartbeat readable', () => {
    const legacy = structuredClone(balanceStudyFixtures.running);
    expect(
      classifyStudyRunner(legacy, Date.parse(legacy.updatedAt) + 1).state,
    ).toBe('running');
  });
});
