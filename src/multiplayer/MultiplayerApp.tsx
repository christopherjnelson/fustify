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
import { GlobeScene } from '../components/GlobeScene';
import { Minimap } from '../components/Minimap';
import { TerritoryHud } from '../components/TerritoryHud';
import { ControlLegend } from '../components/ControlLegend';
import type { MatchState } from '../core/game/types';
import type { PlanetDefinition } from '../core/types/planet';
import type { LocalPlayerConfig } from '../core/setup/playerConfig';
import { createNeutralMatchSetup } from '../core/setup/startingPositions';
import {
  reconcileMultiplayerSelection,
  useGameStore,
} from '../state/useGameStore';
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
  submitGameplayCommand,
  subscribeToMatch,
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
import { isMatchState } from './gameProtocol';
import { ReadonlyMinimap } from './ReadonlyWorld';
import { RoomCodeCopyButton } from './RoomCodeCopyButton';
import { generateRoomPreviewPlanet, withFreshRoomSeed } from './roomWorld';
import { TurnNotificationController } from '../components/TurnNotificationController';

type Route =
  | { kind: 'lobby' }
  | { kind: 'room'; id: string }
  | { kind: 'match'; id: string };

declare global {
  interface Window {
    __FUSTIFY_MULTIPLAYER_TEST__?: {
      interruptRealtime: () => Promise<void>;
      getRealtimeEventCount: () => number;
      refreshCanonical?: () => Promise<void>;
    };
  }
}

