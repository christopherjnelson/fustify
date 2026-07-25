import type { RoomState } from './multiplayerApi';

export const ROOM_HEARTBEAT_INTERVAL_MS = 60_000;

export function isWaitingRoomMember(
  state: RoomState | null,
  userId: string,
): boolean {
  return (
    state?.room.status === 'waiting' &&
    state.members.some((member) => member.user_id === userId)
  );
}

export function startRoomHeartbeatScheduler({
  touch,
  reconcile,
}: {
  touch: () => Promise<boolean>;
  reconcile: () => Promise<void>;
}): () => void {
  let stopped = false;
  let pending = false;

  const run = () => {
    if (stopped || pending) return;
    pending = true;
    void touch()
      .then((applicable) => {
        if (!applicable && !stopped) return reconcile();
      })
      .catch(() => {
        if (!stopped) console.warn('Waiting-room heartbeat failed.');
      })
      .finally(() => {
        pending = false;
      });
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') run();
  };

  run();
  const interval = window.setInterval(run, ROOM_HEARTBEAT_INTERVAL_MS);
  window.addEventListener('focus', run);
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    stopped = true;
    window.clearInterval(interval);
    window.removeEventListener('focus', run);
    window.removeEventListener('online', run);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
