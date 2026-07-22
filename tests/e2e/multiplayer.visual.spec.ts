import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const visualAuthState = 'test-results/multiplayer-visual-auth.json';

test('multiplayer lobby visual', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-390');
  const hasReusableIdentity = existsSync(visualAuthState);
  const context = await browser.newContext({
    storageState: hasReusableIdentity ? visualAuthState : undefined,
    viewport: testInfo.project.use.viewport,
  });
  const page = await context.newPage();
  await page.goto('/multiplayer');
  await page.getByLabel('Display name').fill('Visual Host');
  if (testInfo.project.name === 'desktop-1920' && !hasReusableIdentity) {
    // Responsive captures reuse this anonymous identity instead of consuming
    // multiple hosted Auth signups for one visual assertion.
    await context.storageState({ path: visualAuthState });
  }
  await page.getByRole('button', { name: 'Create private room' }).click();
  await expect(
    page.getByRole('heading', { name: 'Multiplayer lobby' }),
  ).toBeVisible();
  await expect(page.getByTestId('connection-status')).toHaveText('Live');
  const roomId = page.url().split('/').at(-1)!;

  try {
    await expect(page.locator('.multiplayer-shell')).toHaveScreenshot(
      `multiplayer-lobby-${testInfo.project.name}.png`,
      {
        mask: [page.getByTestId('room-code'), page.getByLabel('Seed')],
      },
    );
    await page.screenshot({
      fullPage: true,
      path: `test-results/ui-review/${testInfo.project.name}/multiplayer-lobby-visual.png`,
    });
    if (testInfo.project.name === 'desktop-1920') {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('.multiplayer-shell')).toHaveScreenshot(
        'multiplayer-lobby-mobile-390.png',
        {
          mask: [page.getByTestId('room-code'), page.getByLabel('Seed')],
        },
      );
      await page.screenshot({
        fullPage: true,
        path: 'test-results/ui-review/mobile-390/multiplayer-lobby-visual.png',
      });
    }
  } finally {
    await page.evaluate(async (id) => {
      const { getSupabaseClient } =
        await import('/src/multiplayer/supabaseClient.ts');
      await getSupabaseClient().rpc('close_room', { room_id: id });
      await getSupabaseClient().rpc('leave_room', { room_id: id });
    }, roomId);
    await context.close();
  }
});
