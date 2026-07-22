import { parseVerificationRun, type VerificationRun } from './reportContract';
import { adminFixtures } from './reportFixtures';
import { balanceStudyFixtures } from './studyFixtures';
import {
  parseBalanceStudyReport,
  type BalanceStudyReport,
} from './balanceStudyContract';

export interface AdminReportSource {
  getLatestRun(): Promise<VerificationRun | null>;
  getRecentRuns(): Promise<VerificationRun[]>;
  getRun(id: string): Promise<VerificationRun>;
  getLatestStudy(): Promise<BalanceStudyReport | null>;
  getRecentStudies(): Promise<BalanceStudyReport[]>;
  getStudy(id: string): Promise<BalanceStudyReport>;
}

async function request(path: string): Promise<unknown> {
  const response = await fetch(path, {
    headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return null;
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      (value as { error?: string }).error ??
        `Report request failed (${response.status})`,
    );
  return value;
}

export const localAdminReportSource: AdminReportSource = {
  async getLatestRun() {
    const value = await request('/__fustify/admin/reports/latest');
    return value === null ? null : parseVerificationRun(value);
  },
  async getRecentRuns() {
    const value = (await request('/__fustify/admin/reports?limit=20')) as {
      reports: unknown[];
    };
    return value.reports.map(parseVerificationRun);
  },
  async getRun(id) {
    return parseVerificationRun(
      await request(`/__fustify/admin/reports/${encodeURIComponent(id)}`),
    );
  },
  async getLatestStudy() {
    const value = await request('/__fustify/admin/studies/latest');
    return value === null ? null : parseBalanceStudyReport(value);
  },
  async getRecentStudies() {
    const value = (await request('/__fustify/admin/studies?limit=20')) as {
      reports: unknown[];
    };
    return value.reports.map(parseBalanceStudyReport);
  },
  async getStudy(id) {
    return parseBalanceStudyReport(
      await request(`/__fustify/admin/studies/${encodeURIComponent(id)}`),
    );
  },
};

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
