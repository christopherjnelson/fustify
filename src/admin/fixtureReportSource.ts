// Development-only admin report source backed by static fixtures.
//
// Kept out of reportSource.ts so the production admin chunk never ships
// fixture data. main.tsx imports this module dynamically behind an
// import.meta.env.DEV guard, which Rollup eliminates in production builds.

import { adminFixtures } from './reportFixtures';
import { balanceStudyFixtures } from './studyFixtures';
import type { AdminReportSource } from './reportSource';

export function fixtureAdminReportSource(name: string): AdminReportSource {
  const createdAt = Date.now();
  const fixture = () => {
    if (name === 'reactive')
      return Date.now() - createdAt > 1_000
        ? adminFixtures.passed
        : adminFixtures.running;
    return adminFixtures[name as keyof typeof adminFixtures] ?? null;
  };
  return {
    async getLatestRun() {
      return fixture();
    },
    async getRecentRuns() {
      return Object.values(adminFixtures);
    },
    async getRun(id) {
      const found = Object.values(adminFixtures).find((run) => run.id === id);
      if (!found) throw new Error('Fixture report not found');
      return found;
    },
    async getLatestStudy() {
      if (name === 'empty') return null;
      if (name === 'study-reactive')
        return Date.now() - createdAt > 1_000
          ? balanceStudyFixtures.completed
          : {
              ...balanceStudyFixtures.running,
              updatedAt: new Date().toISOString(),
              heartbeat: balanceStudyFixtures.running.heartbeat
                ? {
                    ...balanceStudyFixtures.running.heartbeat,
                    writtenAt: new Date().toISOString(),
                  }
                : undefined,
              checkpoint: {
                ...balanceStudyFixtures.running.checkpoint,
                lastWrittenAt: new Date().toISOString(),
              },
            };
      const report =
        balanceStudyFixtures[name as keyof typeof balanceStudyFixtures] ??
        balanceStudyFixtures.completed;
      return report.status === 'running'
        ? {
            ...report,
            updatedAt: new Date().toISOString(),
            heartbeat: report.heartbeat
              ? { ...report.heartbeat, writtenAt: new Date().toISOString() }
              : undefined,
            checkpoint: {
              ...report.checkpoint,
              lastWrittenAt: new Date().toISOString(),
            },
          }
        : report;
    },
    async getRecentStudies() {
      return name === 'empty' ? [] : Object.values(balanceStudyFixtures);
    },
    async getStudy(id) {
      const found = Object.values(balanceStudyFixtures).find(
        (run) => run.id === id,
      );
      if (!found) throw new Error('Fixture study not found');
      return found;
    },
  };
}
