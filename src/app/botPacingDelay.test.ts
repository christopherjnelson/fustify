import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForBotPacing } from './botPacingDelay';

afterEach(() => {
  vi.useRealTimers();
});

describe('bot presentation pacing wait', () => {
  it('resolves Instant without scheduling a timer', async () => {
    vi.useFakeTimers();
    const signal = new AbortController().signal;

    await expect(waitForBotPacing('instant', signal)).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['fast', 1000],
    ['deliberate', 5000],
  ] as const)('uses the exact %s delay', async (mode, milliseconds) => {
    vi.useFakeTimers();
    let resolved = false;
    const waiting = waitForBotPacing(mode, new AbortController().signal).then(
      () => {
        resolved = true;
      },
    );

    await vi.advanceTimersByTimeAsync(milliseconds - 1);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(resolved).toBe(true);
  });

  it('cancels an old Deliberate wait so Instant or Fast takes effect promptly', async () => {
    vi.useFakeTimers();
    const oldWait = new AbortController();
    const deliberate = waitForBotPacing('deliberate', oldWait.signal);

    await vi.advanceTimersByTimeAsync(400);
    oldWait.abort();
    await expect(deliberate).rejects.toMatchObject({ name: 'AbortError' });
    await expect(
      waitForBotPacing('instant', new AbortController().signal),
    ).resolves.toBeUndefined();

    const fast = waitForBotPacing('fast', new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(fast).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
