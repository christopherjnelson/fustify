import {
  parseLocalMatchSave,
  serializeLocalMatchSave,
  type LocalMatchSave,
  type SaveParseResult,
} from '../core/persistence/saveGame';

export const LOCAL_SAVE_KEY = 'fustify.local-match';
export const LEGACY_LOCAL_SAVE_KEY = 'worldseed.local-match';

export function readLocalMatchSave(): SaveParseResult | null {
  const current = window.localStorage.getItem(LOCAL_SAVE_KEY);
  if (current !== null) return parseLocalMatchSave(current);

  const legacy = window.localStorage.getItem(LEGACY_LOCAL_SAVE_KEY);
  if (legacy === null) return null;
  const parsed = parseLocalMatchSave(legacy);
  if (parsed.ok) window.localStorage.setItem(LOCAL_SAVE_KEY, legacy);
  return parsed;
}

export function writeLocalMatchSave(save: LocalMatchSave): void {
  window.localStorage.setItem(LOCAL_SAVE_KEY, serializeLocalMatchSave(save));
}

export function deleteLocalMatchSave(): void {
  window.localStorage.removeItem(LOCAL_SAVE_KEY);
  window.localStorage.removeItem(LEGACY_LOCAL_SAVE_KEY);
}
