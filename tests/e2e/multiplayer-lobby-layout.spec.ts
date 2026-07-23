import { expect, test, type Locator } from '@playwright/test';

async function expectInsideInitialViewport(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1921);
  expect(box!.y + box!.height).toBeLessThanOrEqual(1081);
}

test('standard host lobby fits the 1920 by 1080 initial viewport', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1920');

  await page.goto('/multiplayer');
  await page.getByLabel('Display name').fill('Layout Host');
  await page.getByRole('button', { name: 'Create private room' }).click();
  await expect(
    page.getByRole('heading', { name: 'Multiplayer lobby' }),
  ).toBeVisible();
  await expect(page.getByTestId('connection-status')).toHaveText('Live');
  const roomId = page.url().split('/').at(-1)!;

  try {
    const importantElements = [
      page.getByTestId('room-code'),
      page.getByRole('button', { name: 'Copy room code' }),
      page.getByRole('heading', { name: 'Members' }),
      page.getByTestId('multiplayer-minimap'),
      page.getByLabel('Seed'),
      page.getByRole('button', { name: 'Generate World' }),
      page.getByRole('button', { name: 'Save settings' }),
      page.getByRole('button', { name: 'Start Match' }),
      page.getByText('At least 2 players must claim seats before starting.'),
      page.getByRole('button', { name: 'Leave room' }),
      page.getByRole('button', { name: 'Close room' }),
    ];

    for (let seat = 0; seat < 5; seat += 1) {
      importantElements.push(page.getByTestId(`seat-${seat}`));
    }
    for (const element of importantElements) {
      await expectInsideInitialViewport(element);
    }

    await expect(
      page.getByRole('button', { name: 'Start Match' }),
    ).toBeDisabled();
    const documentSize = await page.evaluate(() => ({
      clientHeight: document.documentElement.clientHeight,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    expect(documentSize.scrollHeight).toBeLessThanOrEqual(
      documentSize.clientHeight + 2,
    );
  } finally {
    await page.evaluate(async (id) => {
      const { getSupabaseClient } =
        await import('/src/multiplayer/supabaseClient.ts');
      const client = getSupabaseClient();
      await client.rpc('close_room', { room_id: id });
      await client.rpc('leave_room', { room_id: id });
    }, roomId);
  }
});
