import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

type AuthFixture =
  | 'signed-out'
  | 'guest'
  | 'registered'
  | 'stale-registered'
  | 'slow-registered'
  | 'slow-signed-out'
  | 'missing-profile-recovered'
  | 'missing-profile-error'
  | 'verification-error'
  | 'callback'
  | 'recovery';

async function installAuthFixture(page: Page, fixture: AuthFixture) {
  await page.addInitScript(
    ({ fixtureName }) => {
      const userId = '10000000-0000-4000-8000-000000000001';
      const calls: Array<{ method: string; payload?: unknown }> = [];
      const testState: {
        calls: typeof calls;
        releaseRefresh?: () => void;
        releaseVerification?: () => void;
        invalidateSession?: (emit: boolean) => void;
        rejectRoomActions?: boolean;
      } = { calls };
      const listeners: Array<(event: string, session: unknown) => void> = [];
      let profile = {
        user_id: userId,
        display_name:
          fixtureName === 'guest' ? 'MistyBadger-482' : 'Player One',
        avatar_url: null,
        created_at: '2026-07-24T06:00:00.000Z',
        updated_at: '2026-07-24T06:00:00.000Z',
      };
      let profileExists = !fixtureName.startsWith('missing-profile');
      const explicitlySignedOut =
        window.sessionStorage.getItem('fustify-auth-test-signed-out') === '1';
      let user =
        explicitlySignedOut ||
        ((fixtureName === 'signed-out' || fixtureName === 'slow-signed-out') &&
          window.sessionStorage.getItem('fustify-auth-test-registered') !== '1')
          ? null
          : {
              id: userId,
              is_anonymous: fixtureName === 'guest',
              email:
                fixtureName === 'guest' ? undefined : 'player@example.test',
              email_confirmed_at:
                fixtureName === 'guest'
                  ? undefined
                  : '2026-07-24T08:00:00.000Z',
              user_metadata: {},
            };
      let tokenIsAnonymous =
        fixtureName === 'guest' || fixtureName === 'stale-registered';
      let verificationReleased = !fixtureName.startsWith('slow-');
      let releaseVerification: (() => void) | undefined;
      const verificationBarrier = new Promise<void>((resolve) => {
        releaseVerification = () => {
          verificationReleased = true;
          resolve();
        };
      });
      testState.releaseVerification = releaseVerification;
      testState.invalidateSession = (emit) => {
        user = null;
        tokenIsAnonymous = false;
        window.sessionStorage.setItem('fustify-auth-test-signed-out', '1');
        if (emit) listeners.forEach((listener) => listener('SIGNED_OUT', null));
      };

      const auth = {
        getSession: async () => {
          calls.push({ method: 'getSession' });
          if (!verificationReleased) await verificationBarrier;
          return {
            data: {
              session: user
                ? {
                    access_token: tokenIsAnonymous
                      ? 'anonymous-token'
                      : 'permanent-token',
                    user: {
                      ...user,
                      is_anonymous: tokenIsAnonymous,
                    },
                  }
                : null,
            },
            error: null,
          };
        },
        getUser: async () => {
          calls.push({ method: 'getUser' });
          if (fixtureName === 'verification-error') {
            return {
              data: { user: null },
              error: new Error('simulated Auth service failure'),
            };
          }
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
        getClaims: async (token?: string) => {
          calls.push({ method: 'getClaims' });
          return user
            ? {
                data: {
                  claims: {
                    sub: user.id,
                    is_anonymous:
                      token === 'anonymous-token' || tokenIsAnonymous,
                  },
                },
                error: null,
              }
            : { data: null, error: null };
        },
        refreshSession: async () => {
          calls.push({ method: 'refreshSession' });
          if (!user) {
            return {
              data: { session: null, user: null },
              error: new Error('Auth session missing'),
            };
          }
          const finishRefresh = () => {
            tokenIsAnonymous = false;
            const session = {
              access_token: 'permanent-token',
              user,
            };
            listeners.forEach((listener) =>
              listener('TOKEN_REFRESHED', session),
            );
            return { data: { session, user }, error: null };
          };
          if (fixtureName !== 'stale-registered') return finishRefresh();
          return new Promise((resolve) => {
            testState.releaseRefresh = () => resolve(finishRefresh());
          });
        },
        onAuthStateChange: (
          listener: (event: string, session: unknown) => void,
        ) => {
          calls.push({ method: 'onAuthStateChange' });
          listeners.push(listener);
          return {
            data: {
              subscription: {
                unsubscribe: () => {
                  const index = listeners.indexOf(listener);
                  if (index >= 0) listeners.splice(index, 1);
                  calls.push({ method: 'unsubscribe' });
                },
              },
            },
          };
        },
        signUp: async (payload: unknown) => {
          calls.push({ method: 'signUp', payload });
          return { data: { user: null, session: null }, error: null };
        },
        signInWithPassword: async (payload: unknown) => {
          calls.push({ method: 'signInWithPassword', payload });
          user = {
            id: userId,
            is_anonymous: false,
            email: 'player@example.test',
            email_confirmed_at: '2026-07-24T08:00:00.000Z',
            user_metadata: {},
          };
          tokenIsAnonymous = false;
          window.sessionStorage.setItem('fustify-auth-test-registered', '1');
          window.sessionStorage.removeItem('fustify-auth-test-signed-out');
          listeners.forEach((listener) => listener('SIGNED_IN', { user }));
          return { data: { user, session: { user } }, error: null };
        },
        signInAnonymously: async () => {
          calls.push({ method: 'signInAnonymously' });
          throw new Error('home must not create an anonymous user');
        },
        updateUser: async (payload: Record<string, string>) => {
          calls.push({ method: 'updateUser', payload });
          if (payload.email) return { data: { user }, error: null };
          return { data: { user }, error: null };
        },
        resetPasswordForEmail: async (email: string, options: unknown) => {
          calls.push({
            method: 'resetPasswordForEmail',
            payload: { email, options },
          });
          return { data: {}, error: null };
        },
        exchangeCodeForSession: async (code: string) => {
          calls.push({ method: 'exchangeCodeForSession', payload: { code } });
          window.sessionStorage.setItem(
            'fustify-auth-test-exchange-count',
            String(
              Number(
                window.sessionStorage.getItem(
                  'fustify-auth-test-exchange-count',
                ) ?? '0',
              ) + 1,
            ),
          );
          user = {
            id: userId,
            is_anonymous: false,
            email: 'player@example.test',
            email_confirmed_at: '2026-07-24T08:00:00.000Z',
            user_metadata: {},
          };
          tokenIsAnonymous = false;
          return {
            data: {
              user,
              session: { user },
              redirectType: fixtureName === 'recovery' ? 'recovery' : 'signup',
            },
            error: null,
          };
        },
        signOut: async () => {
          calls.push({ method: 'signOut' });
          user = null;
          tokenIsAnonymous = false;
          window.sessionStorage.removeItem('fustify-auth-test-registered');
          window.sessionStorage.setItem('fustify-auth-test-signed-out', '1');
          listeners.forEach((listener) => listener('SIGNED_OUT', null));
          return { error: null };
        },
      };

      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => query,
        maybeSingle: async () => ({
          data: user && profileExists ? profile : null,
          error: null,
        }),
        then: (
          resolve: (value: { data: (typeof profile)[]; error: null }) => void,
        ) => resolve({ data: user ? [profile] : [], error: null }),
      };
      const client = {
        auth,
        from: () => query,
        rpc: async (method: string, payload?: Record<string, string>) => {
          calls.push({ method, payload });
          if (method === 'ensure_own_profile') {
            if (fixtureName === 'missing-profile-error') {
              return {
                data: null,
                error: { code: 'P0001', message: 'profile_unavailable' },
              };
            }
            profileExists = true;
            return { data: profile, error: null };
          }
          if (
            testState.rejectRoomActions &&
            (method === 'create_room' || method === 'join_room')
          ) {
            return {
              data: null,
              error: { code: 'P0001', message: 'account_required' },
            };
          }
          if (method === 'update_own_profile' && payload) {
            profile = {
              ...profile,
              display_name: payload.p_display_name,
              avatar_url: payload.p_avatar_url || null,
              updated_at: '2026-07-24T09:00:00.000Z',
            };
          }
          if (method === 'create_room' || method === 'join_room') {
            return {
              data: {
                id: '30000000-0000-4000-8000-000000000003',
                join_code: 'TEST-ROOM',
              },
              error: null,
            };
          }
          return { data: profile, error: null };
        },
        channel: (...payload: unknown[]) => {
          calls.push({ method: 'channel', payload });
          return {
            on: () => client.channel(...payload),
            subscribe: () => client.channel(...payload),
            unsubscribe: async () => undefined,
          };
        },
      };
      Object.defineProperty(window, '__FUSTIFY_AUTH_TEST_CLIENT__', {
        configurable: true,
        value: client,
      });
      Object.defineProperty(window, '__FUSTIFY_AUTH_TEST_STATE__', {
        configurable: true,
        value: testState,
      });
    },
    { fixtureName: fixture },
  );
}

