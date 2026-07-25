import { useEffect, useRef } from 'react';

export type WaitingRoomExitIntent = {
  destination: string;
  external: boolean;
};

// eslint-disable-next-line react-refresh/only-export-components
export function closedRoomLandingNotice(
  hostUserId: string,
  currentUserId: string,
): string | undefined {
  return hostUserId === currentUserId
    ? undefined
    : 'The host closed this room.';
}

// eslint-disable-next-line react-refresh/only-export-components
export async function runWaitingRoomExit({
  pending,
  leave,
  isActive = () => true,
  onSuccess,
  onFailure,
}: {
  pending: { current: boolean };
  leave: () => Promise<void>;
  isActive?: () => boolean;
  onSuccess: () => void;
  onFailure: () => void;
}) {
  if (pending.current) return;
  pending.current = true;
  try {
    await leave();
    if (isActive()) onSuccess();
  } catch {
    if (isActive()) onFailure();
  } finally {
    pending.current = false;
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function waitingRoomExitCopy(host: boolean) {
  return host
    ? {
        title: 'Close Room and Leave?',
        description: 'Leaving will close this room for everyone.',
        action: 'Close Room',
      }
    : {
        title: 'Leave Room?',
        description: 'You will leave this multiplayer room.',
        action: 'Leave Room',
      };
}

export function WaitingRoomExitDialog({
  host,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  host: boolean;
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
  const copy = waitingRoomExitCopy(host);

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
        className="create-game-dialog waiting-room-exit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="waiting-room-exit-title"
        aria-describedby="waiting-room-exit-description"
      >
        <header>
          <div>
            <span className="eyebrow">Multiplayer room</span>
            <h2 id="waiting-room-exit-title">{copy.title}</h2>
          </div>
        </header>
        <div className="waiting-room-exit-body">
          <p id="waiting-room-exit-description">{copy.description}</p>
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
              className={host ? 'danger' : undefined}
              disabled={busy}
              aria-busy={busy}
              onClick={onConfirm}
            >
              {busy ? (host ? 'Closing…' : 'Leaving…') : copy.action}
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function installWaitingRoomNavigationGuard({
  roomUrl,
  requestExit,
}: {
  roomUrl: string;
  requestExit: (intent: WaitingRoomExitIntent) => void;
}) {
  const beforeUnload = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = '';
  };
  const click = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const anchor =
      event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank')
      return;
    const destination = new URL(anchor.href, window.location.href);
    if (destination.href === window.location.href) return;
    event.preventDefault();
    requestExit({
      destination:
        destination.origin === window.location.origin
          ? `${destination.pathname}${destination.search}${destination.hash}`
          : destination.href,
      external: destination.origin !== window.location.origin,
    });
  };
  const popstate = () => {
    const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (destination === roomUrl) return;
    window.history.pushState(null, '', roomUrl);
    requestExit({ destination, external: false });
  };

  window.addEventListener('beforeunload', beforeUnload);
  document.addEventListener('click', click, true);
  window.addEventListener('popstate', popstate);
  return () => {
    window.removeEventListener('beforeunload', beforeUnload);
    document.removeEventListener('click', click, true);
    window.removeEventListener('popstate', popstate);
  };
}
