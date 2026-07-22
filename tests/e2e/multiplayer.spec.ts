import { existsSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const authStateA = 'test-results/multiplayer-visual-auth.json';
const authStateB = 'test-results/multiplayer-player-b.json';
const authStateC = 'test-results/multiplayer-player-c.json';

function reusableContextOptions(path: string) {
  return { storageState: existsSync(path) ? path : undefined };
}

async function newPlayer(
  context: BrowserContext,
  name: string,
  authStatePath: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/multiplayer');
  const entryHeading = page.getByRole('heading', {
    name: 'Private multiplayer rooms',
  });
  const authErrorHeading = page.getByRole('heading', {
    name: 'Could not restore multiplayer session',
  });
  await Promise.race([entryHeading.waitFor(), authErrorHeading.waitFor()]);
  if (await authErrorHeading.isVisible()) {
    await page.waitForTimeout(1_500);
    await page.reload();
  }
  await expect(entryHeading).toBeVisible();
  if (!existsSync(authStatePath)) {
    await context.storageState({ path: authStatePath });
  }
  await page.getByLabel('Display name').fill(name);
  return page;
}

async function roomRpc(
  page: Page,
  name: 'close_room' | 'leave_room',
  roomId: string,
) {
  return page.evaluate(
    async ({ functionName, id }) => {
      const { getSupabaseClient } =
        await import('/src/multiplayer/supabaseClient.ts');
      const { error } = await getSupabaseClient().rpc(functionName, {
        room_id: id,
      });
      return error?.message ?? null;
    },
    { functionName: name, id: roomId },
  );
}

test('two anonymous players synchronize a private lobby and deterministic match preview', async ({
  browser,
}, testInfo) => {
  const contextA = await browser.newContext(reusableContextOptions(authStateA));
  const contextB = await browser.newContext(reusableContextOptions(authStateB));
  const contextC = await browser.newContext(reusableContextOptions(authStateC));
  const pageA = await newPlayer(contextA, 'Alpha', authStateA);
  // Hosted anonymous signup is intentionally rate limited per source IP.
  // Real players have independent clients; keep isolated test contexts from
  // arriving in the same one-second remote window.
  await pageA.waitForTimeout(1_200);
  const pageB = await newPlayer(contextB, 'Bravo', authStateB);
  let roomId = '';

  try {
    await pageA.getByRole('button', { name: 'Create private room' }).click();
    await expect(
      pageA.getByRole('heading', { name: 'Multiplayer lobby' }),
    ).toBeVisible();
    await expect(pageA.getByTestId('connection-status')).toHaveText('Live');
    roomId = pageA.url().split('/').at(-1)!;
    const code = await pageA.getByTestId('room-code').innerText();

    await pageB.getByLabel('Room code').fill(code);
    await pageB.getByRole('button', { name: 'Join room' }).click();
    await expect(
      pageB.getByRole('heading', { name: 'Multiplayer lobby' }),
    ).toBeVisible();
    await expect(
      pageA.locator('.member-card li').filter({ hasText: 'Bravo' }),
    ).toBeVisible();
    await expect(
      pageB.locator('.member-card li').filter({ hasText: 'Alpha' }),
    ).toBeVisible();
    await expect
      .poll(() =>
        pageA.evaluate(() =>
          window.__FUSTIFY_MULTIPLAYER_TEST__!.getRealtimeEventCount(),
        ),
      )
      .toBeGreaterThan(0);

    await pageA
      .getByTestId('seat-0')
      .getByRole('button', { name: 'Claim' })
      .click();
    await expect(pageB.getByTestId('seat-0')).toContainText('Alpha');
    await pageB
      .getByTestId('seat-1')
      .getByRole('button', { name: 'Claim' })
      .click();
    await expect(pageA.getByTestId('seat-1')).toContainText('Bravo');

    const conflict = await pageB.evaluate(async (id) => {
      const { getSupabaseClient } =
        await import('/src/multiplayer/supabaseClient.ts');
      const { error } = await getSupabaseClient().rpc('claim_room_seat', {
        room_id: id,
        seat_index: 0,
      });
      return error?.message ?? null;
    }, roomId);
    expect(conflict).toContain('seat_conflict');

    await expect(pageB.getByLabel('Seed')).toBeDisabled();
    await expect(
      pageB.getByRole('button', { name: 'Start Match' }),
    ).toHaveCount(0);
    await expect(
      pageA.getByRole('button', { name: 'Start Match' }),
    ).toBeVisible();

    const interruption = pageB.evaluate(() =>
      window.__FUSTIFY_MULTIPLAYER_TEST__!.interruptRealtime(),
    );
    await pageA.getByLabel('Seed').fill('reconnect-proof');
    await pageA.getByRole('button', { name: 'Save settings' }).click();
    await interruption;
    await expect(pageB.getByLabel('Seed')).toHaveValue('reconnect-proof');
    await expect(pageB.getByTestId('connection-status')).toHaveText('Live');
    await pageA.screenshot({
      fullPage: true,
      path: `test-results/ui-review/${testInfo.project.name}/multiplayer-lobby.png`,
    });

    const pageC = await contextC.newPage();
    await pageC.goto(`/multiplayer/room/${roomId}`);
    await expect(
      pageC.getByRole('heading', { name: 'Private room unavailable' }),
    ).toBeVisible();
    if (!existsSync(authStateC)) {
      await contextC.storageState({ path: authStateC });
    }

    await pageA.getByRole('button', { name: 'Start Match' }).click();
    await expect(pageA).toHaveURL(/\/multiplayer\/match\/[0-9a-f-]+$/);
    await expect(pageB).toHaveURL(/\/multiplayer\/match\/[0-9a-f-]+$/);
    await expect(pageA.getByTestId('multiplayer-match-preview')).toBeVisible();
    await expect(pageB.getByTestId('multiplayer-match-preview')).toBeVisible();

    const [
      matchA,
      matchB,
      seedA,
      seedB,
      setupA,
      setupB,
      fingerprintA,
      fingerprintB,
    ] = await Promise.all([
      pageA.getByTestId('match-id').innerText(),
      pageB.getByTestId('match-id').innerText(),
      pageA.getByTestId('match-seed').innerText(),
      pageB.getByTestId('match-seed').innerText(),
      pageA.getByTestId('match-setup').innerText(),
      pageB.getByTestId('match-setup').innerText(),
      pageA.getByTestId('world-fingerprint').innerText(),
      pageB.getByTestId('world-fingerprint').innerText(),
    ]);
    expect(matchB).toBe(matchA);
    expect(seedB).toBe(seedA);
    expect(setupB).toBe(setupA);
    expect(fingerprintB).toBe(fingerprintA);
    await expect(pageA.getByTestId('multiplayer-minimap')).toBeVisible();
    await expect(pageB.getByTestId('multiplayer-minimap')).toBeVisible();
    await pageA.screenshot({
      fullPage: true,
      path: `test-results/ui-review/${testInfo.project.name}/multiplayer-match-preview.png`,
    });

    await pageB.reload();
    await expect(pageB.getByTestId('match-id')).toHaveText(matchA);
    await expect(pageB.getByTestId('world-fingerprint')).toHaveText(
      fingerprintA,
    );
  } finally {
    if (roomId) {
      await roomRpc(pageA, 'close_room', roomId).catch(() => null);
      await Promise.all([
        roomRpc(pageA, 'leave_room', roomId).catch(() => null),
        roomRpc(pageB, 'leave_room', roomId).catch(() => null),
      ]);
    }
    await Promise.all([contextA.close(), contextB.close(), contextC.close()]);
  }
});
