import { expect, test } from '@playwright/test';

test('public browser renders cards without room codes and disables full games', async ({
  page,
}) => {
  await page.goto('/multiplayer?visual-review=1&browser-state=populated');
  await expect(
    page.getByRole('heading', { name: 'Public Games' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Atlas Prime' }),
  ).toBeVisible();
  await expect(page.getByText('ABCD-1234')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Full' })).toBeDisabled();
  await expect(page.locator('.public-game-card')).toHaveCount(3);
});

test('empty, loading, error, and thumbnail fallback states preserve primary actions', async ({
  page,
}) => {
  await page.goto('/multiplayer?visual-review=1&browser-state=empty');
  await expect(
    page.getByRole('heading', { name: 'No public games are waiting' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create Game' }).first(),
  ).toBeVisible();
  await expect(page.getByLabel('Room code')).toBeVisible();

  await page.goto('/multiplayer?visual-review=1&browser-state=loading');
  await expect(page.locator('.public-game-skeleton')).toHaveCount(4);
  await expect(page.getByLabel('Room code')).toBeEnabled();

  await page.goto('/multiplayer?visual-review=1&browser-state=error');
  await expect(
    page.getByRole('heading', { name: 'Public games could not be loaded' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();

  await page.goto(
    '/multiplayer?visual-review=1&browser-state=populated&thumbnail-failure=1',
  );
  await expect(page.getByText('World preview pending').first()).toBeVisible();
  await expect(
    page
      .locator('.public-game-card')
      .first()
      .getByRole('button', { name: 'Join Game', exact: true }),
  ).toBeEnabled();
});

test('create dialog defaults to public, traps focus, preserves inputs, and returns focus', async ({
  page,
}) => {
  await page.goto('/multiplayer?visual-review=1&browser-state=empty');
  const trigger = page
    .getByRole('button', { name: 'Create Public Game' })
    .first();
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Game name')).toHaveValue(
    'Visual Host’s Game',
  );
  await expect(dialog.getByLabel('Public')).toBeChecked();
  await dialog.getByLabel('Private').check();
  await dialog.getByLabel('Maximum players').selectOption('3');
  await dialog.getByLabel('Game name').fill('  Night Orbit  ');
  await dialog
    .getByRole('button', { name: 'Create Game', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __FUSTIFY_MULTIPLAYER_BROWSER_FIXTURE__?: {
                createInputs: unknown[];
              };
            }
          ).__FUSTIFY_MULTIPLAYER_BROWSER_FIXTURE__?.createInputs,
      ),
    )
    .toEqual([{ name: 'Night Orbit', visibility: 'private', maxSeats: 3 }]);

  await page.reload();
  const createTrigger = page
    .getByRole('button', { name: 'Create Public Game' })
    .first();
  await createTrigger.click();
  await page.getByRole('button', { name: 'Close create game dialog' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'Create Game', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Close create game dialog' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(createTrigger).toBeFocused();
});

test('code join submits on Enter and stale public joins show feedback then refresh', async ({
  page,
}) => {
  await page.goto('/multiplayer?visual-review=1&browser-state=empty');
  await page.getByLabel('Room code').fill(' abcd-1234 ');
  await page.getByLabel('Room code').press('Enter');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __FUSTIFY_MULTIPLAYER_BROWSER_FIXTURE__?: {
                navigations: string[];
              };
            }
          ).__FUSTIFY_MULTIPLAYER_BROWSER_FIXTURE__?.navigations,
      ),
    )
    .toEqual(['/multiplayer/room/30000000-0000-4000-8000-000000000001']);

  await page.goto(
    '/multiplayer?visual-review=1&browser-state=populated&join-failure=1',
  );
  await page
    .locator('.public-game-card')
    .first()
    .getByRole('button', { name: 'Join Game', exact: true })
    .click();
  await expect(
    page.getByText(
      'That public game is no longer available. Choose another game.',
    ),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __FUSTIFY_MULTIPLAYER_BROWSER_FIXTURE__?: {
                listCalls: number;
              };
            }
          ).__FUSTIFY_MULTIPLAYER_BROWSER_FIXTURE__?.listCalls,
      ),
    )
    .toBeGreaterThan(1);
});

test('stored world preview conversion produces a 640 by 360 WebP', async ({
  page,
}) => {
  await page.goto('/multiplayer?visual-review=1&browser-state=empty');
  const result = await page.evaluate(async () => {
    const { createRoomThumbnail } =
      await import('/src/multiplayer/worldThumbnail.ts');
    const thumbnail = await createRoomThumbnail({
      assignment_mode: 'random',
      continent_count: 2,
      created_at: '2026-07-25T00:00:00.000Z',
      generator_version: 2,
      host_user_id: '10000000-0000-4000-8000-000000000001',
      id: '20000000-0000-4000-8000-000000000001',
      join_code: 'ABCD1234',
      max_seats: 3,
      name: 'Canvas Test',
      revision: 0,
      seed: 'canvas-thumbnail-test',
      status: 'waiting',
      territory_count: 12,
      thumbnail_path: null,
      thumbnail_version: 0,
      updated_at: '2026-07-25T00:00:00.000Z',
      visibility: 'public',
    });
    const bitmap = await createImageBitmap(thumbnail);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return {
      type: thumbnail.type,
      size: thumbnail.size,
      ...dimensions,
    };
  });

  expect(result.type).toBe('image/webp');
  expect(result.size).toBeGreaterThan(1_000);
  expect(result).toMatchObject({ width: 640, height: 360 });
});
