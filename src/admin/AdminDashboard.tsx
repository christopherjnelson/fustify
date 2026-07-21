import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminReportSource } from './reportSource';
import type { VerificationRun } from './reportContract';

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

export function AdminDashboard({
  source,
  dataAvailable = true,
}: {
  source: AdminReportSource;
  dataAvailable?: boolean;
}) {
  const [latest, setLatest] = useState<VerificationRun | null>(null);
  const [selected, setSelected] = useState<VerificationRun | null>(null);
  const [recent, setRecent] = useState<VerificationRun[]>([]);
  const [viewingLatest, setViewingLatest] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [loading, setLoading] = useState(dataAvailable);
  const fetching = useRef(false);
  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const [nextLatest, nextRecent] = await Promise.all([
        source.getLatestRun(),
        source.getRecentRuns(),
      ]);
      setLatest(nextLatest);
      setRecent(nextRecent);
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
        (latest?.status === 'running' || !latest)
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
  }, [dataAvailable, latest, refresh]);
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

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">Fustify developer tools</p>
          <h1>Verification Dashboard</h1>
          <p>Read-only local verification reports</p>
        </div>
        <div className="admin-actions">
          <span>
            {lastFetch
              ? `Fetched ${timestamp(lastFetch.toISOString())}`
              : 'Not fetched yet'}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            aria-label="Refresh verification reports"
          >
            Refresh
          </button>
        </div>
      </header>
      {!dataAvailable && (
        <section className="admin-notice" aria-labelledby="unavailable">
          <h2 id="unavailable">Local reports unavailable</h2>
          <p>
            The report API is development-only. Run <code>pnpm dev</code> and
            open <code>/admin</code>.
          </p>
        </section>
      )}
      {error && (
        <div className="admin-error" role="alert">
          Refresh failed: {error}. The last valid report remains displayed.
        </div>
      )}
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
              <p className="status-label" role="status" aria-live="polite">
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
                This running report has not updated for over 30 seconds and may
                have been abandoned.
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
                                .map(([key, value]) => `${label(key)} ${value}`)
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
                          failures · {simulation.engineErrors ?? '—'} engine
                          errors
                        </dd>
                      </div>
                      <div>
                        <dt>Throughput</dt>
                        <dd>
                          {simulation.gamesPerSecond?.toFixed(2) ?? '—'} games/s
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
                          onFocus={(event) => event.currentTarget.select()}
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
                  {duration(item.totals.durationMs)} · {item.totals.failed}{' '}
                  failed
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
    </main>
  );
}
