export type WaitingRoomExitIntent = {
  destination: string;
  external: boolean;
};

export function closedRoomLandingNotice(
  hostUserId: string,
  currentUserId: string,
): string | undefined {
  return hostUserId === currentUserId
    ? undefined
    : 'The host closed this room.';
}

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

export function waitingRoomExitCopy(host: boolean) {
  return host
    ? {
        title: 'Close Room and Leave?',
        description: 'Leaving will close this room for everyone.',
        action: 'Close Room',
      }
    : {
        title: 'Release Seat and Leave?',
        description:
          'Leaving will release your seat so another player can claim it.',
        action: 'Leave Room',
      };
}

export function waitingRoomExitRequiresConfirmation(
  host: boolean,
  seated: boolean,
) {
  return host || seated;
}

export function installWaitingRoomNavigationGuard({
  roomUrl,
  requestExit,
  warnBeforeUnload = true,
}: {
  roomUrl: string;
  requestExit: (intent: WaitingRoomExitIntent) => void;
  warnBeforeUnload?: boolean;
}) {
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!warnBeforeUnload) return;
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
