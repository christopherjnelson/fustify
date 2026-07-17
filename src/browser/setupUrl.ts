import {
  parseWorldSetup,
  serializeWorldSetup,
  type ParsedWorldSetup,
  type WorldSetup,
} from '../core/setup/worldSetup';

export function readSetupFromLocation(): ParsedWorldSetup {
  return parseWorldSetup(window.location.search);
}

export function writeSetupToLocation(
  setup: WorldSetup,
  mode: 'push' | 'replace' = 'push',
): void {
  const url = new URL(window.location.href);
  url.search = serializeWorldSetup(setup, url.searchParams).toString();
  window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', url);
}
