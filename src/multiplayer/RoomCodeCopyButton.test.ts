import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  copyRoomCode,
  ROOM_CODE_COPY_FEEDBACK_MS,
  RoomCodeCopyControl,
  scheduleRoomCodeCopyReset,
} from './RoomCodeCopyButton';

describe('room code copy control', () => {
  it('copies the formatted room code and renders visible, accessible success feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(copyRoomCode('ABCD-1234', writeText)).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('ABCD-1234');

    const markup = renderToStaticMarkup(
      createElement(RoomCodeCopyControl, {
        feedback: 'copied',
        onCopy: () => undefined,
      }),
    );
    expect(markup).toContain('Copied!');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('Room code copied.');
  });

  it('returns to the normal state after the feedback interval', () => {
    vi.useFakeTimers();
    const reset = vi.fn();
    scheduleRoomCodeCopyReset(reset);

    vi.advanceTimersByTime(ROOM_CODE_COPY_FEEDBACK_MS - 1);
    expect(reset).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reset).toHaveBeenCalledOnce();
    vi.useRealTimers();

    const markup = renderToStaticMarkup(
      createElement(RoomCodeCopyControl, {
        feedback: 'idle',
        onCopy: () => undefined,
      }),
    );
    expect(markup).toContain('Copy room code');
    expect(markup).not.toContain('Copied!');
  });

  it('does not show false success when clipboard writing is rejected', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));

    await expect(copyRoomCode('ABCD-1234', writeText)).resolves.toBe('failed');

    const markup = renderToStaticMarkup(
      createElement(RoomCodeCopyControl, {
        feedback: 'failed',
        onCopy: () => undefined,
      }),
    );
    expect(markup).toContain('Copy failed');
    expect(markup).toContain('Could not copy room code.');
    expect(markup).not.toContain('Copied!');
  });
});
