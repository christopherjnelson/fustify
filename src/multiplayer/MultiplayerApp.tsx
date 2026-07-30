import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { z } from 'zod';
import type { MatchState } from '../core/game/types';
import { resolveGeneratorVersion } from '../core/generation/constants';
import { generateReadableWorldSeed } from '../core/generation/readableWorldSeed';
import type { PlanetDefinition } from '../core/types/planet';
import { createNeutralMatchSetup } from '../core/setup/startingPositions';
import {
  reconcileMultiplayerSelection,
  useGameStore,
} from '../state/useGameStore';
import {
  claimSeat,
  createRoom,
  fetchPublicRooms,
  fetchRoomState,
  formatRoomCode,
  heartbeatRoomMembership,
  joinRoom,
  joinPublicRoom,
  leaveRoom,
  multiplayerError,
  isAccountRequiredError,
  releaseSeat,
  startMatch,
  submitGameplayCommand,
  subscribeToMatch,
  subscribeToRoom,
  updateRoomSettings,
  multiplayerRoomSettingsSchema,
  type MultiplayerMatch,
  type Room,
  type RoomState,
} from './multiplayerApi';
import { useAccount } from '../auth/accountContext';
import { MatchSynchronization } from './matchSynchronization';
import { getSupabaseClient } from './supabaseClient';
import { isMatchState } from './gameProtocol';
import { ReadonlyMinimap } from './ReadonlyMinimap';
import { ClipboardCopyButton } from './RoomCodeCopyButton';
import {
  isMatchLaunchPending,
  roomLobbyPresentation,
  shouldReplaceRoomSettingsDraft,
} from './roomLobbyPresentation';
import { generateRoomPreviewPlanet, withFreshRoomSeed } from './roomWorld';
import {
  GameSetupShell,
  SetupSummary,
  SetupWorldPanel,
} from '../components/setup/GameSetup';
import { MultiplayerRoomRoster } from './MultiplayerRoomRoster';
import { buildMultiplayerRosterDisplay } from './multiplayerRoomRosterViewModel';
import { createMultiplayerPlayerConfigs } from './multiplayerPlayerConfig';
import {
  aggregateMatchEventReactions,
  fetchMatchEventReactions,
  setMatchEventReaction,
  subscribeToMatchEventReactions,
  type ActivityReactionController,
  type MatchEventReaction,
  type MatchEventReactionRow,
} from './matchEventReactions';
import {
  MultiplayerBrowser,
  type MultiplayerBrowserServices,
} from './MultiplayerBrowser';
import { roomThumbnailPublicUrl } from './worldThumbnail';
import { PublicRoomSettingsSummary } from './PublicRoomSettingsSummary';
import {
  installWaitingRoomNavigationGuard,
  runWaitingRoomExit,
  waitingRoomExitRequiresConfirmation,
  type WaitingRoomExitIntent,
} from './waitingRoomExit';
import {
  directRoomEntryFailure,
  directRoomEntryStatus,
  enterRoomFromDirectLink,
  isValidDirectRoomId,
  type DirectRoomEntryFailure,
} from './directRoomEntry';

type Route =
  | { kind: 'lobby' }
  | { kind: 'room'; id: string }
  | { kind: 'match'; id: string };

const RoomPublicationController = lazy(
  () => import('./RoomPublicationController'),
);
const MatchLaunchOverlay = lazy(() => import('./MatchLaunchOverlay'));
const PostMatchActions = lazy(() => import('./PostMatchActions'));
const WaitingRoomExitDialog = lazy(() => import('./WaitingRoomExitDialog'));
const MultiplayerGameScene = lazy(() => import('./MultiplayerGameScene'));

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
    displayName: z.string().min(1).max(40),
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

