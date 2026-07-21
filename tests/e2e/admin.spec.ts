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

test('admin route stays clean across direct navigation and refresh', async ({
  page,
}) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin$/);
  await page.reload();
  await expect(page).toHaveURL(/\/admin$/);
});

test('admin scrolls while the game retains its fixed viewport', async ({
  page,
}) => {
  await page.goto('/admin?admin-fixture=failed');
  const adminLayout = await page.evaluate(() => ({
    route: document.documentElement.className,
    overflowY: getComputedStyle(document.documentElement).overflowY,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(adminLayout.route).toContain('admin-route');
  expect(adminLayout.overflowY).toBe('auto');
  expect(adminLayout.scrollHeight).toBeGreaterThan(adminLayout.clientHeight);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);

  await page.goto('/?v=1&seed=viewport-check&territories=18&continents=3');
  await expect(page.locator('html')).toHaveClass('game-route');
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).overflowY,
    ),
  ).toBe('hidden');
});

test('game and admin navigation keep their route-specific URL behavior', async ({
  page,
}) => {
  await page.goto('/?v=1&seed=route-boundary&territories=18&continents=3');
  await expect(page.getByLabel('Planet seed')).toHaveValue('route-boundary');
  await expect(page).toHaveURL(/seed=route-boundary/);

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin$/);
  await page.goBack();
  await expect(page.getByLabel('Planet seed')).toHaveValue('route-boundary');
  await expect(page).toHaveURL(/seed=route-boundary/);
  await page.goForward();
  await expect(page).toHaveURL(/\/admin$/);
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
  await expect(page.locator('.failure-card textarea')).toContainText(
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

test('balance study running state updates, filters configurations, and exposes CLI helpers', async ({
  page,
}) => {
  await page.goto('/admin?admin-fixture=study-reactive');
  await expect(
    page.getByRole('heading', { name: 'Balance Studies' }),
  ).toBeVisible();
  await expect(page.locator('[data-study-status]')).toHaveText('Running');
  await page.getByText('CLI quick start and copyable commands').click();
  await expect(
    page.getByLabel(/Copy pnpm study:balance --preset thorough --dry-run/),
  ).toHaveValue(/--dry-run/);
  await page.getByLabel('Configuration player count').selectOption('4');
  await expect(
    page
      .getByRole('table', { name: 'Configuration breakdown' })
      .getByRole('article'),
  ).toHaveCount(1);
  await expect(page.locator('[data-study-status]')).toHaveText('Completed', {
    timeout: 5_000,
  });
});

test('interrupted and failed studies show resume and copyable reproduction details', async ({
  page,
}) => {
  await page.goto('/admin?admin-fixture=interrupted');
  await expect(
    page.getByText(/pnpm study:balance --resume balance-fixture-interrupted/),
  ).toBeVisible();
  await page.goto('/admin?admin-fixture=failed');
  await expect(page.getByLabel('Study reproduction command')).toContainText(
    'study:balance --reproduce',
  );
});

test('recent balance study selection is read-only and mobile-safe', async ({
  page,
}, testInfo) => {
  await page.goto('/admin?admin-fixture=running');
  await page.getByRole('button', { name: /balance-fixture-failed/i }).click();
  await expect(
    page.getByRole('heading', { name: 'balance-fixture-failed' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /start|cancel|execute/i }),
  ).toHaveCount(0);
  if (testInfo.project.name === 'mobile-390') {
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  }
});
