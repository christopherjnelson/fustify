import {
  BOT_PACING_DELAYS_MS,
  type BotPacingMode,
} from '../browser/botPacingPreference';

export function waitForBotPacing(
  mode: BotPacingMode,
  signal: AbortSignal,
): Promise<void> {
  const milliseconds = BOT_PACING_DELAYS_MS[mode];
  if (milliseconds === 0) return Promise.resolve();
  if (signal.aborted) {
    return Promise.reject(
      new DOMException('Bot action canceled.', 'AbortError'),
    );
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Bot action canceled.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
