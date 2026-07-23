import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1920, height: 1080 } });

test('home selects either mode and preserves legacy local setup URLs', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Fustify' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Local Game' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Private Multiplayer' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Set up local game' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Play online' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(
    1080,
  );
  expect(
    await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter(
          (name) =>
            name.includes('/app/App') ||
            name.includes('MultiplayerApp') ||
            name.includes('supabase'),
        ),
    ),
  ).toEqual([]);

  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Set up local game' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/local\?/);
  await expect(
    page.getByRole('heading', { name: 'Choose your world' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Choose your world' }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: 'Play online' }).click();
  await expect(page).toHaveURL(/\/multiplayer$/);
  await expect(
    page.getByRole('heading', {
      name: /^(Private multiplayer rooms|Multiplayer configuration unavailable)$/,
    }),
  ).toBeVisible();

  await page.goto(
    '/?v=1&seed=legacy-atlas&territories=42&continents=5&players=4&assignment=random#setup',
  );
  await expect(
    page.getByRole('heading', { name: 'Choose your world' }),
  ).toBeVisible();
  await expect(page.getByLabel('Planet seed')).toHaveValue('legacy-atlas');
  await expect(page).toHaveURL(/assignment=random#setup$/);
  await expect(page.getByRole('heading', { name: 'Local Game' })).toHaveCount(
    0,
  );
});
