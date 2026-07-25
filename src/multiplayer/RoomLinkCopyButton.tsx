import { useEffect, useRef, useState } from 'react';

type CopyFeedback = 'idle' | 'copied' | 'failed';

export function RoomLinkCopyButton({ roomUrl }: { roomUrl: string }) {
  const [feedback, setFeedback] = useState<CopyFeedback>('idle');
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

  const copy = async () => {
    const currentOperation = ++operation.current;
    if (resetTimer.current !== null) {
      globalThis.clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
    setFeedback('idle');
    try {
      await navigator.clipboard.writeText(roomUrl);
      if (operation.current !== currentOperation) return;
      setFeedback('copied');
    } catch {
      if (operation.current !== currentOperation) return;
      setFeedback('failed');
    }
    resetTimer.current = globalThis.setTimeout(() => {
      if (operation.current === currentOperation) {
        setFeedback('idle');
        resetTimer.current = null;
      }
    }, 2_000);
  };

  const label =
    feedback === 'copied'
      ? 'Copied!'
      : feedback === 'failed'
        ? 'Copy failed'
        : 'Copy direct link';

  return (
    <>
      <button type="button" className="secondary" onClick={() => void copy()}>
        {label}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {feedback === 'copied'
          ? 'Direct room link copied.'
          : feedback === 'failed'
            ? 'Could not copy the direct room link.'
            : ''}
      </span>
    </>
  );
}