async function called(page: Page, method: string) {
  return page.evaluate((expected) => {
    const state = (
      window as typeof window & {
        __FUSTIFY_AUTH_TEST_STATE__: {
          calls: Array<{ method: string; payload?: unknown }>;
        };
      }
    ).__FUSTIFY_AUTH_TEST_STATE__;
    const current = state.calls.filter((call) => call.method === expected);
    if (expected !== 'exchangeCodeForSession' || current.length > 0) {
      return current;
    }
    const persisted = Number(
      window.sessionStorage.getItem('fustify-auth-test-exchange-count') ?? '0',
    );
    return Array.from({ length: persisted }, () => ({ method: expected }));
  }, method);
}

async function protectedResources(page: Page) {
  return page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter(
        (name) =>
          name.includes('/app/App') ||
          name.includes('MultiplayerApp') ||
          name.includes('three'),
      ),
  );
}

async function releaseVerification(page: Page) {
  await page.evaluate(() => {
    (
      window as typeof window & {
        __FUSTIFY_AUTH_TEST_STATE__: { releaseVerification?: () => void };
      }
    ).__FUSTIFY_AUTH_TEST_STATE__.releaseVerification?.();
  });
}

async function invalidateFixtureSession(page: Page, emit: boolean) {
  await page.evaluate((shouldEmit) => {
    (
      window as typeof window & {
        __FUSTIFY_AUTH_TEST_STATE__: {
          invalidateSession?: (emit: boolean) => void;
        };
      }
    ).__FUSTIFY_AUTH_TEST_STATE__.invalidateSession?.(shouldEmit);
  }, emit);
}

