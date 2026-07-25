import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AdminDashboardSnapshot,
  AdminDashboardSource,
  AdminRecentRoom,
} from './adminApi';

function number(value: number) {
  return new Intl.NumberFormat().format(value);
}

function timestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className="admin-metric">
      <span>{label}</span>
      <strong>{number(value)}</strong>
      <p>{detail}</p>
    </article>
  );
}

function generatorLabel(room: AdminRecentRoom) {
  return room.generator_version === 4
    ? 'Normalized v2'
    : `Legacy generator v${room.generator_version}`;
}

function RecentRooms({ rooms }: { rooms: AdminRecentRoom[] }) {
  if (rooms.length === 0) {
    return (
      <div className="admin-empty admin-rooms-empty">
        <h3>No rooms yet</h3>
        <p>Recent multiplayer rooms will appear here after they are created.</p>
      </div>
    );
  }

  return (
    <ul className="admin-room-list" aria-label="Recent multiplayer rooms">
      {rooms.map((room, index) => (
        <li
          key={`${room.room_name}:${room.created_at}:${index}`}
          className="admin-room-card"
        >
          <div className="admin-room-primary">
            <div>
              <h3>{room.room_name}</h3>
              <p>Hosted by {room.host_display_name}</p>
            </div>
            <div className="admin-room-badges">
              <span>{room.visibility}</span>
              <span>{room.room_state}</span>
            </div>
          </div>
          <dl>
            <div>
              <dt>Members</dt>
              <dd>
                {room.current_members} / {room.maximum_players}
              </dd>
            </div>
            <div>
              <dt>Claimed seats</dt>
              <dd>
                {room.claimed_seats} / {room.maximum_players}
              </dd>
            </div>
            <div>
              <dt>Thumbnail</dt>
              <dd>
                {room.thumbnail_available ? 'Published' : 'Not available'}
              </dd>
            </div>
            <div>
              <dt>World generator</dt>
              <dd>{generatorLabel(room)}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{timestamp(room.created_at)}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{timestamp(room.updated_at)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

export function AdminOperations({
  source,
  fixture = false,
  refreshToken = 0,
}: {
  source: AdminDashboardSource;
  fixture?: boolean;
  refreshToken?: number;
}) {
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fetching = useRef(false);

  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    setLoading(true);
    try {
      const next = await source.load();
      setSnapshot(next);
      setError(false);
    } catch {
      console.warn('Admin dashboard refresh failed.');
      setError(true);
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh, refreshToken]);

  useEffect(() => {
    const refetch = () => void refresh();
    window.addEventListener('focus', refetch);
    return () => window.removeEventListener('focus', refetch);
  }, [refresh]);

  return (
    <section className="admin-operations" aria-labelledby="admin-overview">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">Operations</p>
          <h2 id="admin-overview">Multiplayer overview</h2>
          <p>Server-calculated account, room, match, and thumbnail health.</p>
        </div>
        <div className="admin-actions">
          {snapshot && (
            <span>Generated {timestamp(snapshot.overview.generated_at)}</span>
          )}
        </div>
      </div>

      {fixture && (
        <div className="admin-fixture-notice" role="status">
          Deterministic development fixture
        </div>
      )}

      {loading && !snapshot && (
        <div className="admin-state-card" aria-live="polite">
          <h3>Loading admin data…</h3>
          <p>Requesting the authorized operational snapshot.</p>
        </div>
      )}

      {error && (
        <div className="admin-error" role="alert">
          <strong>Admin data could not be loaded.</strong>{' '}
          {snapshot
            ? 'The last successful snapshot remains visible.'
            : 'No privileged data is available.'}
          <button type="button" onClick={() => void refresh()}>
            Try Again
          </button>
        </div>
      )}

      {snapshot && (
        <>
          <div className="admin-metric-grid">
            <Metric
              label="Registered accounts"
              value={snapshot.overview.registered_accounts}
              detail="Non-anonymous Auth accounts"
            />
            <Metric
              label="Public rooms waiting"
              value={snapshot.overview.public_waiting_rooms}
              detail="Openly discoverable lobbies"
            />
            <Metric
              label="Private rooms waiting"
              value={snapshot.overview.private_waiting_rooms}
              detail="Code-only lobbies"
            />
            <Metric
              label="Active matches"
              value={snapshot.overview.active_matches}
              detail={`${number(snapshot.overview.total_matches)} matches created`}
            />
            <Metric
              label="Published thumbnails"
              value={snapshot.overview.public_waiting_with_thumbnail}
              detail="Public waiting rooms"
            />
            <Metric
              label="Missing thumbnails"
              value={snapshot.overview.public_waiting_missing_thumbnail}
              detail="Public waiting rooms needing attention"
            />
          </div>

          <div className="admin-section-heading admin-room-heading">
            <div>
              <p className="admin-eyebrow">Latest activity</p>
              <h2>Recent multiplayer rooms</h2>
              <p>Up to 20 rooms, newest updates first.</p>
            </div>
          </div>
          <RecentRooms rooms={snapshot.recentRooms} />
        </>
      )}
    </section>
  );
}
