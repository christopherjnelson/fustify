import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { z } from 'zod';
import { BRAND } from '../branding';
import { generatePlanet } from '../core/generation/generatePlanet';
import {
  claimSeat,
  closeRoom,
  createRoom,
  ensureAnonymousSession,
  fetchMatch,
  fetchRoomState,
  formatRoomCode,
  joinRoom,
  leaveRoom,
  multiplayerError,
  releaseSeat,
  startMatch,
  subscribeToRoom,
  updateRoomSettings,
  type MultiplayerMatch,
  type Room,
  type RoomState,
} from './multiplayerApi';
import {
  getSupabaseClient,
  readMultiplayerConfiguration,
} from './supabaseClient';
import { ReadonlyGlobe, ReadonlyMinimap } from './ReadonlyWorld';
import { worldFingerprint } from './worldFingerprint';

type Route =
  | { kind: 'lobby' }
  | { kind: 'room'; id: string }
  | { kind: 'match'; id: string };

declare global {
  interface Window {
    __FUSTIFY_MULTIPLAYER_TEST__?: {
      interruptRealtime: () => Promise<void>;
      getRealtimeEventCount: () => number;
    };
  }
}

const setupSnapshotSchema = z.object({
  version: z.literal(1),
  seed: z.string().min(1).max(64),
  territoryCount: z.number().int().min(12).max(48),
  continentCount: z.number().int().min(2).max(5),
  playerCount: z.number().int().min(2).max(5),
  assignmentMode: z.enum(['random', 'player-draft']),
});

const seatOrderSchema = z.array(
  z.object({
    seatIndex: z.number().int().min(0).max(4),
    userId: z.string().uuid(),
    displayName: z.string().min(1).max(32),
    controllerType: z.literal('human'),
  }),
);

function currentRoute(): Route {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] === 'multiplayer' && parts[1] === 'room' && parts[2]) {
    return { kind: 'room', id: parts[2] };
  }
  if (parts[0] === 'multiplayer' && parts[1] === 'match' && parts[2]) {
    return { kind: 'match', id: parts[2] };
  }
  return { kind: 'lobby' };
}

