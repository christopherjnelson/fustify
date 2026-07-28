import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import type {
  AdminAccount,
  AdminAuditEntry,
  AdminConsoleSource,
  AdminHealth,
  AdminLogEntry,
  AdminRoom,
} from './adminConsoleApi';
import { accountMutationActions } from './adminAccountActions';
import type { AdminTab } from './adminConsoleNavigation';

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 ** 2).toFixed(1)} MiB`;
}

function formatTime(value: string | number | null) {
  if (value === null) return '—';
  const date =
    typeof value === 'number' ? new Date(value / 1000) : new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function State({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: string | null;
  children: ReactNode;
}) {
  if (loading)
    return <div className="admin-state-card">Loading authorized data…</div>;
  if (error)
    return (
      <div className="admin-error" role="alert">
        {error}
      </div>
    );
  return children;
}

function AdminModal({
  labelledBy,
  onClose,
  returnFocus,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  returnFocus?: HTMLElement;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current
      ?.querySelector<HTMLElement>(
        '[autofocus], input, textarea, select, button',
      )
      ?.focus();
    return () => {
      returnFocus?.focus();
    };
  }, [returnFocus]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ];
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="admin-modal-backdrop">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="admin-modal"
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </div>
  );
}

function useLoad<T>(load: () => Promise<T>, refreshToken = 0) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) setLoading(true);
    });
    void load()
      .then((next) => {
        if (active) {
          setData(next);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load, refreshToken]);
  return { data, loading, error };
}

function HealthMetrics({ health }: { health: AdminHealth }) {
  const metrics: Array<[string, string, string]> = [
    ['Database size', formatBytes(health.database_bytes), 'Postgres data'],
    [
      'Connections',
      formatNumber(health.database_connections),
      'Current database sessions',
    ],
    [
      'Registered accounts',
      formatNumber(health.registered_accounts),
      `${formatNumber(health.anonymous_accounts)} anonymous`,
    ],
    [
      'Banned accounts',
      formatNumber(health.banned_accounts),
      'Currently blocked',
    ],
    [
      'Cleanup candidates',
      formatNumber(health.cleanup_candidates),
      'Closed, empty, matchless, 30+ days',
    ],
    [
      'Stuck launches',
      formatNumber(health.stuck_launches),
      'Older than five minutes',
    ],
    [
      'Announcements',
      formatNumber(health.announcement_attention),
      'Pending, processing, or failed',
    ],
    [
      'Thumbnails',
      formatNumber(health.thumbnail_objects),
      `${formatBytes(health.thumbnail_bytes)} · ${health.orphan_thumbnails} orphaned`,
    ],
    ['Cron failures', formatNumber(health.cron_failures_24h), 'Last 24 hours'],
    [
      'Data consistency',
      formatNumber(
        health.inconsistent_rooms +
          health.missing_profiles +
          health.incomplete_matches,
      ),
      `${health.inconsistent_rooms} rooms · ${health.missing_profiles} profiles · ${health.incomplete_matches} matches`,
    ],
    [
      'Cache / index hits',
      `${(health.cache_hit_ratio * 100).toFixed(1)}%`,
      `${(health.index_hit_ratio * 100).toFixed(1)}% index hit ratio`,
    ],
    [
      'Migration',
      health.migration_drift ? 'Drift' : 'Current',
      `${health.latest_migration ?? 'none'} / ${health.expected_migration}`,
    ],
    [
      'Account growth',
      formatNumber(health.trends.accounts_30d ?? 0),
      `${formatNumber(health.trends.accounts_24h ?? 0)} in 24 hours`,
    ],
    [
      'Command volume',
      formatNumber(health.trends.commands_24h ?? 0),
      'Last 24 hours',
    ],
    [
      'Room lifecycle',
      formatNumber(health.trends.rooms_24h ?? 0),
      `${formatNumber(health.trends.matches_completed_30d ?? 0)} matches completed in 30 days`,
    ],
  ];
  return (
    <div className="admin-metric-grid">
      {metrics.map(([label, value, detail]) => (
        <article className="admin-metric" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          <p>{detail}</p>
        </article>
      ))}
    </div>
  );
}

function Overview({ source }: { source: AdminConsoleSource }) {
  const load = useCallback(() => source.overview(), [source]);
  const state = useLoad(load);
  const loadMetrics = useCallback(() => source.metrics(), [source]);
  const metrics = useLoad(loadMetrics);
  return (
    <section className="admin-operations" aria-labelledby="admin-health">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">Supabase health</p>
          <h2 id="admin-health">Operational health</h2>
          <p>Server-authorized database, account, cleanup, and job signals.</p>
        </div>
      </div>
      <State loading={state.loading} error={state.error}>
        {state.data && <HealthMetrics health={state.data.health} />}
      </State>
      <h3>Supabase Metrics API</h3>
      <State loading={metrics.loading} error={metrics.error}>
        <div className="admin-metric-list">
          {metrics.data &&
            Object.entries(metrics.data.aggregates)
              .slice(0, 24)
              .map(([name, value]) => (
                <div key={name}>
                  <code>{name}</code>
                  <strong>{formatNumber(value)}</strong>
                </div>
              ))}
        </div>
      </State>
    </section>
  );
}

type AccountDialog = {
  account: AdminAccount;
  action: 'ban' | 'unban' | 'revoke' | 'soft-delete';
  returnFocus: HTMLButtonElement;
} | null;

function Accounts({ source }: { source: AdminConsoleSource }) {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [provider, setProvider] = useState('');
  const [confirmationFilter, setConfirmationFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [revealed, setRevealed] = useState<Record<string, unknown> | null>(
    null,
  );
  const [dialog, setDialog] = useState<AccountDialog>(null);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [duration, setDuration] = useState('24h');
  const [actionError, setActionError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      source.accounts({
        search: appliedSearch,
        status,
        provider,
        confirmation: confirmationFilter,
        page,
      }),
    [appliedSearch, confirmationFilter, page, provider, source, status],
  );
  const state = useLoad(load, refresh);

  async function submitAction() {
    if (!dialog) return;
    try {
      await source.accountAction(dialog.account.accountRef, {
        action: dialog.action,
        reason,
        confirmation:
          dialog.action === 'soft-delete' ? confirmation : undefined,
        duration: dialog.action === 'ban' ? duration : undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      setDialog(null);
      setReason('');
      setConfirmation('');
      setActionError(null);
      setRefresh((value) => value + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }
  async function revealAccount(accountRef: string) {
    try {
      setRevealed(await source.revealAccount(accountRef));
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }
  const deletionConfirmed =
    dialog?.action !== 'soft-delete' ||
    (typeof revealed?.userId === 'string' &&
      confirmation === revealed.userId) ||
    (typeof revealed?.email === 'string' && confirmation === revealed.email);

  return (
    <section className="admin-operations" aria-labelledby="admin-accounts">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">Auth and profiles</p>
          <h2 id="admin-accounts">Accounts</h2>
          <p>Identifiers remain masked until explicitly revealed.</p>
        </div>
        <form
          className="admin-filter"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(search);
            setPage(1);
          }}
        >
          <label>
            Search accounts
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              {[
                'all',
                'active',
                'banned',
                'anonymous',
                'admin',
                'revoked',
                'deleted',
              ].map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Provider
            <input
              value={provider}
              placeholder="email, google…"
              onChange={(event) => {
                setProvider(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            Confirmation
            <select
              value={confirmationFilter}
              onChange={(event) => {
                setConfirmationFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">all</option>
              <option value="confirmed">confirmed</option>
              <option value="unconfirmed">unconfirmed</option>
            </select>
          </label>
          <button type="submit">Search</button>
        </form>
      </div>
      <State loading={state.loading} error={state.error}>
        <div className="admin-data-table" role="table" aria-label="Accounts">
          <div role="row" className="admin-data-header">
            <strong>Account</strong>
            <strong>Status</strong>
            <strong>Activity</strong>
            <strong>Actions</strong>
          </div>
          {state.data?.accounts.map((account) => (
            <div role="row" key={account.accountRef}>
              <span>
                <strong>{account.displayName}</strong>
                <small>
                  {account.maskedEmail ?? 'No email'} ·{' '}
                  {account.providers.join(', ')}
                </small>
                <small>Auth ID {account.maskedUserId}</small>
              </span>
              <span className={`admin-status status-${account.status}`}>
                {account.status}
              </span>
              <span>
                {account.hostedRooms} hosted · {account.roomMemberships}{' '}
                memberships
                <small>
                  {account.matchesPlayed} matches · {account.gameplayCommands}{' '}
                  commands
                </small>
                <small>Last sign-in {formatTime(account.lastSignInAt)}</small>
              </span>
              <span className="admin-row-actions">
                <button
                  type="button"
                  onClick={() => void revealAccount(account.accountRef)}
                >
                  Reveal
                </button>
                {accountMutationActions(account.status).length === 0 ? (
                  <small>Protected account</small>
                ) : (
                  <>
                    {accountMutationActions(account.status).includes(
                      'unban',
                    ) ? (
                      <button
                        type="button"
                        onClick={(event) =>
                          setDialog({
                            account,
                            action: 'unban',
                            returnFocus: event.currentTarget,
                          })
                        }
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(event) =>
                          setDialog({
                            account,
                            action: 'ban',
                            returnFocus: event.currentTarget,
                          })
                        }
                      >
                        Ban
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(event) =>
                        setDialog({
                          account,
                          action: 'revoke',
                          returnFocus: event.currentTarget,
                        })
                      }
                    >
                      Revoke
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={(event) =>
                        setDialog({
                          account,
                          action: 'soft-delete',
                          returnFocus: event.currentTarget,
                        })
                      }
                    >
                      Delete
                    </button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="admin-pagination" aria-label="Account pages">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <span>Page {page}</span>
          <button
            type="button"
            disabled={!state.data?.hasMore}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </div>
      </State>
      {actionError && !dialog && (
        <p className="admin-error" role="alert">
          {actionError}
        </p>
      )}
      {revealed && (
        <div className="admin-disclosure" role="status">
          <strong>Revealed account identifiers</strong>
          <pre>{JSON.stringify(revealed, null, 2)}</pre>
          <button type="button" onClick={() => setRevealed(null)}>
            Hide
          </button>
        </div>
      )}
      {dialog && (
        <AdminModal
          labelledBy="account-action-title"
          onClose={() => setDialog(null)}
          returnFocus={dialog.returnFocus}
        >
          <h3 id="account-action-title">
            {dialog.action.replace('-', ' ')} {dialog.account.displayName}
          </h3>
          <label>
            Required reason
            <textarea
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {dialog.action === 'ban' && (
            <label>
              Duration
              <select
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              >
                <option value="24h">24 hours</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
                <option value="indefinite">Indefinite</option>
              </select>
            </label>
          )}
          {dialog.action === 'soft-delete' && (
            <label>
              Type the account’s full email or UUID
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          )}
          {actionError && (
            <p className="admin-error" role="alert">
              {actionError}
            </p>
          )}
          <div className="admin-row-actions">
            <button type="button" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="danger"
              disabled={reason.trim().length < 3 || !deletionConfirmed}
              onClick={() => void submitAction()}
            >
              Confirm
            </button>
          </div>
        </AdminModal>
      )}
    </section>
  );
}

function Rooms({ source }: { source: AdminConsoleSource }) {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [dialog, setDialog] = useState<{
    room: AdminRoom;
    action: 'close' | 'force-close' | 'purge';
    returnFocus: HTMLButtonElement;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const load = useCallback(
    () => source.rooms({ search: appliedSearch, status, page }),
    [appliedSearch, page, source, status],
  );
  const state = useLoad(load, refresh);

  async function submit() {
    if (!dialog) return;
    try {
      await source.roomAction(dialog.room.id, {
        action: dialog.action,
        reason,
        confirmation: dialog.action === 'close' ? undefined : confirmation,
        idempotencyKey: crypto.randomUUID(),
      });
      setDialog(null);
      setReason('');
      setConfirmation('');
      setActionError(null);
      setRefresh((value) => value + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }
  const roomConfirmed =
    dialog?.action === 'close' || confirmation === dialog?.room.name;

  return (
    <section className="admin-operations" aria-labelledby="admin-rooms">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">Lifecycle</p>
          <h2 id="admin-rooms">Rooms</h2>
          <p>Match history is never eligible for routine purge.</p>
        </div>
        <form
          className="admin-filter"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(search);
            setPage(1);
          }}
        >
          <label>
            Search rooms
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              {['all', 'waiting', 'active', 'closed'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <button type="submit">Search</button>
        </form>
      </div>
      <State loading={state.loading} error={state.error}>
        <div className="admin-data-table" role="table" aria-label="Rooms">
          <div role="row" className="admin-data-header">
            <strong>Room</strong>
            <strong>Occupancy</strong>
            <strong>State</strong>
            <strong>Actions</strong>
          </div>
          {state.data?.rooms.map((room) => (
            <div role="row" key={room.id}>
              <span>
                <strong>{room.name}</strong>
                <small>
                  {room.visibility} · {room.hostDisplayName}
                </small>
              </span>
              <span>
                {room.members} members · {room.claimedSeats}/{room.max_seats}{' '}
                seats<small>Active {formatTime(room.lastActivityAt)}</small>
              </span>
              <span>
                {room.status}
                <small>
                  {room.match
                    ? `Match ${room.match.status} r${room.match.revision}`
                    : 'No match'}{' '}
                  · thumbnail {room.thumbnail_path ? 'yes' : 'no'}
                </small>
              </span>
              <span className="admin-row-actions">
                {room.status === 'waiting' && (
                  <button
                    type="button"
                    onClick={(event) =>
                      setDialog({
                        room,
                        action: 'close',
                        returnFocus: event.currentTarget,
                      })
                    }
                  >
                    Close
                  </button>
                )}
                {room.status === 'active' && (
                  <button
                    type="button"
                    className="danger"
                    onClick={(event) =>
                      setDialog({
                        room,
                        action: 'force-close',
                        returnFocus: event.currentTarget,
                      })
                    }
                  >
                    Force close
                  </button>
                )}
                {room.purgeable && (
                  <button
                    type="button"
                    className="danger"
                    onClick={(event) =>
                      setDialog({
                        room,
                        action: 'purge',
                        returnFocus: event.currentTarget,
                      })
                    }
                  >
                    Purge
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="admin-pagination" aria-label="Room pages">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <span>Page {page}</span>
          <button
            type="button"
            disabled={!state.data?.hasMore}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </div>
      </State>
      {dialog && (
        <AdminModal
          labelledBy="room-action-title"
          onClose={() => setDialog(null)}
          returnFocus={dialog.returnFocus}
        >
          <h3 id="room-action-title">
            {dialog.action.replace('-', ' ')} {dialog.room.name}
          </h3>
          <label>
            Required reason
            <textarea
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {dialog.action !== 'close' && (
            <label>
              Type the room name
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          )}
          {actionError && (
            <p className="admin-error" role="alert">
              {actionError}
            </p>
          )}
          <div className="admin-row-actions">
            <button type="button" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="danger"
              disabled={reason.trim().length < 3 || !roomConfirmed}
              onClick={() => void submit()}
            >
              Confirm
            </button>
          </div>
        </AdminModal>
      )}
    </section>
  );
}

function Logs({ source }: { source: AdminConsoleSource }) {
  const [service, setService] = useState('all');
  const [windowValue, setWindowValue] = useState('1h');
  const [refresh, setRefresh] = useState(0);
  const load = useCallback(
    () => source.logs(service, windowValue),
    [service, source, windowValue],
  );
  const state = useLoad(load, refresh);
  return (
    <section className="admin-operations" aria-labelledby="admin-logs">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">Curated and redacted</p>
          <h2 id="admin-logs">Supabase logs</h2>
          <p>Warnings and errors only; raw payloads remain in Supabase.</p>
        </div>
        <div className="admin-filter">
          <label>
            Service
            <select
              value={service}
              onChange={(event) => setService(event.target.value)}
            >
              {[
                'all',
                'auth',
                'api',
                'postgres',
                'edge-function',
                'realtime',
                'storage',
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Window
            <select
              value={windowValue}
              onChange={(event) => setWindowValue(event.target.value)}
            >
              {['15m', '1h', '3h', '24h'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Refresh logs
          </button>
        </div>
      </div>
      <State loading={state.loading} error={state.error}>
        {!state.data?.configured ? (
          <div className="admin-notice">
            <h3>Log access not configured</h3>
            <p>Add the server-only analytics token to enable this feed.</p>
          </div>
        ) : (
          <>
            {state.data.explorerUrl && (
              <p>
                <a
                  href={state.data.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Supabase Logs Explorer
                </a>
              </p>
            )}
            <ul className="admin-log-list">
              {state.data.entries.map((entry: AdminLogEntry, index) => (
                <li key={`${entry.requestId ?? index}:${entry.timestamp}`}>
                  <div>
                    <strong>{entry.service}</strong>
                    <span>
                      {String(entry.severity)}{' '}
                      {entry.status ? `· ${entry.status}` : ''}
                    </span>
                    <time>{formatTime(entry.timestamp)}</time>
                  </div>
                  <p>{entry.message}</p>
                  {entry.path && <code>{entry.path}</code>}
                </li>
              ))}
            </ul>
          </>
        )}
      </State>
    </section>
  );
}

function Maintenance({ source }: { source: AdminConsoleSource }) {
  const [refresh, setRefresh] = useState(0);
  const [retry, setRetry] = useState<{
    id: string;
    returnFocus: HTMLButtonElement;
  } | null>(null);
  const [cleanup, setCleanup] = useState<{
    returnFocus: HTMLButtonElement;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const load = useCallback(() => source.maintenance(), [source]);
  const state = useLoad(load, refresh);

  async function retryAnnouncement() {
    if (!retry) return;
    try {
      await source.maintenanceAction({
        action: 'retry-announcement',
        announcementId: retry.id,
        reason,
        confirmation,
        idempotencyKey: crypto.randomUUID(),
      });
      setRetry(null);
      setReason('');
      setConfirmation('');
      setActionError(null);
      setRefresh((value) => value + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  async function cleanupThumbnails() {
    try {
      await source.maintenanceAction({
        action: 'purge-orphan-thumbnails',
        reason,
        confirmation,
        idempotencyKey: crypto.randomUUID(),
      });
      setCleanup(null);
      setReason('');
      setConfirmation('');
      setActionError(null);
      setRefresh((value) => value + 1);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="admin-operations" aria-labelledby="admin-maintenance">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">Jobs and storage</p>
          <h2 id="admin-maintenance">Maintenance</h2>
          <p>Cleanup remains dry-run while mutations are disabled.</p>
        </div>
      </div>
      <State loading={state.loading} error={state.error}>
        {state.data && (
          <>
            <HealthMetrics health={state.data.health} />
            {state.data.health.orphan_thumbnails > 0 && (
              <p>
                <button
                  type="button"
                  className="danger"
                  onClick={(event) => {
                    setReason('');
                    setConfirmation('');
                    setCleanup({ returnFocus: event.currentTarget });
                  }}
                >
                  Review orphan thumbnail cleanup
                </button>
              </p>
            )}
            <h3>Announcements needing attention</h3>
            <ul className="admin-maintenance-list">
              {state.data.announcements.map((announcement, index) => (
                <li key={String(announcement.id ?? index)}>
                  <span>
                    <strong>{String(announcement.status ?? 'unknown')}</strong>
                    <small>
                      {String(announcement.attempt_count ?? 0)} attempts ·{' '}
                      {formatTime(String(announcement.updated_at ?? ''))}
                    </small>
                  </span>
                  <code>
                    {String(announcement.last_error ?? 'No error code')}
                  </code>
                  {['failed', 'processing'].includes(
                    String(announcement.status),
                  ) && (
                    <button
                      type="button"
                      onClick={(event) => {
                        setRetry({
                          id: String(announcement.id),
                          returnFocus: event.currentTarget,
                        });
                      }}
                    >
                      Review retry
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <h3>Nightly cleanup dry-run candidates</h3>
            <pre className="admin-json-summary">
              {JSON.stringify(state.data.cleanupCandidates, null, 2)}
            </pre>
            <h3>Largest table health</h3>
            <pre className="admin-json-summary">
              {JSON.stringify(state.data.health.largest_tables, null, 2)}
            </pre>
            <h3>Read-only advisor findings</h3>
            <pre className="admin-json-summary">
              {JSON.stringify(state.data.advisors, null, 2)}
            </pre>
          </>
        )}
      </State>
      {retry && (
        <AdminModal
          labelledBy="retry-title"
          onClose={() => setRetry(null)}
          returnFocus={retry.returnFocus}
        >
          <h3 id="retry-title">Retry Discord announcement</h3>
          <p>
            First verify that Discord did not accept an ambiguous timed-out
            request.
          </p>
          <label>
            Required reason
            <textarea
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label>
            Type RETRY
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          {actionError && (
            <p className="admin-error" role="alert">
              {actionError}
            </p>
          )}
          <div className="admin-row-actions">
            <button type="button" onClick={() => setRetry(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="danger"
              disabled={reason.trim().length < 3 || confirmation !== 'RETRY'}
              onClick={() => void retryAnnouncement()}
            >
              Retry announcement
            </button>
          </div>
        </AdminModal>
      )}
      {cleanup && (
        <AdminModal
          labelledBy="thumbnail-cleanup-title"
          onClose={() => setCleanup(null)}
          returnFocus={cleanup.returnFocus}
        >
          <h3 id="thumbnail-cleanup-title">Delete orphan thumbnails</h3>
          <p>
            Only canonical world.webp objects not referenced by any room will be
            removed.
          </p>
          <label>
            Required reason
            <textarea
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label>
            Type DELETE ORPHANS
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          {actionError && (
            <p className="admin-error" role="alert">
              {actionError}
            </p>
          )}
          <div className="admin-row-actions">
            <button type="button" onClick={() => setCleanup(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="danger"
              disabled={
                reason.trim().length < 3 || confirmation !== 'DELETE ORPHANS'
              }
              onClick={() => void cleanupThumbnails()}
            >
              Delete orphan thumbnails
            </button>
          </div>
        </AdminModal>
      )}
    </section>
  );
}

function Audit({ source }: { source: AdminConsoleSource }) {
  const load = useCallback(() => source.audit(), [source]);
  const state = useLoad(load);
  return (
    <section className="admin-operations" aria-labelledby="admin-audit">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">Append-only</p>
          <h2 id="admin-audit">Admin action audit</h2>
          <p>Successful and failed privileged actions.</p>
        </div>
      </div>
      <State loading={state.loading} error={state.error}>
        <ol className="admin-audit-list">
          {state.data?.map((entry: AdminAuditEntry) => (
            <li key={entry.id}>
              <div>
                <strong>{entry.action.replaceAll('_', ' ')}</strong>
                <span className={`status-${entry.outcome}`}>
                  {entry.outcome}
                </span>
                <time>{formatTime(entry.created_at)}</time>
              </div>
              <p>{entry.reason}</p>
              <code>
                {entry.target_type}: {entry.target_id}
              </code>
            </li>
          ))}
        </ol>
      </State>
    </section>
  );
}

export function AdminConsolePanel({
  activeTab,
  source,
}: {
  activeTab: AdminTab;
  source: AdminConsoleSource;
}) {
  if (activeTab === 'overview') return <Overview source={source} />;
  if (activeTab === 'rooms') return <Rooms source={source} />;
  if (activeTab === 'accounts') return <Accounts source={source} />;
  if (activeTab === 'logs') return <Logs source={source} />;
  if (activeTab === 'maintenance') return <Maintenance source={source} />;
  if (activeTab === 'audit') return <Audit source={source} />;
  return null;
}