async function capture(page: Page, projectName: string, name: string) {
  const path = `test-results/ui-review/${projectName}/${name}.png`;
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true });
}

test('signed-out home registration, login, and recovery stay in the Auth layer', async ({
  page,
}, testInfo) => {
  await installAuthFixture(page, 'signed-out');
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await called(page, 'getUser')).toHaveLength(0);
  expect(await called(page, 'signInAnonymously')).toHaveLength(0);
  expect(
    await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter(
          (name) =>
            name.includes('/app/App') ||
            name.includes('MultiplayerApp') ||
            name.includes('three'),
        ),
    ),
  ).toEqual([]);
  await capture(page, testInfo.project.name, 'account-home-signed-out');

  await page.getByRole('button', { name: 'Account' }).click();
  await page
    .getByRole('dialog', { name: 'Sign in' })
    .getByRole('button', { name: 'Create account' })
    .click();
  const register = page.getByRole('dialog', { name: 'Create account' });
  await expect(register.getByLabel('Display name')).toBeFocused();
  await capture(page, testInfo.project.name, 'account-register-dialog');
  await register.getByLabel('Display name').fill('Player One');
  await register.getByLabel('Email').fill('player@example.test');
  await register.getByLabel('Password', { exact: true }).fill('correct horse');
  await register.getByLabel('Confirm password').fill('correct horse');
  await register.getByRole('button', { name: 'Create account' }).click();
  await expect(register.getByText(/verification link/i)).toBeVisible();
  expect(await called(page, 'signUp')).toHaveLength(1);
  expect(await called(page, 'signInAnonymously')).toHaveLength(0);

  await register.getByRole('button', { name: 'Back to sign in' }).click();
  const signIn = page.getByRole('dialog', { name: 'Sign in' });
  await signIn.getByRole('button', { name: 'Forgot password?' }).click();
  const forgot = page.getByRole('dialog', { name: 'Reset password' });
  await forgot.getByLabel('Email').fill('player@example.test');
  await forgot.getByRole('button', { name: 'Send reset email' }).click();
  await expect(forgot.getByText(/If that account exists/i)).toBeVisible();
  expect(await called(page, 'resetPasswordForEmail')).toHaveLength(1);
});

