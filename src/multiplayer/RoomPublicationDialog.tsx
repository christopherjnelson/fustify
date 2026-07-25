import { useEffect, useRef } from 'react';

export function RoomPublicationDialog({
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    busyRef.current = busy;
    onCancelRef.current = onCancel;
  }, [busy, onCancel]);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
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
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, []);

  return (
    <div className="create-game-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="create-game-dialog room-publication-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-publication-title"
        aria-describedby="room-publication-description"
      >
        <header>
          <div>
            <span className="eyebrow">Public multiplayer</span>
            <h2 id="room-publication-title">Open Public Lobby?</h2>
          </div>
        </header>
        <div className="room-publication-body">
          <p id="room-publication-description">
            This cannot be undone. The game name and all world, capacity, and
            assignment settings will be permanently locked.
          </p>
          <p>
            Players will be able to join from the public game list or the direct
            room link. The private room code will stop working.
          </p>
          {error && (
            <p className="multiplayer-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button
              ref={cancelRef}
              type="button"
              className="secondary"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              aria-busy={busy}
              onClick={onConfirm}
            >
              {busy ? 'Opening…' : 'Open Public Lobby'}
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}
