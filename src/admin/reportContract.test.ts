import { describe, expect, it } from 'vitest';
import { adminFixtures } from './reportFixtures';
import {
  isSafeRunId,
  parseVerificationRun,
  summarizeRun,
} from './reportContract';

describe('verification report contract', () => {
  it('accepts running and completed reports with optional fields omitted', () => {
    expect(parseVerificationRun(adminFixtures.running).status).toBe('running');
    const minimal = structuredClone(adminFixtures.passed);
    delete minimal.coverage;
    delete minimal.simulations;
    delete minimal.repository.commitSubject;
    expect(parseVerificationRun(minimal).status).toBe('passed');
  });
  it('allows forward-compatible unknown fields', () =>
    expect(
      parseVerificationRun({ ...adminFixtures.passed, futureField: true })
        .status,
    ).toBe('passed'));
  it('rejects unsupported versions and statuses', () => {
    expect(() =>
      parseVerificationRun({ ...adminFixtures.passed, schemaVersion: 2 }),
    ).toThrow();
    expect(() =>
      parseVerificationRun({
        ...adminFixtures.passed,
        suites: [{ ...adminFixtures.passed.suites[0], status: 'maybe' }],
      }),
    ).toThrow();
  });
  it('aggregates suite totals without treating pending work as complete', () => {
    const totals = summarizeRun(adminFixtures.running);
    expect(totals.completed).toBe(1);
    expect(totals.passed).toBe(1);
  });
  it('accepts only filesystem-safe bounded run IDs', () => {
    expect(isSafeRunId('2026-07-20T14-00-00-abc_123')).toBe(true);
    expect(isSafeRunId('../secret')).toBe(false);
    expect(isSafeRunId('a/b')).toBe(false);
  });
  it('classifies corrupt JSON as a parse failure', () =>
    expect(() => JSON.parse('{broken')).toThrow());
});
