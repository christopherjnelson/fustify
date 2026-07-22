import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const mobileAuthState = 'test-results/multiplayer-visual-auth.json';

test('mobile lobby keeps room controls visible without horizontal clipping', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    ...testInfo.project.use,
    storageState: existsSync(mobileAuthState) ? mobileAuthState : undefined,
  });
  const page = await context.newPage();
  await page.goto('/multiplayer');
  if (!existsSync(mobileAuthState)) {
    await context.storageState({ path: mobileAuthState });
  }
  await page.getByLabel('Display name').fill('Mobile Host');
  await page.getByRole('button', { name: 'Create private room' }).click();
  await expect(
    page.getByRole('heading', { name: 'Multiplayer lobby' }),
  ).toBeVisible();
  const roomId = page.url().split('/').at(-1)!;
  try {
    await expect(page.getByTestId('room-code')).toBeVisible();
    await expect(page.getByTestId('seat-0')).toBeVisible();
    await expect(page.getByLabel('Continents')).toHaveAttribute('max', '5');
    await expect(
      page.getByRole('spinbutton', { name: 'Seats' }),
    ).toHaveAttribute('max', '5');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      fullPage: true,
      path: `test-results/ui-review/${testInfo.project.name}/multiplayer-lobby.png`,
    });
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
