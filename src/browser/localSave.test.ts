import { beforeEach, describe, expect, it, vi } from 'vitest';

const { parseLocalMatchSave } = vi.hoisted(() => ({
  parseLocalMatchSave: vi.fn(),
}));

vi.mock('../core/persistence/saveGame', () => ({
  parseLocalMatchSave,
  serializeLocalMatchSave: vi.fn(() => 'serialized-current-save'),
}));

import {
  LEGACY_LOCAL_SAVE_KEY,
  LOCAL_SAVE_KEY,
  deleteLocalMatchSave,
  readLocalMatchSave,
  writeLocalMatchSave,
} from './localSave';

function storageDouble(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    values,
  };
}

describe('local save branding compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers the Fustify key when both save slots exist', () => {
    const localStorage = storageDouble({
      [LOCAL_SAVE_KEY]: 'current',
      [LEGACY_LOCAL_SAVE_KEY]: 'legacy',
    });
    vi.stubGlobal('window', { localStorage });
    parseLocalMatchSave.mockReturnValue({ ok: true, save: {} });

    readLocalMatchSave();

    expect(parseLocalMatchSave).toHaveBeenCalledWith('current');
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('validates and copies a legacy Worldseed save to the Fustify key', () => {
    const localStorage = storageDouble({ [LEGACY_LOCAL_SAVE_KEY]: 'legacy' });
    vi.stubGlobal('window', { localStorage });
    parseLocalMatchSave.mockReturnValue({ ok: true, save: {}, migrated: true });

    expect(readLocalMatchSave()).toMatchObject({ ok: true });
    expect(localStorage.setItem).toHaveBeenCalledWith(LOCAL_SAVE_KEY, 'legacy');
    expect(localStorage.values.get(LEGACY_LOCAL_SAVE_KEY)).toBe('legacy');
  });

  it('does not copy an invalid legacy save', () => {
    const localStorage = storageDouble({ [LEGACY_LOCAL_SAVE_KEY]: 'invalid' });
    vi.stubGlobal('window', { localStorage });
    parseLocalMatchSave.mockReturnValue({ ok: false, error: 'invalid' });

    expect(readLocalMatchSave()).toEqual({ ok: false, error: 'invalid' });
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('writes the current key and deletes both branded slots', () => {
    const localStorage = storageDouble();
    vi.stubGlobal('window', { localStorage });

    writeLocalMatchSave({} as never);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      LOCAL_SAVE_KEY,
      'serialized-current-save',
    );
    deleteLocalMatchSave();
    expect(localStorage.removeItem).toHaveBeenCalledWith(LOCAL_SAVE_KEY);
    expect(localStorage.removeItem).toHaveBeenCalledWith(LEGACY_LOCAL_SAVE_KEY);
  });
});
