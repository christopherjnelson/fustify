import type { TurnNotification } from './turnNotification';

export function presentTurnNotification(
  notification: TurnNotification,
  soundEnabled: boolean,
  showNotification: (notification: TurnNotification) => void,
  playSound: () => unknown,
): void {
  showNotification(notification);
  if (!soundEnabled) return;
  try {
    void Promise.resolve(playSound()).catch(() => undefined);
  } catch {
    // The visual notification remains available when browser audio fails.
  }
}

export function dismissStaleTurnNotification(
  activePlayerId: string | null,
  updateNotification: (
    transform: (current: TurnNotification | null) => TurnNotification | null,
  ) => void,
): void {
  updateNotification((current) =>
    current !== null &&
    (activePlayerId === null || current.playerId !== activePlayerId)
      ? null
      : current,
  );
}