function navigate(path: string, replace = false, notice?: string) {
  window.history[replace ? 'replaceState' : 'pushState'](
    notice ? { multiplayerNotice: notice } : null,
    '',
    path,
  );
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

function Lobby() {
  const client = useMemo(() => getSupabaseClient(), []);
  const { controller, state: account } = useAccount();
  const [notice] = useState<string | null>(() => {
    const value = (
      window.history.state as { multiplayerNotice?: unknown } | null
    )?.multiplayerNotice;
    if (typeof value !== 'string') return null;
    window.history.replaceState(null, '', window.location.href);
    return value;
  });
  const runAuthorized = useCallback(
    async <T,>(request: () => Promise<T>): Promise<T> => {
      if (!controller) {
        throw new Error('Account configuration is unavailable.');
      }
      await controller.requireRegisteredReady();
      try {
        return await request();
      } catch (requestError) {
        if (isAccountRequiredError(requestError)) {
          await controller.handleBackendAccountRequired();
        }
        throw requestError;
      }
    },
    [controller],
  );

  const services = useMemo<MultiplayerBrowserServices>(
    () => ({
      createGame: async ({ name, maxSeats }) =>
        runAuthorized(() =>
          createRoom(client, {
            name,
            settings: {
              seed: generateReadableWorldSeed(),
              territoryCount: 42,
              continentCount: 5,
              assignmentMode: 'random',
              maxSeats,
            },
          }),
        ),
      joinWithCode: (code) =>
        runAuthorized(() => joinRoom(client, code)).catch((error) => {
          throw multiplayerError(error);
        }),
      joinPublicGame: (roomId) =>
        runAuthorized(() => joinPublicRoom(client, roomId)).catch((error) => {
          throw multiplayerError(error);
        }),
      listPublicGames: () =>
        runAuthorized(() => fetchPublicRooms(client)).catch((error) => {
          throw multiplayerError(error);
        }),
      thumbnailUrl: (path, version) =>
        roomThumbnailPublicUrl(client, path, version),
      navigate,
    }),
    [client, runAuthorized],
  );

  if (account.status !== 'registered-ready') {
    return (
      <StatusScreen
        title="Multiplayer unavailable"
        message="Your registered account could not be loaded."
      />
    );
  }

  return (
    <MultiplayerBrowser
      profile={account.account.profile}
      services={services}
      notice={notice}
    />
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

function RoomWorldPreview({ planet }: { planet: PlanetDefinition }) {
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
  const [entryFailure, setEntryFailure] =
    useState<DirectRoomEntryFailure | null>(() =>
      isValidDirectRoomId(roomId) ? null : 'invalid-link',
    );
  const [busy, setBusy] = useState<string | null>(null);
  const [connection, setConnection] = useState('CONNECTING');
  const requestSequence = useRef(0);
  const realtimeEventCount = useRef(0);
  const settingsDirty = useRef(false);
  const busyRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const guardCleanupRef = useRef<(() => void) | null>(null);
  const [exitIntent, setExitIntent] = useState<WaitingRoomExitIntent | null>(
    null,
  );
  const [exitError, setExitError] = useState<string | null>(null);
  const [publicationOpen, setPublicationOpen] = useState(false);
  const [publicationError, setPublicationError] = useState<string | null>(null);
  const exitingRef = useRef(false);
  const transitionedRef = useRef(false);

  const clearExitGuard = useCallback(() => {
    guardCleanupRef.current?.();
    guardCleanupRef.current = null;
    setExitIntent(null);
    setExitError(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      guardCleanupRef.current?.();
    };
  }, []);

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const canonical = await fetchRoomState(client, roomId);
      if (sequence !== requestSequence.current) return;
      setState(canonical);
      if (
        shouldReplaceRoomSettingsDraft(canonical.room, settingsDirty.current)
      ) {
        if (
          canonical.room.visibility === 'public' ||
          canonical.room.status !== 'waiting'
        ) {
          settingsDirty.current = false;
          setPublicationOpen(false);
          setPublicationError(null);
        }
        setSettings(canonical.room);
      }
      setError(null);
    } catch (requestError) {
      if (sequence === requestSequence.current) {
        setError(multiplayerError(requestError).message);
      }
    }
  }, [client, roomId]);

  useEffect(() => {
    if (!isValidDirectRoomId(roomId)) return;
    let active = true;
    let entered = false;
    let inFlight = false;
    let retryTimer: number | null = null;
    const attemptEntry = () => {
      if (!active || entered || inFlight) return;
      inFlight = true;
      setEntryFailure(null);
      const sequence = ++requestSequence.current;
      void enterRoomFromDirectLink(client, userId, roomId)
        .then((canonical) => {
          if (!active || sequence !== requestSequence.current) return;
          entered = true;
          if (retryTimer !== null) window.clearTimeout(retryTimer);
          setState(canonical);
          setSettings(canonical.room);
          setEntryFailure(null);
          setError(null);
        })
        .catch((entryError) => {
          if (!active || sequence !== requestSequence.current) return;
          const failure = directRoomEntryFailure(entryError);
          setEntryFailure(failure);
          if (failure === 'temporary') {
            retryTimer = window.setTimeout(attemptEntry, 2_000);
          }
        })
        .finally(() => {
          inFlight = false;
        });
    };
    const recover = () => attemptEntry();
    window.addEventListener('online', recover);
    window.addEventListener('focus', recover);
    attemptEntry();
    return () => {
      active = false;
      requestSequence.current += 1;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      window.removeEventListener('online', recover);
      window.removeEventListener('focus', recover);
    };
  }, [client, roomId, userId]);

  const loadedRoomId = state?.room.id ?? null;

  useEffect(() => {
    if (loadedRoomId !== roomId) return;
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
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      window.clearInterval(reconciliationTimer);
      window.removeEventListener('online', recover);
      window.removeEventListener('focus', recover);
      delete window.__FUSTIFY_MULTIPLAYER_TEST__;
      void client.removeChannel(channel);
    };
  }, [client, loadedRoomId, refresh, roomId]);

  useEffect(() => {
    if (state?.match) {
      transitionedRef.current = true;
      guardCleanupRef.current?.();
      guardCleanupRef.current = null;
      navigate(`/multiplayer/match/${state.match.id}`, true);
    }
  }, [state?.match]);

  const waitingMember =
    state?.room.status === 'waiting' &&
    state.members.some((member) => member.user_id === userId);
  const exitRequiresConfirmation = waitingRoomExitRequiresConfirmation(
    state?.room.host_user_id === userId,
    state?.seats.some((seat) => seat.occupant_user_id === userId) ?? false,
  );

  useEffect(() => {
    if (!waitingMember) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void import('./roomHeartbeatScheduler').then(
      ({ startRoomHeartbeatScheduler }) => {
        if (cancelled) return;
        stop = startRoomHeartbeatScheduler({
          touch: () => heartbeatRoomMembership(client, roomId),
          reconcile: refresh,
        });
      },
    );
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [client, refresh, roomId, userId, waitingMember]);

  useEffect(() => {
    if (!state || state.room.status !== 'closed') return;
    transitionedRef.current = true;
    guardCleanupRef.current?.();
    guardCleanupRef.current = null;
    navigate(
      '/multiplayer',
      true,
      state.room.host_user_id === userId
        ? undefined
        : 'The host closed this room.',
    );
  }, [state, userId]);

  const leaveWaitingRoom = useCallback(
    async (intent: WaitingRoomExitIntent, showDialogError: boolean) => {
      if (exitingRef.current) return;
      setBusy('leave');
      setExitError(null);
      await runWaitingRoomExit({
        pending: exitingRef,
        leave: () => leaveRoom(client, roomId),
        isActive: () => mountedRef.current && !transitionedRef.current,
        onSuccess: () => {
          const destination = intent.destination || '/multiplayer';
          clearExitGuard();
          if (intent.external) {
            window.location.assign(destination);
          } else {
            navigate(destination, true);
          }
        },
        onFailure: () => {
          if (!mountedRef.current) return;
          const message = 'The room could not be left. Try again.';
          if (showDialogError) {
            setExitError(message);
          } else {
            setError(message);
          }
        },
      });
      if (mountedRef.current) setBusy(null);
    },
    [clearExitGuard, client, roomId],
  );

  useEffect(() => {
    guardCleanupRef.current?.();
    guardCleanupRef.current = null;
    if (!waitingMember) return;
    const roomUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    guardCleanupRef.current = installWaitingRoomNavigationGuard({
      roomUrl,
      warnBeforeUnload: exitRequiresConfirmation,
      requestExit: (intent) => {
        setExitError(null);
        if (exitRequiresConfirmation) {
          setExitIntent(intent);
        } else {
          void leaveWaitingRoom(intent, false);
        }
      },
    });
    return () => {
      guardCleanupRef.current?.();
      guardCleanupRef.current = null;
    };
  }, [exitRequiresConfirmation, leaveWaitingRoom, waitingMember]);

  const confirmExit = async () => {
    if (!exitIntent) return;
    await leaveWaitingRoom(exitIntent, true);
  };

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

  const saveWorldSettings = async (room: Room) => {
    await updateRoomSettings(client, room);
  };

  const previewSeed = state?.room.seed;
  const previewTerritoryCount = state?.room.territory_count;
  const previewContinentCount = state?.room.continent_count;
  const previewMaxSeats = state?.room.max_seats;
  const previewGeneratorVersion = state?.room.generator_version;
  const previewPlanet = useMemo(
    () =>
      previewSeed &&
      previewTerritoryCount &&
      previewContinentCount &&
      previewMaxSeats
        ? generateRoomPreviewPlanet({
            seed: previewSeed,
            territory_count: previewTerritoryCount,
            continent_count: previewContinentCount,
            max_seats: previewMaxSeats,
            generator_version: previewGeneratorVersion,
          })
        : null,
    [
      previewSeed,
      previewTerritoryCount,
      previewContinentCount,
      previewMaxSeats,
      previewGeneratorVersion,
    ],
  );

  if (!state || !settings) {
    const entryStatus = directRoomEntryStatus(entryFailure);
    return (
      <StatusScreen
        title={error ? 'Room unavailable' : entryStatus.title}
        message={error ?? entryStatus.message}
      />
    );
  }

  const lobby = roomLobbyPresentation(state.room, userId);
  const { host, waiting, published, settingsEditable } = lobby;
  const directUrl = lobby.join.kind === 'public-link' ? lobby.join.value : null;
  const ownSeat = state.seats.find((seat) => seat.occupant_user_id === userId);
  const roster = buildMultiplayerRosterDisplay(
    state.seats,
    state.members,
    userId,
  );
  const claimedHumanSeats = state.seats.filter(
    (seat) =>
      seat.occupant_user_id !== null && seat.controller_type === 'human',
  ).length;
  const canStart =
    claimedHumanSeats >= 2 && state.room.assignment_mode === 'random';
  const launchPending = isMatchLaunchPending(
    state.room,
    state.match,
    busy === 'start',
  );
  if (!previewPlanet) throw new Error('Room world preview is unavailable.');

  return (
    <GameSetupShell
      eyebrow={`${state.room.visibility === 'public' ? 'Public' : 'Private'} multiplayer room`}
      title="Multiplayer lobby"
      summary={
        <SetupSummary label={`${state.room.name} room summary`}>
          <div className="room-summary-name">
            <span>Game</span>
            <strong>{state.room.name}</strong>
          </div>
          {published && directUrl ? (
            <div className="room-summary-code room-summary-link">
              <span>Direct link</span>
              <a data-testid="room-direct-link" href={directUrl}>
                {directUrl}
              </a>
              <ClipboardCopyButton
                value={directUrl}
                idleLabel="Copy direct link"
                copiedAnnouncement="Direct room link copied."
                failedAnnouncement="Could not copy the direct room link."
              />
            </div>
          ) : (
            <div className="room-summary-code">
              <span>Private room code</span>
              {state.room.join_code ? (
                <>
                  <strong data-testid="room-code">
                    {formatRoomCode(state.room.join_code)}
                  </strong>
                  <ClipboardCopyButton
                    value={formatRoomCode(state.room.join_code)}
                    idleLabel="Copy room code"
                    copiedAnnouncement="Room code copied."
                    failedAnnouncement="Could not copy room code."
                  />
                </>
              ) : (
                <strong>Unavailable</strong>
              )}
            </div>
          )}
          <div className="room-summary-status">
            <span>
              {state.room.status === 'waiting' ? 'Waiting' : state.room.status}{' '}
              · Revision {state.room.revision}
            </span>
            <ConnectionBadge status={connection} />
          </div>
        </SetupSummary>
      }
      roster={
        <MultiplayerRoomRoster
          roster={roster}
          busy={busy !== null}
          waiting={waiting}
          ownSeatIndex={ownSeat?.seat_index ?? null}
          onClaim={(seatIndex) =>
            void act('claim', () => claimSeat(client, roomId, seatIndex))
          }
          onRelease={() =>
            void act('release', () => releaseSeat(client, roomId))
          }
        />
      }
      world={
        <SetupWorldPanel
          title="World settings"
          notice={
            published ? (
              <p>
                This public lobby is published. Its game and world settings are
                permanently locked.
              </p>
            ) : !host ? (
              <p>Only the host can change room settings.</p>
            ) : (
              <p>
                Opening the public lobby locks these settings and allows players
                to join from the public game list or direct link.
              </p>
            )
          }
          onSubmit={(event) => {
            event.preventDefault();
            void act('settings', async () => {
              await saveWorldSettings(settings);
              settingsDirty.current = false;
            });
          }}
          controls={
            published ? (
              <PublicRoomSettingsSummary
                className="published-room-configuration"
                settings={{
                  name: state.room.name,
                  seed: state.room.seed,
                  playerCapacity: state.room.max_seats,
                  territoryCount: state.room.territory_count,
                  continentCount: state.room.continent_count,
                  assignmentMode: state.room.assignment_mode,
                }}
              />
            ) : (
              <>
                <label className="create-game-field multiplayer-room-name-setting">
                  <span>Game name</span>
                  <input
                    value={settings.name}
                    maxLength={60}
                    disabled={!settingsEditable || busy !== null}
                    onChange={(event) => {
                      settingsDirty.current = true;
                      setSettings({ ...settings, name: event.target.value });
                    }}
                  />
                </label>
                <div className="multiplayer-seed-setting">
                  <label>
                    Seed
                    <input
                      value={settings.seed}
                      maxLength={64}
                      disabled={!settingsEditable || busy !== null}
                      onChange={(event) => {
                        settingsDirty.current = true;
                        setSettings({
                          ...settings,
                          seed: event.target.value,
                        });
                      }}
                    />
                  </label>
                  {settingsEditable && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy !== null}
                      aria-busy={busy === 'generate-world'}
                      onClick={() => {
                        if (busyRef.current !== null) return;
                        const generatedSettings = withFreshRoomSeed(settings);
                        settingsDirty.current = true;
                        setSettings(generatedSettings);
                        void act('generate-world', async () => {
                          await saveWorldSettings(generatedSettings);
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
                      disabled={!settingsEditable || busy !== null}
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
                      max={6}
                      value={settings.continent_count}
                      disabled={!settingsEditable || busy !== null}
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
                      disabled={!settingsEditable || busy !== null}
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
                      disabled={!settingsEditable || busy !== null}
                      onChange={(event) => {
                        settingsDirty.current = true;
                        setSettings({
                          ...settings,
                          assignment_mode: event.target.value,
                        });
                      }}
                    >
                      <option value="random">Random</option>
                    </select>
                    <small>Random assignment only in multiplayer.</small>
                  </label>
                </div>
                {settingsEditable && (
                  <button type="submit" disabled={busy !== null}>
                    {busy === 'settings' ? 'Saving…' : 'Save settings'}
                  </button>
                )}
              </>
            )
          }
          preview={<RoomWorldPreview planet={previewPlanet} />}
        />
      }
      actions={
        <>
          {launchPending && (
            <Suspense fallback={null}>
              <MatchLaunchOverlay
                planet={previewPlanet}
                roomName={state.room.name}
              />
            </Suspense>
          )}
          {error && (
            <p
              role="alert"
              className="multiplayer-error multiplayer-page-error"
            >
              {error}
            </p>
          )}
          <footer className="multiplayer-lobby-actions multiplayer-card">
            <div className="multiplayer-lobby-action-status">
              {host && waiting && claimedHumanSeats < 2 && (
                <p className="multiplayer-start-helper">
                  At least 2 players must claim seats before starting.
                </p>
              )}
              {host && waiting && state.room.assignment_mode !== 'random' && (
                <p className="multiplayer-start-helper">
                  Multiplayer player draft is not supported. Choose random
                  assignment.
                </p>
              )}
            </div>
            <div className="multiplayer-lobby-action-buttons">
              <button
                type="button"
                className={host ? 'danger' : 'secondary'}
                disabled={busy !== null}
                onClick={() => {
                  setExitError(null);
                  setExitIntent({
                    destination: '/multiplayer',
                    external: false,
                  });
                }}
              >
                {host ? 'Close Room and Leave' : 'Leave Room'}
              </button>
              {host && waiting && (
                <>
                  {lobby.canPublish && (
                    <button
                      type="button"
                      className="secondary multiplayer-lobby-publish"
                      disabled={busy !== null}
                      onClick={() => {
                        setPublicationError(null);
                        setPublicationOpen(true);
                      }}
                    >
                      Open Public Lobby
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy !== null || !canStart}
                    onClick={() =>
                      void act('start', async () => {
                        const match = await startMatch(client, roomId);
                        clearExitGuard();
                        navigate(`/multiplayer/match/${match.id}`, true);
                      })
                    }
                  >
                    {busy === 'start' ? 'Starting…' : 'Start Match'}
                  </button>
                </>
              )}
            </div>
          </footer>
          {exitIntent && waiting && (
            <Suspense fallback={null}>
              <WaitingRoomExitDialog
                host={host}
                busy={busy === 'leave'}
                error={exitError}
                onCancel={() => {
                  if (busyRef.current !== null || exitingRef.current) return;
                  setExitError(null);
                  setExitIntent(null);
                }}
                onConfirm={() => void confirmExit()}
              />
            </Suspense>
          )}
          {publicationOpen && lobby.canPublish && (
            <Suspense fallback={null}>
              <RoomPublicationController
                client={client}
                roomId={roomId}
                settings={settings}
                isSettingsDirty={() => settingsDirty.current}
                markSettingsClean={() => {
                  settingsDirty.current = false;
                }}
                isMounted={() => mountedRef.current}
                nextRequestSequence={() => ++requestSequence.current}
                isCurrentRequest={(sequence) =>
                  sequence === requestSequence.current
                }
                busy={busy}
                isBusy={() => busyRef.current !== null}
                beginPublishing={() => {
                  if (busyRef.current !== null) return false;
                  busyRef.current = 'publish';
                  setBusy('publish');
                  return true;
                }}
                finishPublishing={() => {
                  if (mountedRef.current) setBusy(null);
                  busyRef.current = null;
                }}
                error={publicationError}
                setPageError={setError}
                setError={setPublicationError}
                setOpen={setPublicationOpen}
                setSettings={setSettings}
                setState={setState}
              />
            </Suspense>
          )}
        </>
      }
    />
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
  const players = createMultiplayerPlayerConfigs(seats);
  const ownSeat = seats.find((seat) => seat.userId === userId);
  if (!ownSeat) throw new Error('Claimed seat membership is required.');
  return {
    planet,
    state: match.state_snapshot as unknown as MatchState,
    players,
    ownPlayerId: ownSeat.playerId,
  };
}

function MatchView({
  matchId,
  userId,
  canReact,
}: {
  matchId: string;
  userId: string;
  canReact: boolean;
}) {
  const client = useMemo(() => getSupabaseClient(), []);
  const [match, setMatch] = useState<MultiplayerMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState('CONNECTING');
  const [completedRoomState, setCompletedRoomState] =
    useState<RoomState | null>(null);
  const [reactionRows, setReactionRows] = useState<MatchEventReactionRow[]>([]);
  const [pendingReactionEventIds, setPendingReactionEventIds] = useState<
    ReadonlySet<string>
  >(new Set());
  const [reactionErrors, setReactionErrors] = useState<
    Readonly<Record<string, string>>
  >({});
  const matchRef = useRef<MultiplayerMatch | null>(null);
  const synchronizationRef = useRef<MatchSynchronization | null>(null);
  const completedRoomStateRef = useRef<RoomState | null>(null);
  const reactionRefreshSequence = useRef(0);
  const pendingReactionEventIdsRef = useRef(new Set<string>());

  const install = useCallback(
    (canonical: MultiplayerMatch) => {
      const snapshots = authoritativeSnapshots(canonical, userId);
      const generatorVersion = resolveGeneratorVersion(
        snapshots.planet.generatorVersion,
      );
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
          generatorVersion,
          assignmentMode: 'random',
        },
        setupDraft: {
          ...current.setupDraft,
          seed: snapshots.planet.seed,
          territoryCount: snapshots.planet.territoryCount,
          continentCount: snapshots.planet.continentCount,
          playerCount: snapshots.players.length,
          generatorVersion,
          assignmentMode: 'random',
        },
        lastActionError: null,
        inspectedTerritoryId:
          current.match?.activePlayerId === snapshots.state.activePlayerId
            ? current.inspectedTerritoryId
            : null,
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

  const dispatch = useCallback(
    async (action: Parameters<typeof submitGameplayCommand>[4]) => {
      const canonical = matchRef.current;
      const synchronization = synchronizationRef.current;
      if (!canonical || !synchronization)
        throw new Error('Reconnecting to the match…');
      const idempotencyKey = crypto.randomUUID();
      try {
        const result = await submitGameplayCommand(
          client,
          matchId,
          canonical.revision,
          idempotencyKey,
          action,
        );
        await synchronization.installAcceptedRevision(
          result.acceptedRevision,
          result.stateFingerprint,
        );
      } catch (requestError) {
        await synchronization.recoverRevisionConflict().catch(() => undefined);
        throw multiplayerError(requestError);
      }
    },
    [client, matchId],
  );

  const refreshReactions = useCallback(async () => {
    const sequence = ++reactionRefreshSequence.current;
    const canonicalRows = await fetchMatchEventReactions(client, matchId);
    if (sequence === reactionRefreshSequence.current) {
      setReactionRows(canonicalRows);
    }
  }, [client, matchId]);

  const setReaction = useCallback(
    (eventId: string, reaction: MatchEventReaction | null) => {
      if (pendingReactionEventIdsRef.current.has(eventId)) return;
      pendingReactionEventIdsRef.current.add(eventId);
      setPendingReactionEventIds(new Set(pendingReactionEventIdsRef.current));
      setReactionErrors((current) => {
        if (!(eventId in current)) return current;
        const next = { ...current };
        delete next[eventId];
        return next;
      });
      void (async () => {
        try {
          await setMatchEventReaction(client, matchId, eventId, reaction);
          await refreshReactions();
        } catch (requestError) {
          await refreshReactions().catch(() => undefined);
          setReactionErrors((current) => ({
            ...current,
            [eventId]: multiplayerError(requestError).message,
          }));
        } finally {
          pendingReactionEventIdsRef.current.delete(eventId);
          setPendingReactionEventIds(
            new Set(pendingReactionEventIdsRef.current),
          );
        }
      })();
    },
    [client, matchId, refreshReactions],
  );

  useEffect(() => {
    let active = true;
    let reactionRefreshTimer: number | null = null;
    const synchronization = new MatchSynchronization({
      client,
      matchId,
      install,
      onError: (requestError) => {
        if (!active) return;
        setError(requestError.message);
        useGameStore.setState({
          lastActionError: {
            code: 'CONTROLLER_LOCKED',
            message: requestError.message,
          },
        });
      },
      onCompleted: (canonical) => {
        void client.removeChannel(channel);
        if (completedRoomStateRef.current?.room.id === canonical.room_id)
          return;
        void fetchRoomState(client, canonical.room_id, false)
          .then((roomState) => {
            if (
              !active ||
              synchronization.current?.id !== canonical.id ||
              synchronization.current.status !== 'completed'
            )
              return;
            completedRoomStateRef.current = roomState;
            setCompletedRoomState(roomState);
          })
          .catch((requestError: unknown) => {
            if (active) setError(multiplayerError(requestError).message);
          });
      },
    });
    synchronizationRef.current = synchronization;
    let channel = subscribeToMatch(
      client,
      matchId,
      (version) => synchronization.realtimeChanged(version),
      (status) => {
        if (!active) return;
        synchronization.realtimeStatus(status);
        setConnection(status);
        useGameStore.setState((current) => ({
          multiplayerSession: current.multiplayerSession
            ? { ...current.multiplayerSession, connection: status }
            : null,
        }));
      },
    );
    let reactionChannel = subscribeToMatchEventReactions(
      client,
      matchId,
      () => {
        if (reactionRefreshTimer !== null) {
          window.clearTimeout(reactionRefreshTimer);
        }
        reactionRefreshTimer = window.setTimeout(
          () => void refreshReactions(),
          40,
        );
      },
      (status) => {
        if (active && status === 'SUBSCRIBED') void refreshReactions();
      },
    );
    void Promise.all([synchronization.bootstrap(), refreshReactions()]);
    const recover = () => {
      synchronization.online();
      void refreshReactions();
    };
    const visibilityChanged = () =>
      synchronization.visibilityChanged(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('online', recover);

    if (import.meta.env.DEV) {
      window.__FUSTIFY_MULTIPLAYER_TEST__ = {
        getRealtimeEventCount: () => matchRef.current?.revision ?? 0,
        refreshCanonical: async () => {
          await Promise.all([
            synchronization.recoverRevisionConflict(),
            refreshReactions(),
          ]);
        },
        interruptRealtime: async () => {
          setConnection('RECONNECTING');
          await Promise.all([
            client.removeChannel(channel),
            client.removeChannel(reactionChannel),
          ]);
          if (synchronization.current?.status !== 'completed') {
            channel = subscribeToMatch(
              client,
              matchId,
              (version) => synchronization.realtimeChanged(version),
              (status) => {
                synchronization.realtimeStatus(status);
                setConnection(status);
              },
            );
          }
          reactionChannel = subscribeToMatchEventReactions(
            client,
            matchId,
            () => void refreshReactions(),
            (status) => {
              if (status === 'SUBSCRIBED') void refreshReactions();
            },
          );
          synchronization.online();
          await refreshReactions();
        },
      };
    }
    return () => {
      active = false;
      if (reactionRefreshTimer !== null) {
        window.clearTimeout(reactionRefreshTimer);
      }
      synchronization.stop();
      if (synchronizationRef.current === synchronization) {
        synchronizationRef.current = null;
      }
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('online', recover);
      delete window.__FUSTIFY_MULTIPLAYER_TEST__;
      void client.removeChannel(channel);
      void client.removeChannel(reactionChannel);
      useGameStore.setState({
        multiplayerSession: null,
        inspectedTerritoryId: null,
      });
    };
  }, [client, install, matchId, refreshReactions]);

  useEffect(() => {
    useGameStore.setState((current) => ({
      multiplayerSession: current.multiplayerSession
        ? { ...current.multiplayerSession, dispatch, connection }
        : null,
    }));
  }, [connection, dispatch, match]);

  const postMatch = useMemo(() => {
    if (!completedRoomState) return undefined;
    const room = completedRoomState.room;
    const member = completedRoomState.members.find(
      (candidate) => candidate.user_id === userId,
    );
    return {
      isHost: room.host_user_id === userId,
      displayName:
        member?.display_name ??
        window.localStorage.getItem('fustify.multiplayer.displayName') ??
        '',
      settings: multiplayerRoomSettingsSchema.parse({
        seed: room.seed,
        territoryCount: room.territory_count,
        continentCount: room.continent_count,
        maxSeats: room.max_seats,
        assignmentMode:
          room.assignment_mode === 'random' ? room.assignment_mode : 'random',
      }),
    };
  }, [completedRoomState, userId]);

  const activityReactions = useMemo<ActivityReactionController>(
    () => ({
      canReact,
      summaries: aggregateMatchEventReactions(reactionRows, userId),
      pendingEventIds: pendingReactionEventIds,
      errors: reactionErrors,
      setReaction,
    }),
    [
      canReact,
      pendingReactionEventIds,
      reactionErrors,
      reactionRows,
      setReaction,
      userId,
    ],
  );

  if (!match) {
    return (
      <StatusScreen
        title={error ? 'Multiplayer match unavailable' : 'Loading match'}
        message={error ?? 'Restoring authoritative match state…'}
      />
    );
  }

  return (
    <Suspense
      fallback={
        <StatusScreen
          title="Loading match"
          message="Preparing the authoritative game view…"
        />
      }
    >
      <MultiplayerGameScene
        matchId={match.id}
        revision={match.revision}
        connection={connection}
        activityReactions={activityReactions}
        renderPostMatchActions={
          match.status === 'completed' && postMatch
            ? (reviewing, onReviewingChange) => (
                <Suspense fallback={null}>
                  <PostMatchActions
                    reviewing={reviewing}
                    isHost={postMatch.isHost}
                    settings={postMatch.settings}
                    createRoom={(settings) => createRoom(client, { settings })}
                    onReviewingChange={onReviewingChange}
                    navigate={navigate}
                  />
                </Suspense>
              )
            : undefined
        }
      />
    </Suspense>
  );
}

export function MultiplayerApp({ userId }: { userId: string }) {
  const [route, setRoute] = useState<Route>(() => currentRoute());

  useEffect(() => {
    const updateRoute = () => setRoute(currentRoute());
    window.addEventListener('popstate', updateRoute);
    return () => window.removeEventListener('popstate', updateRoute);
  }, []);

  if (route.kind === 'room')
    return (
      <RoomView
        key={`${userId}:${route.id}`}
        roomId={route.id}
        userId={userId}
      />
    );
  if (route.kind === 'match')
    return (
      <MatchView key={route.id} matchId={route.id} userId={userId} canReact />
    );
  return <Lobby />;
}
