import type { Page } from '@playwright/test';

export async function installRegisteredAuthFixture(page: Page) {
  await page.addInitScript(() => {
    const user = {
      id: '10000000-0000-4000-8000-000000000001',
      is_anonymous: false,
      email: 'player@example.test',
      email_confirmed_at: '2026-07-24T08:00:00.000Z',
      user_metadata: {},
      identities: [{ provider: 'email' }],
    };
    const session = {
      access_token: 'permanent-test-token',
      user,
    };
    const profile = {
      user_id: user.id,
      display_name: 'Player One',
      avatar_url: null,
      created_at: '2026-07-24T06:00:00.000Z',
      updated_at: '2026-07-24T06:00:00.000Z',
    };
    const listeners: Array<(event: string, session: unknown) => void> = [];
    const auth = {
      getSession: async () => ({
        data: { session },
        error: null,
      }),
      getUser: async () => ({
        data: { user },
        error: null,
      }),
      getClaims: async () => ({
        data: {
          claims: {
            sub: user.id,
            is_anonymous: false,
          },
        },
        error: null,
      }),
      refreshSession: async () => ({
        data: { session, user },
        error: null,
      }),
      onAuthStateChange: (
        listener: (event: string, session: unknown) => void,
      ) => {
        listeners.push(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                const index = listeners.indexOf(listener);
                if (index >= 0) listeners.splice(index, 1);
              },
            },
          },
        };
      },
    };
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: profile, error: null }),
    };
    const client = {
      auth,
      from: () => query,
      rpc: async (method: string) => ({
        data: method === 'current_user_is_admin' ? false : profile,
        error: null,
      }),
    };

    Object.defineProperty(window, '__FUSTIFY_AUTH_TEST_CLIENT__', {
      configurable: true,
      value: client,
    });
  });
}