function navigate(path: string, replace = false) {
  window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function StatusScreen({ title, message }: { title: string; message: string }) {
  return (
    <main className="multiplayer-shell multiplayer-centered">
      <section className="multiplayer-card" aria-live="polite">
        <span className="eyebrow">Multiplayer foundation</span>
        <h1>{title}</h1>
        <p>{message}</p>
        <a href="/">Return to local game</a>
      </section>
    </main>
  );
}

function Lobby({ userId }: { userId: string }) {
  const client = useMemo(() => getSupabaseClient(), []);
  const [displayName, setDisplayName] = useState(
    () => window.localStorage.getItem('fustify.multiplayer.displayName') ?? '',
  );
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  const rememberName = () => {
    window.localStorage.setItem(
      'fustify.multiplayer.displayName',
      displayName.trim(),
    );
  };

  const create = async () => {
    setBusy('create');
    setError(null);
    try {
      const room = await createRoom(client, displayName);
      rememberName();
      navigate(`/multiplayer/room/${room.id}`);
    } catch (requestError) {
      setError(multiplayerError(requestError).message);
    } finally {
      setBusy(null);
    }
  };

  const join = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('join');
    setError(null);
    try {
      const room = await joinRoom(client, joinCode, displayName);
      rememberName();
      navigate(`/multiplayer/room/${room.id}`);
    } catch (requestError) {
      setError(multiplayerError(requestError).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="multiplayer-shell multiplayer-centered">
      <section className="multiplayer-card multiplayer-entry-card">
        <span className="eyebrow">
          {BRAND.productName} multiplayer foundation
        </span>
        <h1>Private multiplayer rooms</h1>
        <p>
          Create a private room or join with a shared code. This preview
          synchronizes the lobby and deterministic match-start world; gameplay
          commands remain local-only.
        </p>
        <label>
          Display name
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={32}
            autoComplete="nickname"
          />
        </label>
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy !== null}
        >
          {busy === 'create' ? 'Creating…' : 'Create private room'}
        </button>
        <form
          onSubmit={(event) => void join(event)}
          className="multiplayer-join-form"
        >
          <label>
            Room code
            <input
              value={joinCode}
              onChange={(event) =>
                setJoinCode(event.target.value.toUpperCase())
              }
              placeholder="ABCD-1234"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button type="submit" disabled={busy !== null}>
            {busy === 'join' ? 'Joining…' : 'Join room'}
          </button>
        </form>
        {error && (
          <p role="alert" className="multiplayer-error">
            {error}
          </p>
        )}
        <p className="multiplayer-session-note">
          Anonymous session ready · player {userId.slice(0, 8)}
        </p>
        <a href="/">Return to local game</a>
      </section>
    </main>
  );
}

function ConnectionBadge({ status }: { status: string }) {
  const connected = status === 'SUBSCRIBED';
  return (
    <span
      className={`multiplayer-connection ${connected ? 'connected' : ''}`}
      role="status"
      aria-live="polite"
      data-testid="connection-status"
    >
      {connected
        ? 'Live'
        : status === 'CONNECTING'
          ? 'Connecting…'
          : 'Reconnecting…'}
    </span>
  );
}

function RoomView({ roomId, userId }: { roomId: string; userId: string }) {
  const client = useMemo(() => getSupabaseClient(), []);
  const [state, setState] = useState<RoomState | null>(null);
  const [settings, setSettings] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [connection, setConnection] = useState('CONNECTING');
  const requestSequence = useRef(0);
  const realtimeEventCount = useRef(0);
  const settingsDirty = useRef(false);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const canonical = await fetchRoomState(client, roomId);
      if (sequence !== requestSequence.current) return;
      setState(canonical);
      if (!settingsDirty.current) setSettings(canonical.room);
      setError(null);
    } catch (requestError) {
      if (sequence === requestSequence.current) {
        setError(multiplayerError(requestError).message);
      }
    }
  }, [client, roomId]);

  useEffect(() => {
    const initialRefreshTimer = window.setTimeout(() => void refresh(), 0);
    let refreshTimer: number | null = null;
    let channel = subscribeToRoom(
      client,
      roomId,
      () => {
        realtimeEventCount.current += 1;
        if (refreshTimer !== null) window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => void refresh(), 40);
      },
      (status) => {
        setConnection(status);
        if (status === 'SUBSCRIBED') void refresh();
      },
    );
    const recover = () => void refresh();
    const reconciliationTimer = window.setInterval(() => void refresh(), 2_000);
    window.addEventListener('online', recover);
    window.addEventListener('focus', recover);

    if (import.meta.env.DEV) {
      window.__FUSTIFY_MULTIPLAYER_TEST__ = {
        getRealtimeEventCount: () => realtimeEventCount.current,
        interruptRealtime: async () => {
          setConnection('RECONNECTING');
          await client.removeChannel(channel);
          await new Promise((resolve) => window.setTimeout(resolve, 100));
          channel = subscribeToRoom(
            client,
            roomId,
            () => {
              realtimeEventCount.current += 1;
              void refresh();
            },
            (status) => {
              setConnection(status);
              if (status === 'SUBSCRIBED') void refresh();
            },
          );
          await refresh();
        },
      };
    }

    return () => {
      window.clearTimeout(initialRefreshTimer);
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      window.clearInterval(reconciliationTimer);
      window.removeEventListener('online', recover);
      window.removeEventListener('focus', recover);
      delete window.__FUSTIFY_MULTIPLAYER_TEST__;
      void client.removeChannel(channel);
    };
  }, [client, refresh, roomId]);

  useEffect(() => {
    if (state?.match) {
      navigate(`/multiplayer/match/${state.match.id}`, true);
    }
  }, [state?.match]);

  const act = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (requestError) {
      setError(multiplayerError(requestError).message);
    } finally {
      setBusy(null);
    }
  };

  if (!state || !settings) {
    return (
      <StatusScreen
        title={error ? 'Private room unavailable' : 'Loading private room'}
        message={error ?? 'Restoring canonical room state…'}
      />
    );
  }

  const host = state.room.host_user_id === userId;
  const waiting = state.room.status === 'waiting';
  const memberById = new Map(
    state.members.map((member) => [member.user_id, member]),
  );
  const ownSeat = state.seats.find((seat) => seat.occupant_user_id === userId);

  return (
    <main className="multiplayer-shell">
      <header className="multiplayer-header">
        <div>
          <span className="eyebrow">
            Private room · {state.room.status} · revision {state.room.revision}
          </span>
          <h1>Multiplayer lobby</h1>
        </div>
        <ConnectionBadge status={connection} />
      </header>

      <div className="multiplayer-layout">
        <section
          className="multiplayer-card room-code-card"
          aria-label="Private room code"
        >
          <span>Share this code</span>
          <strong data-testid="room-code">
            {formatRoomCode(state.room.join_code)}
          </strong>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              void navigator.clipboard.writeText(
                formatRoomCode(state.room.join_code),
              )
            }
          >
            Copy room code
          </button>
        </section>

        <section
          className="multiplayer-card seat-card"
          aria-labelledby="seat-list-title"
        >
          <h2 id="seat-list-title">Seats</h2>
          <ol className="multiplayer-seat-list">
            {state.seats.map((seat) => {
              const occupant = seat.occupant_user_id
                ? memberById.get(seat.occupant_user_id)
                : null;
              return (
                <li
                  key={seat.seat_index}
                  data-testid={`seat-${seat.seat_index}`}
                >
                  <span>
                    <b>Seat {seat.seat_index + 1}</b>
                    {occupant ? (
                      <small>
                        {occupant.display_name}
                        {occupant.role === 'host' ? ' · Host' : ''}
                      </small>
                    ) : (
                      <small>Open</small>
                    )}
                  </span>
                  {seat.occupant_user_id === userId ? (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy !== null || !waiting}
                      onClick={() =>
                        void act('release', () => releaseSeat(client, roomId))
                      }
                    >
                      Release
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        busy !== null ||
                        !waiting ||
                        occupant !== null ||
                        ownSeat !== undefined
                      }
                      onClick={() =>
                        void act('claim', () =>
                          claimSeat(client, roomId, seat.seat_index),
                        )
                      }
                    >
                      Claim
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <section
          className="multiplayer-card member-card"
          aria-labelledby="member-list-title"
        >
          <h2 id="member-list-title">Members</h2>
          <ul>
            {state.members.map((member) => (
              <li key={member.user_id}>
                {member.display_name}
                {member.role === 'host' && <span>Host</span>}
                {member.user_id === userId && <span>You</span>}
              </li>
            ))}
          </ul>
        </section>

        <form
          className="multiplayer-card settings-card"
          aria-labelledby="room-settings-title"
          onSubmit={(event) => {
            event.preventDefault();
            void act('settings', async () => {
              await updateRoomSettings(client, settings);
              settingsDirty.current = false;
            });
          }}
        >
          <h2 id="room-settings-title">World settings</h2>
          {!host && <p>Only the host can change room settings.</p>}
          <label>
            Seed
            <input
              value={settings.seed}
              maxLength={64}
              disabled={!host || !waiting || busy !== null}
              onChange={(event) => {
                settingsDirty.current = true;
                setSettings({ ...settings, seed: event.target.value });
              }}
            />
          </label>
          <div className="multiplayer-setting-grid">
            <label>
              Territories
              <input
                type="number"
                min={12}
                max={48}
                value={settings.territory_count}
                disabled={!host || !waiting || busy !== null}
                onChange={(event) => {
                  settingsDirty.current = true;
                  setSettings({
                    ...settings,
                    territory_count: Number(event.target.value),
                  });
                }}
              />
            </label>
            <label>
              Continents
              <input
                type="number"
                min={2}
                max={5}
                value={settings.continent_count}
                disabled={!host || !waiting || busy !== null}
                onChange={(event) => {
                  settingsDirty.current = true;
                  setSettings({
                    ...settings,
                    continent_count: Number(event.target.value),
                  });
                }}
              />
            </label>
            <label>
              Seats
              <input
                type="number"
                min={2}
                max={5}
                value={settings.max_seats}
                disabled={!host || !waiting || busy !== null}
                onChange={(event) => {
                  settingsDirty.current = true;
                  setSettings({
                    ...settings,
                    max_seats: Number(event.target.value),
                  });
                }}
              />
            </label>
            <label>
              Assignment
              <select
                value={settings.assignment_mode}
                disabled={!host || !waiting || busy !== null}
                onChange={(event) => {
                  settingsDirty.current = true;
                  setSettings({
                    ...settings,
                    assignment_mode: event.target.value,
                  });
                }}
              >
                <option value="random">Random</option>
                <option value="player-draft">Player draft</option>
              </select>
            </label>
          </div>
          {host && (
            <button type="submit" disabled={busy !== null || !waiting}>
              Save settings
            </button>
          )}
        </form>
      </div>

      {error && (
        <p role="alert" className="multiplayer-error multiplayer-page-error">
          {error}
        </p>
      )}
      <footer className="multiplayer-actions">
        {host && waiting && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void act('start', async () => {
                const match = await startMatch(client, roomId);
                navigate(`/multiplayer/match/${match.id}`, true);
              })
            }
          >
            {busy === 'start' ? 'Starting…' : 'Start Match'}
          </button>
        )}
        <button
          type="button"
          className="secondary"
          disabled={busy !== null}
          onClick={() =>
            void act('leave', async () => {
              await leaveRoom(client, roomId);
              navigate('/multiplayer', true);
            })
          }
        >
          Leave room
        </button>
        {host && state.room.status !== 'closed' && (
          <button
            type="button"
            className="danger"
            disabled={busy !== null}
            onClick={() => void act('close', () => closeRoom(client, roomId))}
          >
            Close room
          </button>
        )}
      </footer>
    </main>
  );
}

