import { useEffect, useMemo, useRef, useState } from 'react';
import {
  detectTurnNotification,
  resolveTurnRecipientIds,
  type TurnBaseline,
  type TurnNotification,
  type TurnObservation,
} from '../notifications/turnNotification';
import {
  readTurnSoundPreference,
  useTurnSoundPreference,
} from '../notifications/turnSoundPreference';
import {
  installTurnSoundUnlock,
  playTurnChime,
} from '../notifications/turnSound';
import {
  dismissStaleTurnNotification,
  presentTurnNotification,
} from '../notifications/turnPresentation';
import { useGameStore } from '../state/useGameStore';

const NOTIFICATION_DURATION_MS = 3_200;

export function TurnSoundToggle() {
  const [enabled, setEnabled] = useTurnSoundPreference();
  return (
    <label className="turn-sound-toggle">
      <span>Turn sound</span>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => setEnabled(event.currentTarget.checked)}
      />
    </label>
  );
}

export function TurnNotificationBanner({
  notification,
}: {
  notification: TurnNotification;
}) {
  return (
    <div
      className="turn-notification"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="turn-notification"
    >
      <span aria-hidden="true">◆</span>
      <strong>{notification.playerName} — your turn</strong>
    </div>
  );
}

export function TurnNotificationController({
  playSound = playTurnChime,
}: {
  playSound?: () => unknown;
}) {
  const mode = useGameStore((state) => state.applicationMode);
  const match = useGameStore((state) => state.match);
  const players = useGameStore((state) => state.matchSetup.players);
  const multiplayerSession = useGameStore((state) => state.multiplayerSession);
  const baselineRef = useRef<TurnBaseline | null>(null);
  const [notification, setNotification] = useState<TurnNotification | null>(
    null,
  );

  const observation = useMemo<TurnObservation | null>(() => {
    const sessionActive =
      mode === 'handoff' || mode === 'playing' || mode === 'game-over';
    if (!sessionActive || match === null) return null;
    const activePlayer = players.find(
      (player) => player.id === match.activePlayerId,
    );
    if (!activePlayer) return null;
    return {
      sessionId: match.matchId,
      turnNumber: match.turnNumber,
      activePlayerId: match.activePlayerId,
      activePlayerName: activePlayer.name,
      phase: match.phase,
      recipientPlayerIds: resolveTurnRecipientIds(
        players,
        multiplayerSession?.ownPlayerId ?? null,
      ),
      revision: multiplayerSession?.revision,
    };
  }, [
    match,
    mode,
    multiplayerSession?.ownPlayerId,
    multiplayerSession?.revision,
    players,
  ]);

  useEffect(() => installTurnSoundUnlock(), []);

  useEffect(() => {
    const result = detectTurnNotification(baselineRef.current, observation);
    baselineRef.current = result.baseline;
    if (result.notification === null) {
      dismissStaleTurnNotification(
        observation === null || observation.phase === 'game-over'
          ? null
          : observation.activePlayerId,
        setNotification,
      );
      return;
    }
    presentTurnNotification(
      result.notification,
      readTurnSoundPreference(),
      setNotification,
      playSound,
    );
  }, [observation, playSound]);

  useEffect(() => {
    if (notification === null) return;
    const timer = window.setTimeout(
      () => setNotification(null),
      NOTIFICATION_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [notification]);

  return notification ? (
    <TurnNotificationBanner notification={notification} />
  ) : null;
}
