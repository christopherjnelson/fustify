import { useCallback, useEffect, useState } from 'react';

export const TURN_SOUND_STORAGE_KEY = 'fustify.turnSound.enabled';
const PREFERENCE_CHANGE_EVENT = 'fustify:turn-sound-preference-change';

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
let volatilePreference: boolean | undefined;

function browserStorage(): PreferenceStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readTurnSoundPreference(
  storage: PreferenceStorage | null = browserStorage(),
): boolean {
  if (storage === null) return volatilePreference ?? true;
  try {
    const stored = storage.getItem(TURN_SOUND_STORAGE_KEY);
    return stored === null ? (volatilePreference ?? true) : stored !== 'false';
  } catch {
    return volatilePreference ?? true;
  }
}

export function writeTurnSoundPreference(
  enabled: boolean,
  storage: PreferenceStorage | null = browserStorage(),
): void {
  if (storage === null) {
    volatilePreference = enabled;
    return;
  }
  try {
    storage.setItem(TURN_SOUND_STORAGE_KEY, String(enabled));
    volatilePreference = undefined;
  } catch {
    volatilePreference = enabled;
  }
}

export function useTurnSoundPreference(): [
  enabled: boolean,
  setEnabled: (enabled: boolean) => void,
] {
  const [enabled, setEnabledState] = useState(readTurnSoundPreference);

  useEffect(() => {
    const syncPreference = () => setEnabledState(readTurnSoundPreference());
    window.addEventListener('storage', syncPreference);
    window.addEventListener(PREFERENCE_CHANGE_EVENT, syncPreference);
    return () => {
      window.removeEventListener('storage', syncPreference);
      window.removeEventListener(PREFERENCE_CHANGE_EVENT, syncPreference);
    };
  }, []);

  const setEnabled = useCallback((nextEnabled: boolean) => {
    writeTurnSoundPreference(nextEnabled);
    setEnabledState(nextEnabled);
    window.dispatchEvent(new Event(PREFERENCE_CHANGE_EVENT));
  }, []);

  return [enabled, setEnabled];
}
