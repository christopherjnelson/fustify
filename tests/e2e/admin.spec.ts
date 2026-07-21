import { expect, test } from '@playwright/test';

test('direct /admin navigation shows an understandable empty state', async ({
  page,
}) => {
  await page.goto('/admin?admin-fixture=empty');
  await expect(
    page.getByRole('heading', { name: 'Verification Dashboard' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No report available' }),
  ).toBeVisible();
});

test('running report updates reactively to passed', async ({ page }) => {
  await page.goto('/admin?admin-fixture=reactive');
  await expect(page.getByRole('status')).toHaveText('Running');
  await expect(page.getByRole('status')).toHaveText('Passed', {
    timeout: 5_000,
  });
});

test('failed and interrupted reports expose factual details', async ({
  page,
}) => {
  await page.goto('/admin?admin-fixture=failed');
  await expect(page.getByRole('status')).toHaveText('Failed');
  await page.getByText('Failure details').click();
  await expect(page.getByLabel('Suites').getByText(/TS2322/)).toBeVisible();
  await expect(page.getByLabel('Reproduction command')).toContainText(
    'simulate:bots',
  );
  await page.goto('/admin?admin-fixture=interrupted');
  await expect(page.getByRole('status')).toHaveText('Interrupted');
  await expect(page.getByText('Runner received SIGINT.')).toBeVisible();
});

test('coverage and bot metrics are readable', async ({ page }) => {
  await page.goto('/admin?admin-fixture=passed');
  await expect(
    page.getByRole('heading', { name: 'Coverage', level: 2 }),
  ).toBeVisible();
  await expect(page.getByText('92.75%')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Quick bot matrix' }),
  ).toBeVisible();
  await expect(page.getByText(/1.53 games\/s/)).toBeVisible();
});

test('recent report selection, return to latest, refresh, and keyboard use work', async ({
  page,
}) => {
  await page.goto('/admin?admin-fixture=running');
  const failed = page.getByRole('button', { name: /^Failed /i });
  await failed.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Historical run' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Return to Latest' }).click();
  await expect(
    page.getByRole('heading', { name: 'Current run' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Refresh verification reports' })
    .click();
});

test('mobile dashboard does not overflow horizontally', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile-390',
    'mobile viewport assertion',
  );
  await page.goto('/admin?admin-fixture=failed');
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
});

test('normal game and seed URL remain unaffected', async ({ page }) => {
  await page.goto('/?v=1&seed=admin-regression&territories=18&continents=3');
  await expect(page.getByLabel('Planet seed')).toHaveValue('admin-regression');
  await expect(
    page.getByRole('heading', { name: 'Choose your world' }),
  ).toBeVisible();
});
