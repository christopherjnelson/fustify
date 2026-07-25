import { expect, test } from '@playwright/test';

test('local and admin routes remain isolated from multiplayer', async ({
  page,
}) => {
  await page.goto('/local');
  await expect(
    page.getByRole('heading', { name: 'Choose your world' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Generate World' }),
  ).toBeVisible();
  const originalSeed = await page.getByLabel('Planet seed').inputValue();
  await page.getByRole('button', { name: 'Generate World' }).click();
  await expect(page.getByLabel('Planet seed')).not.toHaveValue(originalSeed);
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(
    page.getByRole('heading', { name: 'Preview and assign territories' }),
  ).toBeVisible();
  const loadedScripts = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter(
        (name) => name.includes('MultiplayerApp') || name.includes('supabase'),
      ),
  );
  expect(loadedScripts).toEqual([]);

  await page.goto('/multiplayer');
  await expect(
    page.getByRole('heading', {
      name: /^(Multiplayer|Multiplayer configuration unavailable)$/,
    }),
  ).toBeVisible();

  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'Verification Dashboard' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Multiplayer' })).toHaveCount(
    0,
  );
});
