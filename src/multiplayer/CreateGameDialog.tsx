import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { UserProfile } from '../auth/profileModel';
import { roomNameSchema } from './multiplayerApi';

export type CreateGameInput = {
  name: string;
  maxSeats: number;
};

export function CreateGameDialog({
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

export default CreateGameDialog;
