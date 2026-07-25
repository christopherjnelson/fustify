import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { createPrivateMultiplayerGame } from './helpers';

const credentialPaths = [
  '.fustify/hosted-auth-acceptance.env',
  '.fustify/reports/hosted-auth-acceptance.env',
];
const credentialsPath = credentialPaths.find((path) => existsSync(path));

test.use({ screenshot: 'off', trace: 'off' });

function hostedCredentials() {
  if (!credentialsPath) {
    throw new Error('hosted_auth_acceptance_credentials_missing');
  }
  const values = new Map<string, string>();
  for (const line of readFileSync(credentialsPath, 'utf8').split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const raw = trimmed.slice(separator + 1).trim();
    values.set(key, raw.replace(/^(['"])(.*)\1$/u, '$2'));
  }
  const email = values.get('FUSTIFY_ACCEPTANCE_EMAIL');
  const password = values.get('FUSTIFY_ACCEPTANCE_PASSWORD');
  if (!email || !password) {
    throw new Error('hosted_auth_acceptance_credentials_missing');
  }
  return { email, password };
}

test.describe('hosted account boundary acceptance', () => {
  test.skip(
    !credentialsPath,
    'Hosted acceptance credentials are not available.',
  );

  test('authenticated home click reaches multiplayer without Account Required and closes its room', async ({
    page,
  }) => {
    const credentials = hostedCredentials();
    let roomCreated = false;
    let originalDisplayName: string | null = null;
    let profileRenamed = false;
    let testError: unknown;

    try {
      await page.goto('/');
      await page.getByRole('button', { name: 'Account' }).click();
      const signIn = page.getByRole('dialog', { name: 'Sign in' });
      await signIn.getByLabel('Email').fill(credentials.email);
      await signIn.getByLabel('Password').fill(credentials.password);
      await signIn.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/$/);
      originalDisplayName =
        (
          await page.locator('.account-identity strong').textContent()
        )?.trim() ?? null;
      expect(originalDisplayName).toBeTruthy();

      await page.evaluate(() => {
        const headings: string[] = [];
        const record = () => {
          document.querySelectorAll('h1').forEach((heading) => {
            const text = heading.textContent?.trim();
            if (text) headings.push(text);
          });
        };
        new MutationObserver(record).observe(document.body, {
          childList: true,
          subtree: true,
        });
        Object.defineProperty(window, '__FUSTIFY_HOSTED_HEADING_TRACE__', {
          configurable: true,
          value: headings,
        });
      });

      await page.getByRole('link', { name: 'Play Multiplayer' }).click();
      await expect(page).toHaveURL(/\/multiplayer$/);
      await expect(
        page.getByRole('heading', { name: 'Multiplayer' }),
      ).toBeVisible();
      await expect(page.locator('.account-identity strong')).toHaveText(
        originalDisplayName!,
      );
      await expect(page.getByLabel('Room display name')).toHaveCount(0);
      await expect(page.locator('.multiplayer-playing-as')).toHaveCount(0);
      expect(
        await page.evaluate(
          () =>
            (
              window as typeof window & {
                __FUSTIFY_HOSTED_HEADING_TRACE__: string[];
              }
            ).__FUSTIFY_HOSTED_HEADING_TRACE__,
        ),
      ).not.toContain('Account required');

      await createPrivateMultiplayerGame(page);
      roomCreated = true;
      await expect(page).toHaveURL(/\/multiplayer\/room\/[0-9a-f-]+$/iu);
      await expect(
        page.getByRole('heading', { name: 'Multiplayer lobby' }),
      ).toBeVisible();
      await expect(
        page
          .getByLabel('In room without a seat')
          .getByText(originalDisplayName!, { exact: true }),
      ).toBeVisible();
      await expect(page.locator('.account-identity strong')).toHaveText(
        originalDisplayName!,
      );

      await page.getByRole('button', { name: 'Close room' }).click();
      await expect(page.getByText(/Closed · Revision/iu)).toBeVisible();
      await page.getByRole('button', { name: 'Leave room' }).click();
      roomCreated = false;
      await expect(page).toHaveURL(/\/multiplayer$/);
      await expect(
        page.getByRole('heading', { name: 'Multiplayer' }),
      ).toBeVisible();

      const updatedDisplayName = `Acceptance Player ${Date.now()
        .toString()
        .slice(-6)}`;
      await page.evaluate(() =>
        window.dispatchEvent(new Event('fustify:open-profile-editor')),
      );
      let edit = page.getByRole('dialog', { name: 'Edit profile' });
      await edit.getByLabel('Display name').fill(updatedDisplayName);
      await edit.getByRole('button', { name: 'Save profile' }).click();
      await expect(edit.getByText('Profile updated.')).toBeVisible();
      profileRenamed = true;
      await edit.getByRole('button', { name: 'Close account dialog' }).click();
      await expect(page.locator('.account-identity strong')).toHaveText(
        updatedDisplayName,
      );

      await createPrivateMultiplayerGame(page);
      roomCreated = true;
      await expect(page).toHaveURL(/\/multiplayer\/room\/[0-9a-f-]+$/iu);
      await expect(
        page
          .getByLabel('In room without a seat')
          .getByText(updatedDisplayName, { exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Close room' }).click();
      await expect(page.getByText(/Closed · Revision/iu)).toBeVisible();
      await page.getByRole('button', { name: 'Leave room' }).click();
      roomCreated = false;
      await expect(page).toHaveURL(/\/multiplayer$/);

      await page.evaluate(() =>
        window.dispatchEvent(new Event('fustify:open-profile-editor')),
      );
      edit = page.getByRole('dialog', { name: 'Edit profile' });
      await edit.getByLabel('Display name').fill(originalDisplayName!);
      await edit.getByRole('button', { name: 'Save profile' }).click();
      await expect(edit.getByText('Profile updated.')).toBeVisible();
      profileRenamed = false;
      await edit.getByRole('button', { name: 'Close account dialog' }).click();
      await expect(page.locator('.account-identity strong')).toHaveText(
        originalDisplayName!,
      );
    } catch (error) {
      testError = error;
    }

    if (roomCreated && /\/multiplayer\/room\//u.test(page.url())) {
      const closeRoom = page.getByRole('button', { name: 'Close room' });
      if (await closeRoom.isVisible().catch(() => false)) {
        await closeRoom.click().catch(() => undefined);
      }
      const leaveRoom = page.getByRole('button', { name: 'Leave room' });
      if (await leaveRoom.isVisible().catch(() => false)) {
        await leaveRoom.click().catch(() => undefined);
      }
    }
    if (profileRenamed && originalDisplayName) {
      if (!/\/multiplayer$/u.test(page.url())) {
        await page.goto('/multiplayer').catch(() => undefined);
      }
      await page
        .evaluate(() =>
          window.dispatchEvent(new Event('fustify:open-profile-editor')),
        )
        .catch(() => undefined);
      const edit = page.getByRole('dialog', { name: 'Edit profile' });
      if (await edit.isVisible().catch(() => false)) {
        await edit
          .getByLabel('Display name')
          .fill(originalDisplayName)
          .catch(() => undefined);
        await edit
          .getByRole('button', { name: 'Save profile' })
          .click()
          .catch(() => undefined);
      }
    }
    if (testError) throw testError;
  });

  test('fresh unauthenticated context never loads multiplayer services', async ({
    page,
  }) => {
    const protectedRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (
        /\/rest\/v1\/rpc\/(?:create_room|join_room)/u.test(url) ||
        /\/realtime\/v1/u.test(url)
      ) {
        protectedRequests.push(url);
      }
    });

    await page.goto('/multiplayer');
    await expect(
      page.getByRole('heading', { name: 'Account required' }),
    ).toBeVisible();
    await page.waitForTimeout(150);
    await expect(
      page.getByRole('heading', { name: 'Account required' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Multiplayer' }),
    ).toHaveCount(0);
    expect(protectedRequests).toEqual([]);
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
  });
});
