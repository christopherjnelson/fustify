import {
  parseLocalMatchSave,
  serializeLocalMatchSave,
  type LocalMatchSave,
  type SaveParseResult,
} from '../core/persistence/saveGame';

export const LOCAL_SAVE_KEY = 'worldseed.local-match';

export function readLocalMatchSave(): SaveParseResult | null {
  const serialized = window.localStorage.getItem(LOCAL_SAVE_KEY);
  return serialized === null ? null : parseLocalMatchSave(serialized);
}

export function writeLocalMatchSave(save: LocalMatchSave): void {
  window.localStorage.setItem(LOCAL_SAVE_KEY, serializeLocalMatchSave(save));
}

export function deleteLocalMatchSave(): void {
  window.localStorage.removeItem(LOCAL_SAVE_KEY);
}
