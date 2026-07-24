import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1920, height: 1080 } });

test('home choices route through the account-required shell without loading gameplay', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Fustify' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Single Player' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Multiplayer' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Single Player' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Multiplayer' })).toBeVisible();
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
            name.includes('three'),
        ),
    ),
  ).toEqual([]);

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Account' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Single Player' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/local$/);
  await expect(
    page.getByRole('heading', { name: 'Account required' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Account required' }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: 'Multiplayer' }).click();
  await expect(page).toHaveURL(/\/multiplayer$/);
  await expect(
    page.getByRole('heading', {
      name: /^(Account required|Multiplayer configuration unavailable)$/,
    }),
  ).toBeVisible();

  await page.goto(
    '/?v=1&seed=legacy-atlas&territories=42&continents=5&players=4&assignment=random#setup',
  );
  await expect(
    page.getByRole('heading', { name: 'Account required' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/assignment=random#setup$/);
  await expect(
    page.getByRole('heading', { name: 'Single Player' }),
  ).toHaveCount(0);
});