test('guest controls preserve generated identity and require deliberate switching', async ({
  page,
}, testInfo) => {
  await installAuthFixture(page, 'guest');
  await page.goto('/');
  await expect(page.locator('.account-identity strong')).toHaveText(
    'Finish account setup',
  );
  await expect(page.getByText('Required for gameplay')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit profile' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  await capture(page, testInfo.project.name, 'account-home-guest');

  await page
    .getByRole('button', { name: 'Sign in to existing account' })
    .click();
  const warning = page.getByRole('dialog', {
    name: 'Sign in to another account',
  });
  await expect(warning.getByText(/cannot be recovered/i)).toBeVisible();
  expect(await called(page, 'signOut')).toHaveLength(0);
  await warning
    .getByRole('button', { name: 'Keep guest and create account' })
    .click();
  const upgrade = page.getByRole('dialog', {
    name: 'Finish creating your account',
  });
  await upgrade.getByLabel('Email').fill('new@example.test');
  await upgrade
    .getByRole('button', { name: 'Send verification email' })
    .click();
  await expect(
    upgrade.getByText(/Check your email in this browser/i),
  ).toBeVisible();
  expect(await called(page, 'updateUser')).toHaveLength(1);
  expect(await called(page, 'signOut')).toHaveLength(0);
});

test('registered account can edit its profile and sign out', async ({
  page,
}, testInfo) => {
  await installAuthFixture(page, 'registered');
  await page.goto('/');
  await expect(page.getByText('player@example.test')).toBeVisible();
  await capture(page, testInfo.project.name, 'homepage-registered');
  await page.getByRole('button', { name: 'Edit profile' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit profile' });
  await capture(page, testInfo.project.name, 'account-edit-profile-dialog');
  await edit.getByLabel('Display name').fill('Renamed Player');
  await edit.getByRole('button', { name: 'Save profile' }).click();
  await expect
    .poll(async () => (await called(page, 'update_own_profile')).length)
    .toBe(1);
  await expect(edit.getByText('Profile updated.')).toBeVisible();
  await edit.getByRole('button', { name: 'Close account dialog' }).click();
  await expect(page.getByText('Renamed Player')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.sessionStorage.getItem('fustify-auth-test-signed-out'),
    ),
  ).toBe('1');
  expect(await called(page, 'signInAnonymously')).toHaveLength(0);
});

test('registered home-to-multiplayer navigation keeps one ready account without a signed-out frame', async ({
  page,
}, testInfo) => {
  await installAuthFixture(page, 'registered');
  await page.goto('/');
  await expect(page.getByText('player@example.test')).toBeVisible();
  const listenerCount = (await called(page, 'onAuthStateChange')).length;
  const sessionCheckCount = (await called(page, 'getSession')).length;
  await page.evaluate(() => {
    const headings: string[] = [];
    const record = () => {
      document.querySelectorAll('h1').forEach((heading) => {
        if (heading.textContent) headings.push(heading.textContent);
      });
    };
    new MutationObserver(record).observe(document.body, {
      childList: true,
      subtree: true,
    });
    Object.defineProperty(window, '__FUSTIFY_HEADING_TRACE__', {
      configurable: true,
      value: headings,
    });
  });

  await page.getByRole('link', { name: 'Play Multiplayer' }).click();
  await expect(page).toHaveURL(/\/multiplayer$/);
  await expect(
    page.getByRole('heading', { name: 'Private multiplayer rooms' }),
  ).toBeVisible();
  await expect(page.locator('.account-identity strong')).toHaveText(
    'Player One',
  );
  await expect(page.getByText('Playing as', { exact: true })).toBeVisible();
  await expect(page.locator('.multiplayer-playing-as strong')).toHaveText(
    'Player One',
  );
  await expect(page.locator('.multiplayer-playing-as > div > span')).toHaveText(
    'PO',
  );
  await expect(page.getByLabel('Room display name')).toHaveCount(0);
  await expect(
    page.getByRole('textbox', { name: /name|alias|nickname/iu }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Edit profile' }),
  ).toBeVisible();
  await capture(page, testInfo.project.name, 'account-multiplayer-registered');

  const headings = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __FUSTIFY_HEADING_TRACE__: string[];
        }
      ).__FUSTIFY_HEADING_TRACE__,
  );
  expect(headings).not.toContain('Account required');
  expect(await called(page, 'onAuthStateChange')).toHaveLength(listenerCount);
  expect(await called(page, 'getSession')).toHaveLength(sessionCheckCount);
});

