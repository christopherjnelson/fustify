import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { UserProfile } from '../auth/profileModel';
import { profileInitials } from '../auth/guestName';
import {
  roomNameSchema,
  type PublicRoom,
  type PublicRoomJoin,
  type Room,
} from './multiplayerApi';

export type CreateGameInput = {
  name: string;
  maxSeats: number;
};

export type MultiplayerBrowserServices = {
  createGame: (input: CreateGameInput) => Promise<Room>;
  joinWithCode: (code: string) => Promise<Room>;
  joinPublicGame: (roomId: string) => Promise<PublicRoomJoin>;
  listPublicGames: () => Promise<PublicRoom[]>;
  thumbnailUrl: (path: string, version: number) => string;
  navigate: (path: string) => void;
};

function WorldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.8 12h16.4M12 3.5c2.4 2.3 3.7 5.1 3.7 8.5S14.4 18.2 12 20.5M12 3.5C9.6 5.8 8.3 8.6 8.3 12s1.3 6.2 3.7 8.5" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 4 7.5 20M16.5 4 14 20M4 9h16M3 15h16" />
    </svg>
  );
}

function DecorativeWorld({ className = '' }: { className?: string }) {
  const identifier = useId().replaceAll(':', '');
  const shadeId = `browser-world-shade-${identifier}`;
  const clipId = `browser-world-clip-${identifier}`;
  return (
    <svg
      className={className}
      viewBox="0 0 240 180"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={shadeId} cx="34%" cy="28%">
          <stop offset="0" stopColor="#c7f000" stopOpacity=".22" />
          <stop offset=".55" stopColor="#50606c" stopOpacity=".16" />
          <stop offset="1" stopColor="#050709" stopOpacity=".55" />
        </radialGradient>
        <clipPath id={clipId}>
          <circle cx="120" cy="90" r="58" />
        </clipPath>
      </defs>
      <g opacity=".28">
        {Array.from({ length: 9 }, (_, index) => (
          <path key={`v-${index}`} d={`M${40 + index * 20} 10v160`} />
        ))}
        {Array.from({ length: 7 }, (_, index) => (
          <path key={`h-${index}`} d={`M20 ${30 + index * 20}h200`} />
        ))}
      </g>
      <circle cx="120" cy="90" r="59" className="world-ring" />
      <circle
        cx="120"
        cy="90"
        r="58"
        fill={`url(#${shadeId})`}
        className="world-surface"
      />
      <g clipPath={`url(#${clipId})`} className="world-lines">
        <ellipse cx="120" cy="90" rx="34" ry="58" />
        <ellipse cx="120" cy="90" rx="12" ry="58" />
        <path d="M61 90h118M68 65h104M68 115h104" />
        <path d="m82 57 19-8 16 8 11-4 19 12-5 14-22 4-8 13-23-5-9-16Z" />
        <path d="m121 105 17-8 18 11-7 23-18 12-16-17Z" />
      </g>
    </svg>
  );
}