const seatOrderSchema = z.array(
  z.object({
    seatIndex: z.number().int().min(0).max(4),
    userId: z.string().uuid(),
    playerId: z.string().min(1),
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
        <span className="eyebrow">Authoritative multiplayer beta</span>
        <h1>{title}</h1>
        <p>{message}</p>
        <a href="/local">Return to local game</a>
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
        <span className="eyebrow">{BRAND.productName} multiplayer beta</span>
        <h1>Private multiplayer rooms</h1>
        <p>
          Create a private room or join with a shared code. Match state,
          commands, combat, reconnect, and victory are synchronized through the
          authoritative server boundary.
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
        <a href="/local">Return to local game</a>
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

function RoomWorldPreview({ room }: { room: Room }) {
  const { seed, territory_count, continent_count, max_seats } = room;
  const planet = useMemo(
    () =>
      generateRoomPreviewPlanet({
        seed,
        territory_count,
        continent_count,
        max_seats,
      }),
    [seed, territory_count, continent_count, max_seats],
  );
  return (
    <ReadonlyMinimap
      planet={planet}
      className="multiplayer-lobby-world-preview"
    />
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
  const busyRef = useRef<string | null>(null);

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
    if (busyRef.current !== null) return;
    busyRef.current = name;
    setBusy(name);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (requestError) {
      setError(multiplayerError(requestError).message);
    } finally {
      busyRef.current = null;
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
  const claimedHumanSeats = state.seats.filter(
    (seat) =>
      seat.occupant_user_id !== null && seat.controller_type === 'human',
  ).length;
  const canStart =
    claimedHumanSeats >= 2 && state.room.assignment_mode === 'random';

  return (
    <main className="multiplayer-shell">
      <header className="multiplayer-header">
        <div>
          <span className="eyebrow">Private multiplayer room</span>
          <h1>Multiplayer lobby</h1>
        </div>
      </header>

      <section
        className="multiplayer-card room-summary"
        aria-label="Private room summary"
      >
        <div className="room-summary-code">
          <span>Room</span>
          <strong data-testid="room-code">
            {formatRoomCode(state.room.join_code)}
          </strong>
          <RoomCodeCopyButton roomCode={formatRoomCode(state.room.join_code)} />
        </div>
        <div className="room-summary-status">
          <span>
            {state.room.status === 'waiting' ? 'Waiting' : state.room.status} ·
            Revision {state.room.revision}
          </span>
          <ConnectionBadge status={connection} />
        </div>
      </section>

      <div className="multiplayer-layout">
        <div className="multiplayer-player-column">
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
        </div>

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
          <div className="multiplayer-world-setup">
            <div className="multiplayer-settings-controls">
              <div className="multiplayer-seed-setting">
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
                {host && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy !== null || !waiting}
                    aria-busy={busy === 'generate-world'}
                    onClick={() => {
                      if (busyRef.current !== null) return;
                      const generatedSettings = withFreshRoomSeed(settings);
                      settingsDirty.current = true;
                      setSettings(generatedSettings);
                      void act('generate-world', async () => {
                        await updateRoomSettings(client, generatedSettings);
                        settingsDirty.current = false;
                      });
                    }}
                  >
                    {busy === 'generate-world'
                      ? 'Generating…'
                      : 'Generate World'}
                  </button>
                )}
              </div>
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
                    <option value="player-draft" disabled>
                      Player draft (local only)
                    </option>
                  </select>
                  <small>Player draft remains available in local play.</small>
                </label>
              </div>
              {host && (
                <button type="submit" disabled={busy !== null || !waiting}>
                  {busy === 'settings' ? 'Saving…' : 'Save settings'}
                </button>
              )}
            </div>
            <RoomWorldPreview room={state.room} />
          </div>
        </form>
      </div>

      {error && (
        <p role="alert" className="multiplayer-error multiplayer-page-error">
          {error}
        </p>
      )}
      <footer className="multiplayer-card multiplayer-actions">
        {host && waiting && (
          <div>
            <button
              type="button"
              disabled={busy !== null || !canStart}
              onClick={() =>
                void act('start', async () => {
                  const match = await startMatch(client, roomId);
                  navigate(`/multiplayer/match/${match.id}`, true);
                })
              }
            >
              {busy === 'start' ? 'Starting…' : 'Start Match'}
            </button>
            {claimedHumanSeats < 2 && (
              <p className="multiplayer-start-helper">
                At least 2 players must claim seats before starting.
              </p>
            )}
            {state.room.assignment_mode !== 'random' && (
              <p className="multiplayer-start-helper">
                Multiplayer player draft is not supported. Choose random
                assignment.
              </p>
            )}
          </div>
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

function authoritativeSnapshots(match: MultiplayerMatch, userId: string) {
  if (!isMatchState(match.state_snapshot)) {
    throw new Error('The authoritative match state is unavailable.');
  }
  const planet = match.planet_snapshot as unknown as PlanetDefinition;
  if (
    !planet ||
    !Array.isArray(planet.territories) ||
    !Array.isArray(planet.surfaceCells) ||
    !Array.isArray(planet.players)
  ) {
    throw new Error('The authoritative world snapshot is unavailable.');
  }
  const seats = seatOrderSchema.parse(match.seat_order_snapshot);
  const players: LocalPlayerConfig[] = seats.map((seat, index) => ({
    id: seat.playerId,
    name: seat.displayName,
    colorId: `color-${index + 1}`,
    seatIndex: index,
    controllerType: 'local-human',
  }));
  const ownSeat = seats.find((seat) => seat.userId === userId);
  if (!ownSeat) throw new Error('Claimed seat membership is required.');
  return {
    planet,
    state: match.state_snapshot as unknown as MatchState,
    players,
    ownPlayerId: ownSeat.playerId,
  };
}

export function MultiplayerGameScene({
  matchId,
  revision,
  connection = 'SUBSCRIBED',
}: {
  matchId: string;
  revision: number;
  connection?: string;
}) {
  return (
    <main
      className="app-shell mode-playing multiplayer-game-shell"
      data-testid="multiplayer-match"
      data-match-id={matchId}
      data-revision={revision}
    >
      <GlobeScene />
      <Minimap />
      <ControlLegend />
      <TurnNotificationController />
      <TerritoryHud />
      <div className="multiplayer-game-connection">
        <ConnectionBadge status={connection} />
        <span data-testid="match-id">{matchId}</span>
        <span data-testid="match-revision">{revision}</span>
      </div>
    </main>
  );
}

function MatchView({ matchId, userId }: { matchId: string; userId: string }) {
  const client = useMemo(() => getSupabaseClient(), []);
  const [match, setMatch] = useState<MultiplayerMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState('CONNECTING');
  const matchRef = useRef<MultiplayerMatch | null>(null);
  const refreshSequence = useRef(0);

  const install = useCallback(
    (canonical: MultiplayerMatch) => {
      const snapshots = authoritativeSnapshots(canonical, userId);
      matchRef.current = canonical;
      setMatch(canonical);
      setError(null);
      useGameStore.setState((current) => ({
        applicationMode:
          snapshots.state.phase === 'game-over' ? 'game-over' : 'playing',
        planet: snapshots.planet,
        match: reconcileMultiplayerSelection(
          snapshots.planet,
          snapshots.state,
          current.match,
        ),
        matchSetup: createNeutralMatchSetup(snapshots.players, 'random'),
        setup: {
          ...current.setup,
          seed: snapshots.planet.seed,
          territoryCount: snapshots.planet.territoryCount,
          continentCount: snapshots.planet.continentCount,
          playerCount: snapshots.players.length,
          assignmentMode: 'random',
        },
        setupDraft: {
          ...current.setupDraft,
          seed: snapshots.planet.seed,
          territoryCount: snapshots.planet.territoryCount,
          continentCount: snapshots.planet.continentCount,
          playerCount: snapshots.players.length,
          assignmentMode: 'random',
        },
        lastActionError: null,
        multiplayerSession: {
          ownPlayerId: snapshots.ownPlayerId,
          revision: canonical.revision,
          stateFingerprint: canonical.state_fingerprint ?? '',
          connection: current.multiplayerSession?.connection ?? 'CONNECTING',
          pending: current.multiplayerSession?.pending ?? false,
          dispatch: current.multiplayerSession?.dispatch ?? (async () => {}),
        },
      }));
    },
    [userId],
  );

  const refresh = useCallback(
    async (minimumRevision = -1) => {
      const sequence = ++refreshSequence.current;
      const canonical = await fetchMatch(client, matchId);
      if (sequence !== refreshSequence.current) return;
      const currentRevision = matchRef.current?.revision ?? -1;
      if (
        canonical.revision >= minimumRevision &&
        canonical.revision >= currentRevision
      ) {
        install(canonical);
      }
    },
    [client, install, matchId],
  );

  const dispatch = useCallback(
    async (action: Parameters<typeof submitGameplayCommand>[4]) => {
      const canonical = matchRef.current;
      if (!canonical) throw new Error('Reconnecting to the match…');
      const idempotencyKey = crypto.randomUUID();
      try {
        const result = await submitGameplayCommand(
          client,
          matchId,
          canonical.revision,
          idempotencyKey,
          action,
        );
        await refresh(result.acceptedRevision);
      } catch (requestError) {
        await refresh().catch(() => undefined);
        throw multiplayerError(requestError);
      }
    },
    [client, matchId, refresh],
  );

  useEffect(() => {
    let active = true;
    let channel = subscribeToMatch(
      client,
      matchId,
      (revision) => {
        if (revision > (matchRef.current?.revision ?? -1))
          void refresh(revision);
      },
      (status) => {
        if (!active) return;
        setConnection(status);
        useGameStore.setState((current) => ({
          multiplayerSession: current.multiplayerSession
            ? { ...current.multiplayerSession, connection: status }
            : null,
        }));
        if (status === 'SUBSCRIBED') void refresh();
      },
    );
    void refresh().catch((requestError: unknown) => {
      if (active) setError(multiplayerError(requestError).message);
    });
    const recover = () => void refresh();
    const reconcile = window.setInterval(recover, 2_000);
    window.addEventListener('focus', recover);
    window.addEventListener('online', recover);

    if (import.meta.env.DEV) {
      window.__FUSTIFY_MULTIPLAYER_TEST__ = {
        getRealtimeEventCount: () => matchRef.current?.revision ?? 0,
        refreshCanonical: () => refresh(),
        interruptRealtime: async () => {
          setConnection('RECONNECTING');
          await client.removeChannel(channel);
          channel = subscribeToMatch(
            client,
            matchId,
            (revision) => void refresh(revision),
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
      active = false;
      window.clearInterval(reconcile);
      window.removeEventListener('focus', recover);
      window.removeEventListener('online', recover);
      delete window.__FUSTIFY_MULTIPLAYER_TEST__;
      void client.removeChannel(channel);
      useGameStore.setState({ multiplayerSession: null });
    };
  }, [client, matchId, refresh]);

  useEffect(() => {
    useGameStore.setState((current) => ({
      multiplayerSession: current.multiplayerSession
        ? { ...current.multiplayerSession, dispatch, connection }
        : null,
    }));
  }, [connection, dispatch, match]);

  if (!match) {
    return (
      <StatusScreen
        title={error ? 'Private match unavailable' : 'Loading private match'}
        message={error ?? 'Restoring authoritative match state…'}
      />
    );
  }

  return (
    <MultiplayerGameScene
      matchId={match.id}
      revision={match.revision}
      connection={connection}
    />
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
  if (route.kind === 'match')
    return <MatchView matchId={route.id} userId={userId} />;
  return <Lobby userId={userId} />;
}
