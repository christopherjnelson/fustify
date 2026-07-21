import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WORLD_SETUP } from '../core/setup/worldSetup';
import { writeSetupToLocation } from './setupUrl';

describe('setup URL synchronization', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not write game setup parameters on the admin route', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: {
        pathname: '/admin',
        href: 'https://example.test/admin',
      },
      history: { pushState: vi.fn(), replaceState },
    });

    writeSetupToLocation(DEFAULT_WORLD_SETUP, 'replace');

    expect(replaceState).not.toHaveBeenCalled();
  });

  it('continues to write deterministic setup parameters on the game route', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: {
        pathname: '/',
        href: 'https://example.test/',
      },
      history: { pushState: vi.fn(), replaceState },
    });

    writeSetupToLocation(DEFAULT_WORLD_SETUP, 'replace');

    expect(replaceState).toHaveBeenCalledOnce();
    expect(String(replaceState.mock.calls[0]?.[2])).toContain(
      `seed=${DEFAULT_WORLD_SETUP.seed}`,
    );
  });
});
