import { useEffect, useRef } from 'react';
import { playerColorValue } from '../core/setup/playerConfig';
import { useGameStore } from '../state/useGameStore';

export function HandoffScreen() {
  const match = useGameStore((state) => state.match)!;
  const players = useGameStore((state) => state.matchSetup.players);
  const summary = useGameStore((state) => state.handoffSummary);
  const begin = useGameStore((state) => state.beginTurn);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const player = players.find((item) => item.id === match.activePlayerId)!;

  useEffect(() => buttonRef.current?.focus(), []);

  return (
    <div
      className="handoff-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.preventDefault();
        if (event.key === 'Tab') {
          event.preventDefault();
          buttonRef.current?.focus();
        }
      }}
    >
      <section className="handoff-card">
        <span
          className="handoff-token"
          style={{ color: playerColorValue(player.colorId) }}
          aria-hidden="true"
        >
          ◆
        </span>
        <span className="eyebrow">Turn {match.turnNumber} handoff</span>
        <h1 id="handoff-title">Pass the device to {player.name}</h1>
        <p>When the correct player is ready, begin the turn.</p>
        {summary.messages.length > 0 && (
          <div className="handoff-summary">
            <strong>Previous turn</strong>
            <ul>
              {summary.messages.map((message, index) => (
                <li key={`${index}-${message}`}>{message}</li>
              ))}
            </ul>
          </div>
        )}
        <button
          ref={buttonRef}
          type="button"
          onClick={begin}
          aria-label={`Begin turn ${match.turnNumber} for ${player.name}`}
        >
          Begin turn
        </button>
      </section>
    </div>
  );
}
