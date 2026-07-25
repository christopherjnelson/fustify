import { parseVerificationRun, type VerificationRun } from './reportContract';
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
