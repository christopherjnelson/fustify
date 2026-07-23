import { useEffect, useRef, useState } from 'react';

export const ROOM_CODE_COPY_FEEDBACK_MS = 2_000;

export type RoomCodeCopyFeedback = 'idle' | 'copied' | 'failed';

export async function copyRoomCode(
  roomCode: string,
  writeText: (text: string) => Promise<void>,
): Promise<RoomCodeCopyFeedback> {
  try {
    await writeText(roomCode);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function scheduleRoomCodeCopyReset(
  reset: () => void,
): ReturnType<typeof setTimeout> {
  return globalThis.setTimeout(reset, ROOM_CODE_COPY_FEEDBACK_MS);
}

export function RoomCodeCopyControl({
  feedback,
  onCopy,
}: {
  feedback: RoomCodeCopyFeedback;
  onCopy: () => void;
}) {
  const label =
    feedback === 'copied'
      ? 'Copied!'
      : feedback === 'failed'
        ? 'Copy failed'
        : 'Copy room code';
  const announcement =
    feedback === 'copied'
      ? 'Room code copied.'
      : feedback === 'failed'
        ? 'Could not copy room code.'
        : '';

  return (
    <>
      <button type="button" className="secondary" onClick={onCopy}>
        {label}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}

export function RoomCodeCopyButton({ roomCode }: { roomCode: string }) {
  const [feedback, setFeedback] = useState<RoomCodeCopyFeedback>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const operation = useRef(0);

  useEffect(
    () => () => {
      operation.current += 1;
      if (resetTimer.current !== null) {
        globalThis.clearTimeout(resetTimer.current);
      }
    },
    [],
  );

  const handleCopy = async () => {
    const currentOperation = ++operation.current;
    if (resetTimer.current !== null) {
      globalThis.clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
    setFeedback('idle');

    const result = await copyRoomCode(
      roomCode,
      navigator.clipboard.writeText.bind(navigator.clipboard),
    );
    if (currentOperation !== operation.current) return;

    setFeedback(result);
    resetTimer.current = scheduleRoomCodeCopyReset(() => {
      if (currentOperation === operation.current) {
        setFeedback('idle');
        resetTimer.current = null;
      }
    });
  };

  return (
    <RoomCodeCopyControl feedback={feedback} onCopy={() => void handleCopy()} />
  );
}