function MatchView({ matchId }: { matchId: string }) {
  const client = useMemo(() => getSupabaseClient(), []);
  const [match, setMatch] = useState<MultiplayerMatch | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchMatch(client, matchId)
      .then((result) => {
        if (active) setMatch(result);
      })
      .catch((requestError: unknown) => {
        if (active) setError(multiplayerError(requestError).message);
      });
    return () => {
      active = false;
    };
  }, [client, matchId]);

  const preview = useMemo(() => {
    if (!match) return null;
    try {
      const setup = setupSnapshotSchema.parse(match.setup_snapshot);
      const seats = seatOrderSchema.parse(match.seat_order_snapshot);
      const planet = generatePlanet(setup.seed, {
        territoryCount: setup.territoryCount,
        continentCount: setup.continentCount,
        playerCount: setup.playerCount,
      });
      return { setup, seats, planet, fingerprint: worldFingerprint(planet) };
    } catch {
      return new Error('The immutable match setup is invalid or unsupported.');
    }
  }, [match]);

  if (!match) {
    return (
      <StatusScreen
        title={error ? 'Private match unavailable' : 'Loading match preview'}
        message={error ?? 'Reading the immutable setup snapshot…'}
      />
    );
  }
  if (preview instanceof Error) {
    return (
      <StatusScreen
        title="Match preview unavailable"
        message={preview.message}
      />
    );
  }
  if (!preview) return null;

  const { setup, seats, planet, fingerprint } = preview;

  return (
    <main
      className="multiplayer-match-shell"
      data-testid="multiplayer-match-preview"
    >
      <ReadonlyGlobe planet={planet} />
      <ReadonlyMinimap planet={planet} />
      <section className="multiplayer-card multiplayer-match-panel">
        <span className="eyebrow">
          Multiplayer foundation · read-only preview
        </span>
        <h1>Synchronized world ready</h1>
        <dl>
          <div>
            <dt>Match</dt>
            <dd data-testid="match-id">{match.id}</dd>
          </div>
          <div>
            <dt>Seed</dt>
            <dd data-testid="match-seed">{setup.seed}</dd>
          </div>
          <div>
            <dt>Setup</dt>
            <dd data-testid="match-setup">
              {setup.territoryCount} territories · {setup.continentCount}{' '}
              continents
            </dd>
          </div>
        </dl>
        <h2>Participant order</h2>
        <ol>
          {seats.map((seat) => (
            <li key={seat.seatIndex}>{seat.displayName}</li>
          ))}
        </ol>
        {import.meta.env.DEV && (
          <p className="world-fingerprint">
            World fingerprint
            <code data-testid="world-fingerprint">{fingerprint}</code>
          </p>
        )}
        <p>
          Gameplay synchronization is intentionally not enabled in this
          milestone.
        </p>
        <a href={`/multiplayer/room/${match.room_id}`}>Return to room</a>
      </section>
    </main>
  );
}

