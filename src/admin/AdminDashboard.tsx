import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminReportSource } from './reportSource';
import type { VerificationRun } from './reportContract';
import type { BalanceStudyReport } from './balanceStudyContract';
import { classifyStudyRunner } from './studyLiveness';
import type { AdminDashboardSource } from './adminApi';
import { AdminOperations } from './AdminOperations';
import type { AdminConsoleSource } from './adminConsoleApi';
import {
  AdminConsoleNavigation,
  AdminConsolePanel,
  type AdminTab,
} from './AdminConsolePanels';

function duration(ms?: number) {
  if (ms === undefined) return '—';
  const seconds = Math.round(ms / 1000);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
function timestamp(value?: string) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(new Date(value))
    : '—';
}
function label(value: string) {
  return value
    .replaceAll('-', ' ')
    .replace(/(^| )\w/g, (text) => text.toUpperCase());
}

function BalanceStudies({
  study,
  recent,
  onSelect,
  checkedAt,
}: {
  study: BalanceStudyReport | null;
  recent: BalanceStudyReport[];
  onSelect: (id: string) => void;
  checkedAt: Date | null;
}) {
  const [playerFilter, setPlayerFilter] = useState('all');
  const configurations =
    study?.configurations.filter(
      (item) =>
        playerFilter === 'all' || item.playerCount === Number(playerFilter),
    ) ?? [];
  const warnings =
    study?.findings.filter((item) => item.classification === 'warning')
      .length ?? 0;
  const failures =
    study?.findings.filter((item) => item.classification === 'failure')
      .length ?? 0;
  const runner = study
    ? classifyStudyRunner(
        study,
        checkedAt?.getTime() ?? Date.parse(study.updatedAt),
      )
    : null;
  const runnerLabel = runner
    ? runner.state === 'heartbeat-delayed'
      ? 'Running, heartbeat delayed'
      : runner.state === 'resumable'
        ? 'Interrupted / resumable'
        : label(runner.state)
    : '';
  return (
    <section className="study-section" aria-labelledby="balance-studies">
      <div className="study-title">
        <div>
          <p className="admin-eyebrow">Unattended research</p>
          <h2 id="balance-studies">Balance Studies</h2>
        </div>
        <span>Read-only · commands run from the repository root</span>
      </div>
      <details className="study-help">
        <summary>CLI quick start and copyable commands</summary>
        <div className="command-grid">
          {[
            'pnpm study:balance --preset quick',
            'pnpm study:balance --preset standard',
            'pnpm study:balance --preset thorough',
            'pnpm study:balance --preset thorough --dry-run',
            'pnpm study:balance --preset engine-coverage',
            'pnpm study:balance --diagnose six-seat --scale smoke --dry-run',
            'pnpm study:balance --diagnose six-seat --scale standard',
            'pnpm study:balance --diagnose six-seat --scale thorough',
            'pnpm study:balance --resume <run-id>',
            "pnpm study:balance --reproduce '<descriptor>' --verbose",
          ].map((command) => (
            <input
              key={command}
              readOnly
              value={command}
              aria-label={`Copy ${command}`}
              onFocus={(event) => event.currentTarget.select()}
            />
          ))}
        </div>
      </details>
      {!study ? (
        <div className="admin-empty">
          <h3>No balance studies yet</h3>
          <p>
            Run <code>pnpm study:balance --preset quick</code> to create one.
          </p>
        </div>
      ) : (
        <>
          <article className={`study-overview status-${study.status}`}>
            <div>
              <p className="status-label" data-study-status>
                {runnerLabel}
              </p>
              <h3>{study.id}</h3>
              <p>
                {study.purpose
                  ? label(study.purpose)
                  : 'Legacy / unspecified purpose'}{' '}
                · {study.preset}
                {study.presetVersion
                  ? ` v${study.presetVersion}`
                  : ' (legacy preset)'}{' '}
                · {study.aggregate.matchesCompleted}/{study.plan.totalMatches}{' '}
                matches (
                {(
                  (study.aggregate.matchesCompleted /
                    Math.max(1, study.plan.totalMatches)) *
                  100
                ).toFixed(1)}
                %)
              </p>
            </div>
            <dl>
              <div>
                <dt>Commit</dt>
                <dd>
                  <code>{study.repository.commit.slice(0, 12)}</code>
                </dd>
              </div>
              <div>
                <dt>Throughput</dt>
                <dd>{study.aggregate.gamesPerSecond.toFixed(2)} games/s</dd>
              </div>
              <div>
                <dt>Elapsed</dt>
                <dd>{duration(study.aggregate.runtimeMs)}</dd>
              </div>
              <div>
                <dt>Estimate basis</dt>
                <dd>
                  {study.plan.estimateQuality
                    ? label(study.plan.estimateQuality)
                    : 'Legacy fixed estimate'}
                </dd>
              </div>
              <div>
                <dt>Warnings / failures</dt>
                <dd>
                  {warnings} / {failures}
                </dd>
              </div>
              <div>
                <dt>Runner heartbeat</dt>
                <dd>
                  {study.heartbeat
                    ? timestamp(study.heartbeat.writtenAt)
                    : 'Not recorded (legacy report)'}
                </dd>
              </div>
              <div>
                <dt>Heartbeat age</dt>
                <dd>{duration(runner?.heartbeatAgeMs)}</dd>
              </div>
              <div>
                <dt>Checkpoint</dt>
                <dd>{timestamp(study.checkpoint.lastWrittenAt)}</dd>
              </div>
              <div>
                <dt>Resume</dt>
                <dd>
                  {study.checkpoint.resumable
                    ? `pnpm study:balance --resume ${study.id}`
                    : 'Complete'}
                </dd>
              </div>
            </dl>
          </article>
          <div className="study-stat-grid">
            <article>
              <h3>Outcomes</h3>
              <p>
                {Object.entries(study.aggregate.outcomes)
                  .map(([key, value]) => `${label(key)} ${value}`)
                  .join(' · ')}
              </p>
            </article>
            <article>
              <h3>Match length</h3>
              <p>
                Mean {study.aggregate.turns.mean.toFixed(1)} · Median{' '}
                {study.aggregate.turns.median} · p90 {study.aggregate.turns.p90}{' '}
                · p95 {study.aggregate.turns.p95} · p99{' '}
                {study.aggregate.turns.p99} · Max{' '}
                {study.aggregate.turns.maximum}
              </p>
            </article>
          </div>
          <h3>Seat balance by player count</h3>
          {study.aggregate.playerCountSeatSummaries?.map((summary) => (
            <article
              className="player-count-study"
              key={`${summary.purpose}-${summary.playerCount}`}
            >
              <h4>
                {summary.playerCount} seats ·{' '}
                {summary.playerCount === 4
                  ? 'Recommended'
                  : summary.playerCount === 5
                    ? 'Expanded match'
                    : summary.playerCount === 6
                      ? 'Expanded/long match'
                      : label(summary.purpose)}
              </h4>
              {summary.matches !== undefined && (
                <p className="player-count-outcomes">
                  Matches {summary.matches} · Victories {summary.victories} ·
                  Unresolved matches {summary.unresolved} · Victory rate{' '}
                  {(
                    ((summary.victories ?? 0) / Math.max(1, summary.matches)) *
                    100
                  ).toFixed(1)}
                  % · Stalemate rate{' '}
                  {(
                    ((summary.stalemates ?? 0) / Math.max(1, summary.matches)) *
                    100
                  ).toFixed(1)}
                  % · Turn-cap rate{' '}
                  {(
                    ((summary.turnCaps ?? 0) / Math.max(1, summary.matches)) *
                    100
                  ).toFixed(1)}
                  %
                </p>
              )}
              {summary.playerCount >= 5 && (
                <p>Five- and six-seat matches may run substantially longer.</p>
              )}
              <div
                className="seat-table"
                role="table"
                aria-label={`${summary.playerCount}-player seat balance`}
              >
                <div role="row">
                  <strong>Seat</strong>
                  <strong>Wins</strong>
                  <strong>Win rate across all matches</strong>
                  <strong>Outcome-adjusted baseline</strong>
                  <strong>Share of decided victories</strong>
                  <strong>Equal share among winners</strong>
                </div>
                {summary.seats.map((seat) => (
                  <div role="row" key={seat.seat}>
                    <span>{seat.seat}</span>
                    <span>
                      {seat.wins}/{seat.samples}
                    </span>
                    <span>{(seat.winRate * 100).toFixed(1)}%</span>
                    <span>
                      {(
                        (seat.outcomeAdjustedBaseline ??
                          seat.equalSeatBaseline) * 100
                      ).toFixed(2)}
                      % · Δ{' '}
                      {(
                        (seat.differenceFromOutcomeAdjustedBaseline ??
                          seat.differenceFromBaseline) * 100
                      ).toFixed(1)}{' '}
                      pts · 95% CI{' '}
                      {(seat.confidenceInterval95[0] * 100).toFixed(1)}–
                      {(seat.confidenceInterval95[1] * 100).toFixed(1)}%
                    </span>
                    <span>
                      {(
                        (seat.decidedVictoryShare ?? seat.winRate) * 100
                      ).toFixed(1)}
                      % · 95% CI{' '}
                      {(
                        (seat.decidedVictoryConfidenceInterval95?.[0] ??
                          seat.confidenceInterval95[0]) * 100
                      ).toFixed(1)}
                      –
                      {(
                        (seat.decidedVictoryConfidenceInterval95?.[1] ??
                          seat.confidenceInterval95[1]) * 100
                      ).toFixed(1)}
                      %
                    </span>
                    <span>
                      {(
                        (seat.equalDecidedVictoryBaseline ??
                          seat.equalSeatBaseline) * 100
                      ).toFixed(2)}
                      % · Δ{' '}
                      {(
                        (seat.differenceFromDecidedVictoryBaseline ??
                          seat.differenceFromBaseline) * 100
                      ).toFixed(1)}{' '}
                      pts
                    </span>
                  </div>
                ))}
              </div>
            </article>
          ))}
          {study.aggregate.diagnostic && (
            <article className="diagnostic-summary">
              <h3>Six-seat diagnostic</h3>
              <p>{study.aggregate.diagnostic.rotationDesign}</p>
              <p>{study.aggregate.diagnostic.factorAssessment}</p>
              {study.aggregate.diagnostic.blockAccounting && (
                <p>
                  Complete blocks{' '}
                  {
                    study.aggregate.diagnostic.blockAccounting
                      .completeBlockCount
                  }{' '}
                  · analyzed{' '}
                  {
                    study.aggregate.diagnostic.blockAccounting
                      .matchesInCompleteBlocks
                  }{' '}
                  matches · partial remainder{' '}
                  {study.aggregate.diagnostic.blockAccounting.partialRemainder}{' '}
                  · mapping{' '}
                  {study.aggregate.diagnostic.mappingValid
                    ? 'valid'
                    : 'invalid'}
                </p>
              )}
              <p>
                Logical-player wins{' '}
                {JSON.stringify(study.aggregate.diagnostic.logicalPlayerWins)} ·
                Assignment-position wins{' '}
                {JSON.stringify(
                  study.aggregate.diagnostic.assignmentPositionWins,
                )}
              </p>
              {study.aggregate.diagnostic.startingBoardSummaries && (
                <details>
                  <summary>Starting-board and block evidence</summary>
                  <pre>
                    {JSON.stringify(
                      {
                        assignmentPosition:
                          study.aggregate.diagnostic.startingBoardSummaries
                            .assignmentPosition,
                        blocks: study.aggregate.diagnostic.blockSummaries,
                        evidence:
                          study.aggregate.diagnostic.factorAssessmentEvidence,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              )}
            </article>
          )}
          <details>
            <summary>Cross-player-count aggregate (limited)</summary>
            <div className="seat-table" role="table" aria-label="Seat balance">
              <div role="row">
                <strong>Seat</strong>
                <strong>Wins</strong>
                <strong>Rate</strong>
                <strong>95% Wilson interval</strong>
                <strong>Equal baseline Δ</strong>
              </div>
              {study.aggregate.seatSummaries.map((seat) => (
                <div role="row" key={seat.seat}>
                  <span>{seat.seat}</span>
                  <span>
                    {seat.wins}/{seat.samples}
                  </span>
                  <span>{(seat.winRate * 100).toFixed(1)}%</span>
                  <span>
                    {(seat.confidenceInterval95[0] * 100).toFixed(1)}–
                    {(seat.confidenceInterval95[1] * 100).toFixed(1)}%
                  </span>
                  <span>
                    {seat.differenceFromBaseline >= 0 ? '+' : ''}
                    {(seat.differenceFromBaseline * 100).toFixed(1)} pts vs{' '}
                    {(seat.equalSeatBaseline * 100).toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </details>
          <p className="method-note">
            Observed associations with statistical uncertainty; these figures do
            not establish causation.
          </p>
          <div className="study-filter">
            <label>
              Configuration player count{' '}
              <select
                value={playerFilter}
                onChange={(event) => setPlayerFilter(event.target.value)}
              >
                <option value="all">All</option>
                {[2, 3, 4, 5, 6].map((count) => (
                  <option value={count} key={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            className="configuration-table"
            role="table"
            aria-label="Configuration breakdown"
          >
            {configurations.map((item) => (
              <article key={item.id}>
                <h4>{item.id}</h4>
                <p>
                  {item.playerCount} players · {item.territoryCount} territories
                  · {item.continentCount} continents · {item.worldSize} ·{' '}
                  {item.purpose ? label(item.purpose) : 'Legacy purpose'}
                </p>
                <span>
                  {item.matchesCompleted}/{item.matchesRequested} complete ·
                  mean {item.meanTurns.toFixed(1)} turns · p95 {item.p95Turns}
                </span>
              </article>
            ))}
          </div>
          {!!study.findings.length && (
            <div className="findings">
              <h3>Findings</h3>
              {study.findings.map((item, index) => (
                <article
                  className={`finding-${item.classification}`}
                  key={`${item.code}-${index}`}
                >
                  <strong>
                    {label(item.classification)} · {label(item.code)}
                  </strong>
                  <p>{item.message}</p>
                  {item.configurationId && (
                    <small>Configuration: {item.configurationId}</small>
                  )}
                  {item.reproduction && (
                    <textarea
                      readOnly
                      aria-label="Study reproduction command"
                      value={item.reproduction}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  )}
                </article>
              ))}
            </div>
          )}
          {study.plan.warningThresholds && (
            <p className="method-note">
              Configuration warnings require{' '}
              {study.plan.warningThresholds.minimumSamples} samples; cap and
              stalemate rates warn at{' '}
              {(study.plan.warningThresholds.capRate * 100).toFixed(0)}%, and
              normal victories below{' '}
              {(study.plan.warningThresholds.lowVictoryRate * 100).toFixed(0)}%
              warn.
            </p>
          )}
        </>
      )}
      <h3>Recent studies</h3>
      <div className="recent-studies">
        {recent.map((item) => (
          <button type="button" key={item.id} onClick={() => onSelect(item.id)}>
            <strong>{item.id}</strong>
            <span>
              {label(item.status)} · {item.preset} ·{' '}
              {item.aggregate.matchesCompleted} matches ·{' '}
              {
                item.findings.filter(
                  (finding) => finding.classification !== 'informational',
                ).length
              }{' '}
              findings
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function AdminDashboard({
  operationsSource,
  consoleSource,
  source,
  dataAvailable = true,
  fixture = false,
}: {
  operationsSource: AdminDashboardSource;
  consoleSource?: AdminConsoleSource;
  source: AdminReportSource;
  dataAvailable?: boolean;
  fixture?: boolean;
}) {
  const [latest, setLatest] = useState<VerificationRun | null>(null);
  const [selected, setSelected] = useState<VerificationRun | null>(null);
  const [recent, setRecent] = useState<VerificationRun[]>([]);
  const [viewingLatest, setViewingLatest] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [loading, setLoading] = useState(dataAvailable);
  const [study, setStudy] = useState<BalanceStudyReport | null>(null);
  const [recentStudies, setRecentStudies] = useState<BalanceStudyReport[]>([]);
  const [operationsRefreshToken, setOperationsRefreshToken] = useState(0);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const fetching = useRef(false);
  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const [nextLatest, nextRecent, nextStudy, nextStudies] =
        await Promise.all([
          source.getLatestRun(),
          source.getRecentRuns(),
          source.getLatestStudy(),
          source.getRecentStudies(),
        ]);
      setLatest(nextLatest);
      setRecent(nextRecent);
      setStudy(nextStudy);
      setRecentStudies(nextStudies);
      if (viewingLatest) setSelected(nextLatest);
      setLastFetch(new Date());
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, [source, viewingLatest]);
  useEffect(() => {
    if (dataAvailable) queueMicrotask(() => void refresh());
  }, [dataAvailable, refresh]);
  useEffect(() => {
    if (!dataAvailable) return;
    const timer = window.setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        (latest?.status === 'running' ||
          study?.status === 'running' ||
          (!latest && !study))
      )
        void refresh();
    }, 1500);
    const visible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [dataAvailable, latest, study, refresh]);
  const run = selected;
  const stale =
    run?.status === 'running' &&
    lastFetch !== null &&
    lastFetch.getTime() - Date.parse(run.updatedAt) > 30_000;
  const elapsed = useMemo(
    () =>
      run
        ? Date.parse(run.completedAt ?? run.updatedAt) -
          Date.parse(run.startedAt)
        : 0,
    [run],
  );
  const refreshDashboard = () => {
    setOperationsRefreshToken((token) => token + 1);
    if (dataAvailable) void refresh();
  };

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">Fustify administration</p>
          <h1>Admin Dashboard</h1>
          <p>
            Restricted operational overview and read-only developer diagnostics.
          </p>
        </div>
        <div className="admin-actions">
          {dataAvailable && (
            <span>
              {lastFetch
                ? `Reports fetched ${timestamp(lastFetch.toISOString())}`
                : 'Reports not fetched yet'}
            </span>
          )}
          <button type="button" onClick={refreshDashboard}>
            Refresh dashboard
          </button>
        </div>
      </header>
      {consoleSource && (
        <>
          <AdminConsoleNavigation
            activeTab={activeTab}
            onChange={setActiveTab}
          />
          <AdminConsolePanel activeTab={activeTab} source={consoleSource} />
        </>
      )}
      {(!consoleSource || activeTab === 'overview') && (
        <AdminOperations
          source={operationsSource}
          fixture={fixture}
          refreshToken={operationsRefreshToken}
        />
      )}
      {!dataAvailable && (
        <section className="admin-notice" aria-labelledby="unavailable">
          <h2 id="unavailable">Developer diagnostics unavailable</h2>
          <p>
            Verification and balance-study reports are development-only. The
            operational data above remains available through authorized Supabase
            RPCs.
          </p>
        </section>
      )}
      {dataAvailable &&
        (!consoleSource ||
          activeTab === 'verification' ||
          activeTab === 'balance') && (
          <div className="admin-diagnostics">
            <div className="admin-section-heading">
              <div>
                <p className="admin-eyebrow">Developer diagnostics</p>
                <h2>Verification and balance studies</h2>
                <p>
                  Existing local reports remain isolated from production
                  operational data.
                </p>
              </div>
            </div>
            {error && (
              <div className="admin-error" role="alert">
                Refresh failed: {error}. The last valid report remains
                displayed.
              </div>
            )}
            <BalanceStudies
              study={study}
              recent={recentStudies}
              onSelect={(id) =>
                void source
                  .getStudy(id)
                  .then(setStudy)
                  .catch((reason) =>
                    setError(
                      reason instanceof Error ? reason.message : String(reason),
                    ),
                  )
              }
              checkedAt={lastFetch}
            />
            {loading && !run && (
              <p className="admin-empty" aria-live="polite">
                Loading verification reports…
              </p>
            )}
            {!loading && !run && (
              <section className="admin-empty">
                <h2>No report available</h2>
                <p>
                  Run <code>pnpm verify:report</code> to create the first local
                  report.
                </p>
              </section>
            )}
            {run && (
              <>
                <section
                  className={`admin-current status-${run.status}`}
                  aria-labelledby="current-run"
                >
                  <div>
                    <p
                      className="status-label"
                      role="status"
                      aria-live="polite"
                    >
                      {stale ? 'Stale / incomplete' : label(run.status)}
                    </p>
                    <h2 id="current-run">
                      {viewingLatest ? 'Current run' : 'Historical run'}
                    </h2>
                    <p>
                      {run.profile} profile · {run.totals.completed} of{' '}
                      {run.totals.suites} suites complete · {duration(elapsed)}
                    </p>
                  </div>
                  <dl className="run-metadata">
                    <div>
                      <dt>Branch</dt>
                      <dd>{run.repository.branch}</dd>
                    </div>
                    <div>
                      <dt>Commit</dt>
                      <dd>
                        <code>{run.repository.shortCommit}</code>{' '}
                        {run.repository.commitSubject}
                      </dd>
                    </div>
                    <div>
                      <dt>Worktree</dt>
                      <dd>
                        {(run.repository.worktreeCleanAtEnd ??
                        run.repository.worktreeCleanAtStart)
                          ? 'Clean'
                          : 'Dirty'}{' '}
                        at {run.completedAt ? 'completion' : 'start'}
                      </dd>
                    </div>
                    <div>
                      <dt>Started</dt>
                      <dd>{timestamp(run.startedAt)}</dd>
                    </div>
                    <div>
                      <dt>Completed</dt>
                      <dd>{timestamp(run.completedAt)}</dd>
                    </div>
                    <div>
                      <dt>Updated</dt>
                      <dd>{timestamp(run.updatedAt)}</dd>
                    </div>
                  </dl>
                  {stale && (
                    <p className="stale-warning">
                      This running report has not updated for over 30 seconds
                      and may have been abandoned.
                    </p>
                  )}
                </section>
                <section aria-labelledby="suites">
                  <h2 id="suites">Suites</h2>
                  <div className="suite-grid">
                    {run.suites.map((suite) => (
                      <article
                        className={`suite-card status-${suite.status}`}
                        key={suite.id}
                      >
                        <header>
                          <h3>{suite.displayName}</h3>
                          <span>{label(suite.status)}</span>
                        </header>
                        <p>{suite.summary ?? 'Awaiting execution.'}</p>
                        <dl>
                          <div>
                            <dt>Duration</dt>
                            <dd>{duration(suite.durationMs)}</dd>
                          </div>
                          {suite.counts?.total !== undefined && (
                            <div>
                              <dt>Results</dt>
                              <dd>
                                {suite.counts.passed ?? 0} passed /{' '}
                                {suite.counts.total} total
                              </dd>
                            </div>
                          )}
                        </dl>
                        <code className="suite-command">{suite.command}</code>
                        {suite.failureExcerpt && (
                          <details>
                            <summary>Failure details</summary>
                            <pre>{suite.failureExcerpt}</pre>
                          </details>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
                {run.coverage && (
                  <section aria-labelledby="coverage">
                    <h2 id="coverage">Coverage</h2>
                    <div className="coverage-grid">
                      {Object.entries(run.coverage).map(([name, metric]) => (
                        <article key={name}>
                          <h3>{label(name)}</h3>
                          <strong>{metric.percent.toFixed(2)}%</strong>
                          <span>
                            {metric.covered} / {metric.total}
                          </span>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
                {!!run.simulations?.length && (
                  <section aria-labelledby="simulations">
                    <h2 id="simulations">Simulations</h2>
                    <div className="simulation-grid">
                      {run.simulations.map((simulation) => (
                        <article key={simulation.label}>
                          <h3>{simulation.label}</h3>
                          <p>
                            {simulation.passed ? 'Passed' : 'Failed'} ·{' '}
                            {simulation.gamesCompleted ??
                              simulation.configurations ??
                              '—'}{' '}
                            completed
                          </p>
                          <dl>
                            <div>
                              <dt>Outcomes</dt>
                              <dd>
                                {simulation.outcomes
                                  ? Object.entries(simulation.outcomes)
                                      .map(
                                        ([key, value]) =>
                                          `${label(key)} ${value}`,
                                      )
                                      .join(' · ')
                                  : '—'}
                              </dd>
                            </div>
                            <div>
                              <dt>Turns</dt>
                              <dd>
                                Mean {simulation.meanTurns ?? '—'} · Median{' '}
                                {simulation.medianTurns ?? '—'} · p95{' '}
                                {simulation.p95Turns ?? '—'} · p99{' '}
                                {simulation.p99Turns ?? '—'}
                              </dd>
                            </div>
                            <div>
                              <dt>Integrity</dt>
                              <dd>
                                {simulation.invariantFailures ?? '—'} invariant
                                failures · {simulation.engineErrors ?? '—'}{' '}
                                engine errors
                              </dd>
                            </div>
                            <div>
                              <dt>Throughput</dt>
                              <dd>
                                {simulation.gamesPerSecond?.toFixed(2) ?? '—'}{' '}
                                games/s
                              </dd>
                            </div>
                          </dl>
                          {simulation.winDistribution && (
                            <div className="win-bars">
                              {Object.entries(simulation.winDistribution).map(
                                ([player, ratio]) => (
                                  <div key={player}>
                                    <span>
                                      {player} {(ratio * 100).toFixed(1)}%
                                    </span>
                                    <i
                                      style={{
                                        width: `${Math.min(100, ratio * 100)}%`,
                                      }}
                                    />
                                  </div>
                                ),
                              )}
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>
                )}
                {!!run.failures.length && (
                  <section aria-labelledby="failures">
                    <h2 id="failures">Failures and reproduction</h2>
                    {run.failures.map((failure, index) => (
                      <article
                        className="failure-card"
                        key={`${failure.suiteId}-${index}`}
                      >
                        <h3>
                          {failure.suiteId}: {failure.message}
                        </h3>
                        {failure.excerpt && <pre>{failure.excerpt}</pre>}
                        {failure.reproduction && (
                          <>
                            <dl>
                              <div>
                                <dt>Seed</dt>
                                <dd>{failure.reproduction.seed ?? '—'}</dd>
                              </div>
                              <div>
                                <dt>Trace</dt>
                                <dd>{failure.reproduction.traceRef ?? '—'}</dd>
                              </div>
                            </dl>
                            <label>
                              Reproduction command
                              <textarea
                                readOnly
                                value={failure.reproduction.command}
                                onFocus={(event) =>
                                  event.currentTarget.select()
                                }
                              />
                            </label>
                          </>
                        )}
                      </article>
                    ))}
                  </section>
                )}
              </>
            )}
            <section aria-labelledby="recent">
              <h2 id="recent">Recent runs</h2>
              {recent.length ? (
                <div className="recent-list">
                  {recent.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      aria-pressed={!viewingLatest && selected?.id === item.id}
                      onClick={async () => {
                        const next = await source.getRun(item.id);
                        setViewingLatest(false);
                        setSelected(next);
                      }}
                    >
                      <strong>{label(item.status)}</strong>
                      <span>{timestamp(item.startedAt)}</span>
                      <span>
                        {item.profile} · {item.repository.branch} ·{' '}
                        {item.repository.shortCommit}
                      </span>
                      <span>
                        {duration(item.totals.durationMs)} ·{' '}
                        {item.totals.failed} failed
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p>No retained history.</p>
              )}
              {!viewingLatest && (
                <button
                  type="button"
                  className="latest-button"
                  onClick={() => {
                    setViewingLatest(true);
                    setSelected(latest);
                  }}
                >
                  Return to Latest
                </button>
              )}
            </section>
          </div>
        )}
    </main>
  );
}
