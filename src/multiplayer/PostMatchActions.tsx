import { useMemo, useState } from 'react';
import { generateReadableWorldSeed } from '../core/generation/readableWorldSeed';
import type { MultiplayerRoomSettings, Room } from './multiplayerApi';
import { createPostMatchRoomCreator } from './postMatchRoomCreator';

export function PostMatchActions({
  reviewing,
  isHost,
  settings,
  createRoom,
  onReviewingChange,
  navigate,
  generateSeed = generateReadableWorldSeed,
}: {
  reviewing: boolean;
  isHost: boolean;
  settings: MultiplayerRoomSettings;
  createRoom: (settings: MultiplayerRoomSettings) => Promise<Room>;
  onReviewingChange: (reviewing: boolean) => void;
  navigate: (path: string) => void;
  generateSeed?: () => string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const creator = useMemo(
    () =>
      createPostMatchRoomCreator({
        settings,
        createRoom,
        generateSeed,
        navigate,
        onPendingChange: setPending,
        onError: setError,
      }),
    [createRoom, generateSeed, navigate, settings],
  );

  return (
    <>
      <div className="victory-actions">
        <button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={() => onReviewingChange(!reviewing)}
        >
          {reviewing ? 'Back to Results' : 'Review World'}
        </button>
        {isHost && (
          <>
            <button
              type="button"
              className="primary"
              disabled={pending}
              aria-busy={pending}
              onClick={() => void creator.rematchSameWorld()}
            >
              {pending ? 'Creating Room…' : 'Rematch Same World'}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={pending}
              aria-busy={pending}
              onClick={() => void creator.generateNewWorld()}
            >
              Generate New World
            </button>
          </>
        )}
        <button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={() => navigate('/multiplayer')}
        >
          Return to Multiplayer
        </button>
      </div>
      {!isHost && (
        <p className="multiplayer-start-helper">
          The host can create the next room and share its new code.
        </p>
      )}
      {error && (
        <p role="alert" className="multiplayer-error">
          {error}
        </p>
      )}
    </>
  );
}
