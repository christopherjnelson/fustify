import { expect, test } from '@playwright/test';

test('completed multiplayer results provide replacement-room actions without a review loop', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1920');
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  const completedUrl =
    '/multiplayer/match/visual-match?visual-review=1&scenario=multiplayer-game-over&role=host';
  await page.goto(completedUrl);

  const results = page.getByRole('dialog', { name: 'Match won' });
  await expect(results).toBeVisible();
  await expect(
    results.getByRole('button', { name: 'Review World' }),
  ).toBeVisible();
  await expect(
    results.getByRole('button', { name: 'Rematch Same World' }),
  ).toBeVisible();
  await expect(
    results.getByRole('button', { name: 'Generate New World' }),
  ).toBeVisible();

  await results.getByRole('button', { name: 'Review World' }).click();
  await expect(page.getByText('Reviewing final world')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Back to Results' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Rematch Options/i }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to Results' }).click();
  await expect(results).toBeVisible();

  await results.getByRole('button', { name: 'Rematch Same World' }).click();
  await expect(page).toHaveURL(/\/multiplayer\/room\/visual-replacement-room$/);
  await page.goBack();
  await expect(results).toBeVisible();
  await results.getByRole('button', { name: 'Return to Multiplayer' }).click();
  await expect(page).toHaveURL(/\/multiplayer$/);

  await page.goto(`${completedUrl.replace('role=host', 'role=nonhost')}`);
  await expect(page.getByRole('dialog', { name: 'Match won' })).toBeVisible();
  await expect(
    page.getByText('The host can create the next room and share its new code.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Rematch Same World' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Generate New World' }),
  ).toHaveCount(0);
});
