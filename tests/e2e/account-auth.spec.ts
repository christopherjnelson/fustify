import { expect, test } from '@playwright/test';

test('signed-out account dialog offers email registration and sign-in only', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Account' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(dialog.getByLabel('Email')).toBeVisible();
  await expect(dialog.getByLabel('Password')).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Create account' }),
  ).toBeVisible();
  await expect(dialog.getByText(/discord/i)).toHaveCount(0);
  await expect(dialog.getByText(/verification|reset email/i)).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Create account' }),
  ).toBeVisible();
  await expect(dialog.getByLabel('Username')).toBeVisible();
  await expect(dialog.getByLabel('Confirm password')).toBeVisible();
  await expect(dialog.getByText(/discord|verification/i)).toHaveCount(0);
});

test('account dialog closes with Escape and restores focus', async ({
  page,
}) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Account' });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
