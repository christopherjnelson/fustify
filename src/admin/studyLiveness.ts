import type { BalanceStudyReport } from './balanceStudyContract';
export const STUDY_HEARTBEAT_INTERVAL_MS = 5_000;
export const STUDY_HEARTBEAT_DELAYED_MS = 20_000;
export const STUDY_HEARTBEAT_STALE_MS = 60_000;

export type StudyRunnerState =
  | 'running'
  | 'heartbeat-delayed'
  | 'resumable'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'planning';

export function classifyStudyRunner(
  study: BalanceStudyReport,
  checkedAt: number,
): { state: StudyRunnerState; heartbeatAgeMs?: number } {
  if (study.status !== 'running') return { state: study.status };
  const heartbeatAt = study.heartbeat?.writtenAt;
  // Historical active reports retain the former updatedAt fallback.
  const age = Math.max(
    0,
    checkedAt - Date.parse(heartbeatAt ?? study.updatedAt),
  );
  if (age >= STUDY_HEARTBEAT_STALE_MS)
    return { state: 'resumable', heartbeatAgeMs: age };
  if (age >= STUDY_HEARTBEAT_DELAYED_MS)
    return { state: 'heartbeat-delayed', heartbeatAgeMs: age };
  return { state: 'running', heartbeatAgeMs: age };
}