export function MultiplayerApp() {
  const [route, setRoute] = useState<Route>(() => currentRoute());
  const [userId, setUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const configured = readMultiplayerConfiguration() !== null;

  useEffect(() => {
    const updateRoute = () => setRoute(currentRoute());
    window.addEventListener('popstate', updateRoute);
    return () => window.removeEventListener('popstate', updateRoute);
  }, []);

  useEffect(() => {
    if (!configured) return;
    let active = true;
    const client = getSupabaseClient();
    void ensureAnonymousSession(client)
      .then((id) => {
        if (active) setUserId(id);
      })
      .catch((error: unknown) => {
        if (active) setAuthError(multiplayerError(error).message);
      });
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (session?.user) setUserId(session.user.id);
      if (event === 'SIGNED_OUT') setUserId(null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [configured]);

  if (!configured) {
    return (
      <StatusScreen
        title="Multiplayer configuration unavailable"
        message="Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to use multiplayer. Local play remains available."
      />
    );
  }
  if (authError) {
    return (
      <StatusScreen
        title="Could not restore multiplayer session"
        message={authError}
      />
    );
  }
  if (!userId) {
    return (
      <StatusScreen
        title="Connecting anonymous player"
        message="Restoring or creating a private anonymous session…"
      />
    );
  }
  if (route.kind === 'room')
    return <RoomView roomId={route.id} userId={userId} />;
  if (route.kind === 'match') return <MatchView matchId={route.id} />;
  return <Lobby userId={userId} />;
}
