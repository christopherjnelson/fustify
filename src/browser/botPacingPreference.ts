import { useCallback, useEffect, useState } from 'react';

export type BotPacingMode = 'instant' | 'fast' | 'deliberate';

export const BOT_PACING_DELAYS_MS = {
  instant: 0,
  fast: 1000,
  deliberate: 5000,
} as const satisfies Record<BotPacingMode, number>;

export const DEFAULT_BOT_PACING_MODE: BotPacingMode = 'fast';
export const BOT_PACING_STORAGE_KEY = 'fustify.botPacing.mode';
const PREFERENCE_CHANGE_EVENT = 'fustify:bot-pacing-preference-change';

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
let volatilePreference: BotPacingMode | undefined;

function isBotPacingMode(value: unknown): value is BotPacingMode {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(BOT_PACING_DELAYS_MS, value)
  );
}

function browserStorage(): PreferenceStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readBotPacingPreference(
  storage: PreferenceStorage | null = browserStorage(),
): BotPacingMode {
  if (storage === null) return volatilePreference ?? DEFAULT_BOT_PACING_MODE;
  try {
    const stored = storage.getItem(BOT_PACING_STORAGE_KEY);
    if (stored === null) return volatilePreference ?? DEFAULT_BOT_PACING_MODE;
    return isBotPacingMode(stored) ? stored : DEFAULT_BOT_PACING_MODE;
  } catch {
    return volatilePreference ?? DEFAULT_BOT_PACING_MODE;
  }
}

export function writeBotPacingPreference(
  mode: BotPacingMode,
  storage: PreferenceStorage | null = browserStorage(),
): void {
  if (storage === null) {
    volatilePreference = mode;
    return;
  }
  try {
    storage.setItem(BOT_PACING_STORAGE_KEY, mode);
    volatilePreference = undefined;
  } catch {
    volatilePreference = mode;
  }
}

export function useBotPacingPreference(): [
  mode: BotPacingMode,
  setMode: (mode: BotPacingMode) => void,
] {
  const [mode, setModeState] = useState(readBotPacingPreference);

  useEffect(() => {
    const syncPreference = () => setModeState(readBotPacingPreference());
    window.addEventListener('storage', syncPreference);
    window.addEventListener(PREFERENCE_CHANGE_EVENT, syncPreference);
    return () => {
      window.removeEventListener('storage', syncPreference);
      window.removeEventListener(PREFERENCE_CHANGE_EVENT, syncPreference);
    };
  }, []);

  const setMode = useCallback((nextMode: BotPacingMode) => {
    writeBotPacingPreference(nextMode);
    setModeState(nextMode);
    window.dispatchEvent(new Event(PREFERENCE_CHANGE_EVENT));
  }, []);

  return [mode, setMode];
}