test('slow verification renders only checking and does not import protected code', async ({
  page,
}) => {
  await installAuthFixture(page, 'slow-registered');
  await page.goto('/multiplayer');
  await expect(
    page.getByRole('heading', { name: 'Checking your account…' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Account required' }),
  ).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await protectedResources(page)).toEqual([]);
  expect(await called(page, 'create_room')).toHaveLength(0);
  expect(await called(page, 'join_room')).toHaveLength(0);
  expect(await called(page, 'channel')).toHaveLength(0);

  await releaseVerification(page);
  await expect(
    page.getByRole('heading', { name: 'Private multiplayer rooms' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Account required' }),
  ).toHaveCount(0);
});

test('missing registered profile is recovered before room controls load', async ({
  page,
}) => {
  await installAuthFixture(page, 'missing-profile-recovered');
  await page.goto('/multiplayer');
  await expect(
    page.getByRole('heading', { name: 'Private multiplayer rooms' }),
  ).toBeVisible();
  await expect(page.locator('.multiplayer-playing-as strong')).toHaveText(
    'Player One',
  );
  expect(await called(page, 'ensure_own_profile')).toHaveLength(1);
});

test('unrecoverable registered profile fails closed with a safe profile error', async ({
  page,
}) => {
  await installAuthFixture(page, 'missing-profile-error');
  await page.goto('/multiplayer');
  await expect(
    page.getByRole('heading', { name: 'Profile unavailable' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Your player profile could not be loaded. Please try again.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Private multiplayer rooms' }),
  ).toHaveCount(0);
  expect(await called(page, 'create_room')).toHaveLength(0);
  expect(await called(page, 'join_room')).toHaveLength(0);
});

test('profile identity updates before create and room RPC payload has no alias state', async ({
  page,
}) => {
  await installAuthFixture(page, 'registered');
  await page.goto('/multiplayer');
  await page.getByRole('button', { name: 'Edit profile' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit profile' });
  await edit.getByLabel('Display name').fill('Renamed Player');
  await edit.getByRole('button', { name: 'Save profile' }).click();
  await expect(edit.getByText('Profile updated.')).toBeVisible();
  await edit.getByRole('button', { name: 'Close account dialog' }).click();
  await expect(page.locator('.multiplayer-playing-as strong')).toHaveText(
    'Renamed Player',
  );

  await page.getByRole('button', { name: 'Create private room' }).click();
  await expect
    .poll(async () => (await called(page, 'create_room')).length)
    .toBe(1);
  expect((await called(page, 'create_room'))[0]?.payload).toMatchObject({
    display_name: '',
  });
});

test('join uses only the room code and sends no editable alias state', async ({
  page,
}) => {
  await installAuthFixture(page, 'registered');
  await page.goto('/multiplayer');
  await page.getByLabel('Room code').fill('ABCD-1234');
  await page.getByRole('button', { name: 'Join room' }).click();
  await expect
    .poll(async () => (await called(page, 'join_room')).length)
    .toBe(1);
  expect((await called(page, 'join_room'))[0]?.payload).toEqual({
    join_code: 'ABCD-1234',
    display_name: '',
  });
});

test('direct signed-out navigation remains account-required with zero multiplayer bootstrap', async ({
  page,
}) => {
  await installAuthFixture(page, 'slow-signed-out');
  await page.goto('/multiplayer');
  await expect(
    page.getByRole('heading', { name: 'Checking your account…' }),
  ).toBeVisible();
  await releaseVerification(page);
  await expect(
    page.getByRole('heading', { name: 'Account required' }),
  ).toBeVisible();
  await page.waitForTimeout(100);
  await expect(
    page.getByRole('heading', { name: 'Account required' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Private multiplayer rooms' }),
  ).toHaveCount(0);
  expect(await protectedResources(page)).toEqual([]);
  expect(await called(page, 'create_room')).toHaveLength(0);
  expect(await called(page, 'join_room')).toHaveLength(0);
  expect(await called(page, 'channel')).toHaveLength(0);
});

test('Auth verification errors render retry UI with zero multiplayer bootstrap', async ({
  page,
}) => {
  await installAuthFixture(page, 'verification-error');
  await page.goto('/multiplayer');
  await expect(
    page.getByRole('heading', { name: 'Account session problem' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Retry session verification' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Account required' }),
  ).toHaveCount(0);
  expect(await protectedResources(page)).toEqual([]);
  expect(await called(page, 'create_room')).toHaveLength(0);
  expect(await called(page, 'join_room')).toHaveLength(0);
  expect(await called(page, 'channel')).toHaveLength(0);
});

test('session invalidation unmounts multiplayer and blocks room RPCs', async ({
  page,
}) => {
  await installAuthFixture(page, 'registered');
  await page.goto('/multiplayer');
  await expect(
    page.getByRole('heading', { name: 'Private multiplayer rooms' }),
  ).toBeVisible();

  await invalidateFixtureSession(page, false);
  await page.getByRole('button', { name: 'Create private room' }).click();
  await expect(
    page.getByRole('heading', { name: 'Account required' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Private multiplayer rooms' }),
  ).toHaveCount(0);
  expect(await called(page, 'create_room')).toHaveLength(0);
  expect(await called(page, 'join_room')).toHaveLength(0);

  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Account required' }),
  ).toBeVisible();
  expect(await called(page, 'signInAnonymously')).toHaveLength(0);
});

test('a signed-out Auth event immediately invalidates every protected route consumer', async ({
  page,
}) => {
  await installAuthFixture(page, 'registered');
  await page.goto('/multiplayer');
  await expect(
    page.getByRole('heading', { name: 'Private multiplayer rooms' }),
  ).toBeVisible();

  await invalidateFixtureSession(page, true);
  await expect(
    page.getByRole('heading', { name: 'Account required' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Private multiplayer rooms' }),
  ).toHaveCount(0);
  expect(await called(page, 'create_room')).toHaveLength(0);
  expect(await called(page, 'join_room')).toHaveLength(0);
  expect(await called(page, 'channel')).toHaveLength(0);
});

test('account_required room rejection revalidates and fails closed without retry', async ({
  page,
}) => {
  await installAuthFixture(page, 'registered');
  await page.goto('/multiplayer');
  await expect(
    page.getByRole('heading', { name: 'Private multiplayer rooms' }),
  ).toBeVisible();
  await page.evaluate(() => {
    (
      window as typeof window & {
        __FUSTIFY_AUTH_TEST_STATE__: { rejectRoomActions?: boolean };
      }
    ).__FUSTIFY_AUTH_TEST_STATE__.rejectRoomActions = true;
  });

  await page.getByRole('button', { name: 'Create private room' }).click();
  await expect(
    page.getByRole('heading', { name: 'Account session invalidated' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Private multiplayer rooms' }),
  ).toHaveCount(0);
  expect(await called(page, 'create_room')).toHaveLength(1);
  expect(await called(page, 'join_room')).toHaveLength(0);
  expect(await called(page, 'channel')).toHaveLength(0);
});

test('signed-out gameplay choices and direct protected URLs authenticate before loading gameplay', async ({
  page,
}, testInfo) => {
  await installAuthFixture(page, 'signed-out');
  await page.goto('/');
  await page.getByRole('link', { name: 'Play Single Player' }).click();
  await expect(page).toHaveURL(/\/local$/);
  const localGate = page.getByRole('dialog', { name: 'Sign in' });
  await expect(localGate).toBeVisible();
  expect(
    await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => name.includes('/app/App') || name.includes('three')),
    ),
  ).toEqual([]);
  await localGate.getByLabel('Email').fill('player@example.test');
  await localGate.getByLabel('Password').fill('correct horse');
  await localGate.getByRole('button', { name: 'Sign in' }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose your world' }),
  ).toBeVisible();
  await expect(page.locator('.account-identity strong')).toHaveText(
    'Player One',
  );
  await capture(page, testInfo.project.name, 'account-local-registered');

  await page.evaluate(() => {
    window.sessionStorage.removeItem('fustify-auth-test-registered');
  });
  await page.goto('/multiplayer/room/ABCD-EFGH?view=roster#seat-2');
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
  await expect(page).toHaveURL(
    /\/multiplayer\/room\/ABCD-EFGH\?view=roster#seat-2$/,
  );
  expect(
    await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter(
          (name) => name.includes('MultiplayerApp') || name.includes('three'),
        ),
    ),
  ).toEqual([]);
  const roomGate = page.getByRole('dialog', { name: 'Sign in' });
  await roomGate.getByLabel('Email').fill('player@example.test');
  await roomGate.getByLabel('Password').fill('correct horse');
  await roomGate.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(
    /\/multiplayer\/room\/ABCD-EFGH\?view=roster#seat-2$/,
  );
});

test('legacy anonymous sessions cannot bypass a protected gameplay route', async ({
  page,
}) => {
  await installAuthFixture(page, 'guest');
  await page.goto('/');
  await page.getByRole('link', { name: 'Play Single Player' }).click();
  await expect(page).toHaveURL(/\/local$/);
  await expect(
    page.getByRole('heading', {
      name: 'Finish creating your account to continue',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Finish creating your account' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Choose your world' }),
  ).toHaveCount(0);
  expect(await protectedResources(page)).toEqual([]);
  expect(await called(page, 'create_room')).toHaveLength(0);
  expect(await called(page, 'join_room')).toHaveLength(0);
  expect(await called(page, 'channel')).toHaveLength(0);
});

test('stale upgraded sessions refresh once before loading protected gameplay', async ({
  page,
}) => {
  await installAuthFixture(page, 'stale-registered');
  await page.goto('/multiplayer');
  await expect
    .poll(async () => (await called(page, 'refreshSession')).length)
    .toBe(1);
  expect(
    await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter(
          (name) => name.includes('MultiplayerApp') || name.includes('three'),
        ),
    ),
  ).toEqual([]);
  await page.evaluate(() => {
    (
      window as typeof window & {
        __FUSTIFY_AUTH_TEST_STATE__: { releaseRefresh?: () => void };
      }
    ).__FUSTIFY_AUTH_TEST_STATE__.releaseRefresh?.();
  });
  await expect(
    page.getByRole('heading', { name: 'Private multiplayer rooms' }),
  ).toBeVisible();
  expect(await called(page, 'refreshSession')).toHaveLength(1);
  await expect(
    page.getByRole('heading', { name: 'Account required' }),
  ).toHaveCount(0);

  await page.goto('/local');
  await expect
    .poll(async () => (await called(page, 'refreshSession')).length)
    .toBe(1);
  expect(
    await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => name.includes('/app/App') || name.includes('three')),
    ),
  ).toEqual([]);
  await page.evaluate(() => {
    (
      window as typeof window & {
        __FUSTIFY_AUTH_TEST_STATE__: { releaseRefresh?: () => void };
      }
    ).__FUSTIFY_AUTH_TEST_STATE__.releaseRefresh?.();
  });
  await expect(
    page.getByRole('heading', { name: 'Choose your world' }),
  ).toBeVisible();
  expect(await called(page, 'refreshSession')).toHaveLength(1);
});

test('callback validates locally and password recovery completes without exposing the code', async ({
  page,
}) => {
  await installAuthFixture(page, 'recovery');
  await page.goto('/auth/reset-password?code=recovery-secret');
  await expect(
    page.getByRole('heading', { name: 'Choose a new password' }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/recovery-secret/);
  await page.getByLabel('New password').fill('correct horse');
  await page.getByLabel('Confirm password').fill('correct horse');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(
    page.getByRole('heading', { name: 'Password updated' }),
  ).toBeVisible();
  expect(await called(page, 'exchangeCodeForSession')).toHaveLength(1);
  expect(await called(page, 'updateUser')).toHaveLength(1);
});

test('email confirmation exchanges its PKCE code once and follows a safe return path', async ({
  page,
}) => {
  await installAuthFixture(page, 'callback');
  await page.goto(
    '/auth/callback?code=confirmation-secret&returnPath=%2Flocal%3Fseed%3Dconfirmed%23setup',
  );
  await expect(page).toHaveURL(/\/local\?seed=confirmed#setup$/);
  await expect(page).not.toHaveURL(/confirmation-secret/);
  await expect(
    page.getByRole('heading', { name: 'Choose your world' }),
  ).toBeVisible();
  expect(await called(page, 'exchangeCodeForSession')).toHaveLength(1);
});

test('guest upgrade callback without original browser context stops safely', async ({
  page,
}) => {
  await installAuthFixture(page, 'callback');
  await page.goto(
    '/auth/callback?code=upgrade-secret&intent=guest-email-upgrade',
  );
  await expect(
    page.getByRole('heading', { name: 'Email confirmation problem' }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/original browser/i);
  await expect(page).not.toHaveURL(/upgrade-secret|guest-email-upgrade/);
  expect(await called(page, 'exchangeCodeForSession')).toHaveLength(1);
});
