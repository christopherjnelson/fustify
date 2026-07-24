import { describe, expect, it, vi } from 'vitest';
import {
  BOT_PACING_STORAGE_KEY,
  DEFAULT_BOT_PACING_MODE,
  readBotPacingPreference,
  writeBotPacingPreference,
} from './botPacingPreference';

function storageDouble(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
  };
}

describe('bot pacing preference', () => {
  it('defaults to Fast and restores every valid persisted mode', () => {
    expect(readBotPacingPreference(storageDouble())).toBe(
      DEFAULT_BOT_PACING_MODE,
    );
    expect(DEFAULT_BOT_PACING_MODE).toBe('fast');

    for (const mode of ['instant', 'fast', 'deliberate'] as const) {
      expect(readBotPacingPreference(storageDouble(mode))).toBe(mode);
    }
  });

  it('falls back safely for invalid values and persists changes', () => {
    expect(readBotPacingPreference(storageDouble('turbo'))).toBe('fast');
    const storage = storageDouble();

    writeBotPacingPreference('deliberate', storage);

    expect(storage.setItem).toHaveBeenCalledWith(
      BOT_PACING_STORAGE_KEY,
      'deliberate',
    );
    expect(readBotPacingPreference(storage)).toBe('deliberate');
  });

  it('retains an in-memory preference when storage access fails', () => {
    const failingStorage = {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked');
      }),
    };

    writeBotPacingPreference('instant', failingStorage);
    expect(readBotPacingPreference(failingStorage)).toBe('instant');

    writeBotPacingPreference('fast', storageDouble());
  });
});
