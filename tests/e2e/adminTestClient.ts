import type { Page } from '@playwright/test';

export type AdminAuthFixture =
  | 'signed-out'
  | 'non-admin'
  | 'admin'
  | 'admin-check-error'
  | 'admin-check-pending';

export async function installAdminAuthFixture(
  page: Page,
  fixture: AdminAuthFixture,
) {
  await page.addInitScript(
    ({ fixtureName }) => {
      type Listener = (event: string, session: unknown) => void;
      const firstUserId = 'f1000000-0000-4000-8000-000000000001';
      const secondUserId = 'f2000000-0000-4000-8000-000000000002';
      const listeners: Listener[] = [];
      const calls: string[] = [];
      let userId = firstUserId;
      let signedIn = fixtureName !== 'signed-out';
      let admin =
        fixtureName === 'admin' || fixtureName === 'admin-check-pending';
      let adminCheckFails = fixtureName === 'admin-check-error';
      let releaseAdminCheck: (() => void) | undefined;
      const adminCheckBarrier = new Promise<void>((resolve) => {
        releaseAdminCheck = resolve;
      });
      let adminCheckPending = fixtureName === 'admin-check-pending';

      const currentUser = () =>
        signedIn
          ? {
              id: userId,
              is_anonymous: false,
              email: `${userId === firstUserId ? 'first' : 'second'}@example.test`,
              email_confirmed_at: '2026-07-25T12:00:00.000Z',
              user_metadata: {},
              identities: [{ provider: 'email' }],
            }
          : null;
      const session = () => {
        const user = currentUser();
        return user ? { access_token: `token-${user.id}`, user } : null;
      };
      const profile = () => ({
        user_id: userId,
        display_name: userId === firstUserId ? 'First Player' : 'Second Player',
        avatar_url: null,
        created_at: '2026-07-25T12:00:00.000Z',
        updated_at: '2026-07-25T12:00:00.000Z',
      });

      const testState = {
        calls,
        releaseAdminCheck: () => {
          adminCheckPending = false;
          releaseAdminCheck?.();
        },
        allowAdminCheckRetry: () => {
          adminCheckFails = false;
        },
        switchToNonAdmin: () => {
          userId = secondUserId;
          admin = false;
          const nextSession = session();
          listeners.forEach((listener) => listener('SIGNED_IN', nextSession));
        },
        signOut: () => {
          signedIn = false;
          admin = false;
          listeners.forEach((listener) => listener('SIGNED_OUT', null));
        },
      };

      const auth = {
        getSession: async () => ({
          data: { session: session() },
          error: null,
        }),
        getUser: async () => {
          const user = currentUser();
          return user
            ? { data: { user }, error: null }
            : {
                data: { user: null },
                error: {
                  name: 'AuthSessionMissingError',
                  message: 'Auth session missing',
                },
              };
        },
        getClaims: async () => ({
          data: signedIn
            ? {
                claims: {
                  sub: userId,
                  is_anonymous: false,
                },
              }
            : null,
          error: null,
        }),
        refreshSession: async () => ({
          data: { session: session(), user: currentUser() },
          error: null,
        }),
        onAuthStateChange: (listener: Listener) => {
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
        signOut: async () => {
          testState.signOut();
          return { error: null };
        },
      };
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => query,
        maybeSingle: async () => ({
          data: signedIn ? profile() : null,
          error: null,
        }),
        then: (
          resolve: (result: {
            data: ReturnType<typeof profile>[];
            error: null;
          }) => void,
        ) => resolve({ data: signedIn ? [profile()] : [], error: null }),
      };
      const client = {
        auth,
        from: () => query,
        rpc: async (method: string) => {
          calls.push(method);
          if (method === 'current_user_is_admin') {
            if (adminCheckPending) await adminCheckBarrier;
            if (adminCheckFails) {
              return {
                data: null,
                error: new Error('private authorization detail'),
              };
            }
            return { data: admin, error: null };
          }
          if (method === 'admin_dashboard_overview') {
            return {
              data: [
                {
                  generated_at: '2026-07-25T17:00:00.000Z',
                  registered_accounts: 14,
                  public_waiting_rooms: 3,
                  private_waiting_rooms: 2,
                  active_matches: 4,
                  total_matches: 18,
                  public_waiting_with_thumbnail: 2,
                  public_waiting_missing_thumbnail: 1,
                },
              ],
              error: null,
            };
          }
          if (method === 'admin_recent_rooms') {
            return {
              data: [
                {
                  room_name: 'Authorized Room',
                  visibility: 'public',
                  host_display_name: 'First Player',
                  current_members: 3,
                  claimed_seats: 2,
                  maximum_players: 5,
                  room_state: 'waiting',
                  thumbnail_available: true,
                  generator_version: 4,
                  created_at: '2026-07-25T16:00:00.000Z',
                  updated_at: '2026-07-25T16:30:00.000Z',
                },
              ],
              error: null,
            };
          }
          return { data: profile(), error: null };
        },
      };

      Object.defineProperty(window, '__FUSTIFY_AUTH_TEST_CLIENT__', {
        configurable: true,
        value: client,
      });
      Object.defineProperty(window, '__FUSTIFY_ADMIN_TEST_STATE__', {
        configurable: true,
        value: testState,
      });
    },
    { fixtureName: fixture },
  );
}