function CreateGameDialog({
  profile,
  onClose,
  onCreate,
}: {
  profile: UserProfile;
  onClose: () => void;
  onCreate: (input: CreateGameInput) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(false);
  const defaultName = profile.displayName
    ? `${profile.displayName}’s Game`
    : 'New Game';
  const [name, setName] = useState(defaultName);
  const [maxSeats, setMaxSeats] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.querySelector<HTMLElement>('input')?.focus();

    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => {
      window.removeEventListener('keydown', keyboard);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const parsedName = roomNameSchema.safeParse(name || defaultName);
    if (!parsedName.success) {
      setError(parsedName.error.issues[0]?.message ?? 'Enter a game name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        name: parsedName.data,
        maxSeats,
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'The game could not be created. Try again.',
      );
      setBusy(false);
    }
  };

  return (
    <div className="create-game-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="create-game-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-game-title"
      >
        <header>
          <div>
            <span className="eyebrow">New multiplayer room</span>
            <h2 id="create-game-title">Create Game</h2>
          </div>
          <button
            type="button"
            className="create-game-close"
            aria-label="Close create game dialog"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <form onSubmit={(event) => void submit(event)}>
          <label className="create-game-field">
            <span>Game name</span>
            <input
              value={name}
              maxLength={60}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                if (!name.trim()) setName(defaultName);
              }}
              autoComplete="off"
            />
          </label>

          <p className="create-game-private-note">
            New rooms start private. You can tune the world and invite players
            with the room code before opening a permanently locked public lobby.
          </p>

          <label className="create-game-field">
            <span>Maximum players</span>
            <select
              value={maxSeats}
              disabled={busy}
              onChange={(event) => setMaxSeats(Number(event.target.value))}
            >
              {[2, 3, 4, 5].map((count) => (
                <option key={count} value={count}>
                  {count} players
                </option>
              ))}
            </select>
          </label>

          {error && (
            <p className="multiplayer-error" role="alert">
              {error}
            </p>
          )}

          <footer>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? 'Creating…' : 'Create Game'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function PublicRoomThumbnail({
  room,
  thumbnailUrl,
}: {
  room: PublicRoom;
  thumbnailUrl: (path: string, version: number) => string;
}) {
  const [failed, setFailed] = useState(false);
  const path = room.thumbnail_path;
  const source =
    path && !failed ? thumbnailUrl(path, room.thumbnail_version) : null;

  return (
    <div className="public-game-thumbnail">
      {source ? (
        <img
          src={source}
          alt={`${room.room_name} world preview`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="public-game-thumbnail-fallback">
          <DecorativeWorld />
          <span>World preview pending</span>
        </div>
      )}
    </div>
  );
}

function SeatRow({ room }: { room: PublicRoom }) {
  return (
    <div
      className="public-game-seats"
      aria-label={`${room.current_players} of ${room.maximum_players} players`}
    >
      {Array.from({ length: room.maximum_players }, (_, index) => {
        const player = room.players[index];
        return player ? (
          <span
            key={`${player.displayName}-${index}`}
            className="public-game-seat occupied"
            aria-label={player.displayName}
            title={player.displayName}
          >
            {player.avatarUrl ? (
              <img src={player.avatarUrl} alt="" />
            ) : (
              profileInitials(player.displayName)
            )}
          </span>
        ) : (
          <span
            key={`empty-${index}`}
            className="public-game-seat empty"
            aria-label="Empty seat"
          />
        );
      })}
      <span className="public-game-player-count">
        {room.current_players} / {room.maximum_players}
      </span>
    </div>
  );
}

function PublicGameCard({
  room,
  joining,
  onJoin,
  thumbnailUrl,
}: {
  room: PublicRoom;
  joining: boolean;
  onJoin: () => void;
  thumbnailUrl: (path: string, version: number) => string;
}) {
  const full = room.room_state === 'full';
  return (
    <article className="public-game-card">
      <PublicRoomThumbnail
        key={`${room.thumbnail_path ?? 'fallback'}:${room.thumbnail_version}`}
        room={room}
        thumbnailUrl={thumbnailUrl}
      />
      <div className="public-game-info">
        <div className="public-game-title-row">
          <h3>{room.room_name}</h3>
          <span className={`public-game-status ${full ? 'full' : 'waiting'}`}>
            {full ? 'Full' : 'Waiting'}
          </span>
        </div>
        <p>Hosted by {room.host_display_name}</p>
        <dl className="public-game-configuration">
          <div>
            <dt>Seed</dt>
            <dd>{room.room_seed}</dd>
          </div>
          <div>
            <dt>World</dt>
            <dd>
              {room.territory_count} territories · {room.continent_count}{' '}
              continents
            </dd>
          </div>
          <div>
            <dt>Assignment</dt>
            <dd>
              {room.assignment_mode === 'random' ? 'Random' : 'Player draft'}
            </dd>
          </div>
        </dl>
        <SeatRow room={room} />
        <button
          type="button"
          className="secondary public-game-join"
          disabled={full || joining}
          aria-busy={joining}
          onClick={onJoin}
        >
          {full ? 'Full' : joining ? 'Joining…' : 'Join Game'}
        </button>
      </div>
    </article>
  );
}

function LoadingCards() {
  return (
    <div className="public-games-grid" aria-label="Loading public games">
      {[0, 1, 2, 3].map((index) => (
        <div className="public-game-card public-game-skeleton" key={index}>
          <div className="public-game-thumbnail" />
          <div className="public-game-info">
            <i />
            <i />
            <i />
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionPanel({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="multiplayer-browser-action">
      <span className="multiplayer-action-icon">{icon}</span>
      <div className="multiplayer-action-copy">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function MultiplayerBrowser({
  profile,
  services,
  notice = null,
}: {
  profile: UserProfile;
  services: MultiplayerBrowserServices;
  notice?: string | null;
}) {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [listingError, setListingError] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);
  const [joiningCode, setJoiningCode] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [roomActionError, setRoomActionError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const requestSequence = useRef(0);

  const refresh = useCallback(
    async (showLoading = false) => {
      const sequence = ++requestSequence.current;
      if (showLoading) setLoading(true);
      try {
        const publicRooms = await services.listPublicGames();
        if (sequence !== requestSequence.current) return;
        setRooms(publicRooms);
        setListingError(false);
      } catch {
        if (sequence !== requestSequence.current) return;
        console.warn('Public multiplayer room discovery failed.');
        setListingError(true);
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    },
    [services],
  );

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(true), 0);
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 12_000);
    const focus = () => void refresh();
    const visibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(poll);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [refresh]);

  const create = async (input: CreateGameInput) => {
    const room = await services.createGame(input);
    services.navigate(`/multiplayer/room/${room.id}`);
  };

  const joinWithCode = async (event: FormEvent) => {
    event.preventDefault();
    if (joiningCode) return;
    setJoiningCode(true);
    setJoinCodeError(null);
    try {
      const room = await services.joinWithCode(joinCode);
      services.navigate(`/multiplayer/room/${room.id}`);
    } catch (requestError) {
      setJoinCodeError(
        requestError instanceof Error
          ? requestError.message
          : 'That room is unavailable.',
      );
      setJoiningCode(false);
    }
  };

  const joinPublic = async (roomId: string) => {
    if (joiningRoomId) return;
    setJoiningRoomId(roomId);
    setRoomActionError(null);
    try {
      const room = await services.joinPublicGame(roomId);
      services.navigate(`/multiplayer/room/${room.id}`);
    } catch (requestError) {
      setRoomActionError(
        requestError instanceof Error
          ? requestError.message
          : 'That public game is no longer available.',
      );
      setJoiningRoomId(null);
      await refresh();
    }
  };

  return (
    <main className="multiplayer-shell multiplayer-browser">
      <header className="multiplayer-browser-heading">
        <span className="eyebrow">Online play</span>
        <h1>Multiplayer</h1>
        <p>
          Create a game, browse public rooms, or join a private game with a
          code.
        </p>
      </header>

      {notice && (
        <p className="multiplayer-browser-notice" role="status">
          {notice}
        </p>
      )}

      <div className="multiplayer-browser-actions">
        <ActionPanel
          icon={<WorldIcon />}
          title="Create Game"
          description="Start private, finalize the settings, then open the lobby publicly when you are ready."
        >
          <button type="button" onClick={() => setCreateDialogOpen(true)}>
            Create Game
          </button>
        </ActionPanel>

        <ActionPanel icon={<CodeIcon />} title="Join with Code">
          <form onSubmit={(event) => void joinWithCode(event)}>
            <label className="sr-only" htmlFor="multiplayer-room-code">
              Room code
            </label>
            <input
              id="multiplayer-room-code"
              value={joinCode}
              maxLength={16}
              placeholder="Enter room code"
              autoComplete="off"
              spellCheck={false}
              disabled={joiningCode}
              onChange={(event) =>
                setJoinCode(event.target.value.toUpperCase())
              }
            />
            <button
              type="submit"
              className="secondary"
              disabled={joiningCode || !joinCode.trim()}
            >
              {joiningCode ? 'Joining…' : 'Join Game'}
            </button>
          </form>
          {joinCodeError && (
            <p className="multiplayer-action-error" role="alert">
              {joinCodeError}
            </p>
          )}
        </ActionPanel>
      </div>

      <section
        className="public-games-section"
        aria-labelledby="public-games-title"
      >
        <header>
          <div>
            <span className="eyebrow">Open rooms</span>
            <h2 id="public-games-title">Public Games</h2>
          </div>
          {!loading && !listingError && rooms.length > 0 && (
            <span>
              {rooms.length} {rooms.length === 1 ? 'game' : 'games'}
            </span>
          )}
        </header>

        {roomActionError && (
          <p
            className="multiplayer-error public-games-action-error"
            role="alert"
          >
            {roomActionError}
          </p>
        )}

        {loading ? (
          <LoadingCards />
        ) : listingError ? (
          <div className="public-games-message">
            <DecorativeWorld className="public-games-message-art" />
            <h3>Public games could not be loaded</h3>
            <p>Create a game or join with a code while we try again.</p>
            <button
              type="button"
              className="secondary"
              onClick={() => void refresh(true)}
            >
              Try Again
            </button>
          </div>
        ) : rooms.length === 0 ? (
          <div className="public-games-message public-games-empty">
            <DecorativeWorld className="public-games-message-art" />
            <h3>No public games are waiting</h3>
            <p>
              Create a private room, finalize it, then open its public lobby.
            </p>
            <button type="button" onClick={() => setCreateDialogOpen(true)}>
              Create Game
            </button>
          </div>
        ) : (
          <div className="public-games-grid">
            {rooms.map((room) => (
              <PublicGameCard
                key={room.room_id}
                room={room}
                joining={joiningRoomId === room.room_id}
                thumbnailUrl={services.thumbnailUrl}
                onJoin={() => void joinPublic(room.room_id)}
              />
            ))}
          </div>
        )}
      </section>

      {createDialogOpen && (
        <CreateGameDialog
          profile={profile}
          onClose={() => setCreateDialogOpen(false)}
          onCreate={create}
        />
      )}
    </main>
  );
}
