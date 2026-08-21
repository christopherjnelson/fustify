import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  completeCurrentProfile,
  fetchCurrentProfile,
  fetchUsernameOptions,
} from './profileHttpApi';

const profile = {
  user_id: '67f49438-ea1c-4943-bd63-239f4814ef92',
  display_name: 'Atlas',
  avatar_url: null,
  onboarding_completed: false,
  created_at: '2026-08-20T12:00:00.000Z',
  updated_at: '2026-08-20T12:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('profile HTTP API', () => {
  it('loads the caller profile with same-origin credentials', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(profile)));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchCurrentProfile(null)).resolves.toMatchObject({
      displayName: 'Atlas',
    });
    expect(fetch).toHaveBeenCalledWith('/api/profile', {
      credentials: 'same-origin',
      headers: {},
    });
  });

  it('completes a validated profile through PATCH', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ...profile, onboarding_completed: true }),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    await completeCurrentProfile(null, {
      displayName: 'Atlas',
      avatarUrl: null,
    });
    expect(fetch).toHaveBeenCalledWith(
      '/api/profile',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          displayName: 'Atlas',
          avatarUrl: null,
          complete: true,
        }),
      }),
    );
  });

  it('encodes username availability requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ available: true, suggestions: [] })),
      ),
    );
    await expect(fetchUsernameOptions(null, 'Atlas Prime')).resolves.toEqual({
      available: true,
      suggestions: [],
    });
    expect(fetch).toHaveBeenCalledWith(
      '/api/profile/username-options?candidate=Atlas%20Prime',
      expect.any(Object),
    );
  });
});
