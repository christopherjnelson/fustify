import { expect, test } from '@playwright/test';
import { installAdminAuthFixture } from './adminTestClient';

const adminPreview = (
  report = 'empty',
  data: 'populated' | 'empty' | 'error' | 'loading' = 'populated',
) => `/admin?visual-review=1&admin-fixture=${report}&admin-data=${data}`;

test('signed-out admin route uses the normal account gate', async ({
  page,
}) => {
  await installAdminAuthFixture(page, 'signed-out');
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'Account required' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
});

test('non-admin route is forbidden without requesting admin data', async ({
  page,
}) => {
  await installAdminAuthFixture(page, 'non-admin');
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'Admin access required' }),
  ).toBeVisible();
  await expect(page.getByText(/restricted to authorized/i)).toBeVisible();
  const calls = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __FUSTIFY_ADMIN_TEST_STATE__: { calls: string[] };
        }
      ).__FUSTIFY_ADMIN_TEST_STATE__.calls,
  );
  expect(calls).toContain('current_user_is_admin');
  expect(calls).not.toContain('admin_dashboard_overview');
  expect(calls).not.toContain('admin_recent_rooms');
});

test('authorization failure is distinct and retryable', async ({ page }) => {
  await installAdminAuthFixture(page, 'admin-check-error');
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'Unable to verify admin access' }),
  ).toBeVisible();
  await page.evaluate(() =>
    (
      window as typeof window & {
        __FUSTIFY_ADMIN_TEST_STATE__: {
          allowAdminCheckRetry(): void;
        };
      }
    ).__FUSTIFY_ADMIN_TEST_STATE__.allowAdminCheckRetry(),
  );
  await page.getByRole('button', { name: 'Try Again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Admin access required' }),
  ).toBeVisible();
});

test('pending authorization keeps privileged data hidden', async ({ page }) => {
  await installAdminAuthFixture(page, 'admin-check-pending');
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'Checking admin access…' }),
  ).toBeVisible();
  let calls = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __FUSTIFY_ADMIN_TEST_STATE__: { calls: string[] };
        }
      ).__FUSTIFY_ADMIN_TEST_STATE__.calls,
  );
  expect(calls).not.toContain('admin_dashboard_overview');
  expect(calls).not.toContain('admin_recent_rooms');
  await page.evaluate(() =>
    (
      window as typeof window & {
        __FUSTIFY_ADMIN_TEST_STATE__: {
          releaseAdminCheck(): void;
        };
      }
    ).__FUSTIFY_ADMIN_TEST_STATE__.releaseAdminCheck(),
  );
  await expect(
    page.getByRole('heading', { name: 'Admin Dashboard' }),
  ).toBeVisible();
  calls = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __FUSTIFY_ADMIN_TEST_STATE__: { calls: string[] };
        }
      ).__FUSTIFY_ADMIN_TEST_STATE__.calls,
  );
  expect(calls).toContain('admin_dashboard_overview');
  expect(calls).toContain('admin_recent_rooms');
});

test('confirmed admin loads the operational dashboard', async ({ page }) => {
  await installAdminAuthFixture(page, 'admin');
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'Admin Dashboard' }),
  ).toBeVisible();
  await expect(page.getByText('Authorized Room')).toBeVisible();
  await expect(page.getByText('Normalized v2')).toBeVisible();
  await expect(
    page.getByText('Registered accounts').locator('..'),
  ).toContainText('14');
});

test('operational dashboard has bounded loading, empty, and error states', async ({
  page,
}) => {
  await page.goto(adminPreview('empty', 'loading'));
  await expect(page.getByText('Loading admin data…')).toBeVisible();

  await page.goto(adminPreview('empty', 'empty'));
  await expect(
    page.getByRole('heading', { name: 'No rooms yet' }),
  ).toBeVisible();
  await expect(
    page.getByText('Registered accounts').locator('..'),
  ).toContainText('0');

  await page.goto(adminPreview('empty', 'error'));
  await expect(page.getByRole('alert')).toContainText(
    'Admin data could not be loaded',
  );
  await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();
});

test('admin navigation waits for authorization and clears on account changes', async ({
  page,
}) => {
  await installAdminAuthFixture(page, 'admin-check-pending');
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Fustify', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
  await page.evaluate(() =>
    (
      window as typeof window & {
        __FUSTIFY_ADMIN_TEST_STATE__: {
          releaseAdminCheck(): void;
        };
      }
    ).__FUSTIFY_ADMIN_TEST_STATE__.releaseAdminCheck(),
  );
  await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();
  await page.evaluate(() =>
    (
      window as typeof window & {
        __FUSTIFY_ADMIN_TEST_STATE__: {
          switchToNonAdmin(): void;
        };
      }
    ).__FUSTIFY_ADMIN_TEST_STATE__.switchToNonAdmin(),
  );
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
});

test('signing out clears a confirmed admin navigation result', async ({
  page,
}) => {
  await installAdminAuthFixture(page, 'admin');
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();
  await page.evaluate(() =>
    (
      window as typeof window & {
        __FUSTIFY_ADMIN_TEST_STATE__: {
          signOut(): void;
        };
      }
    ).__FUSTIFY_ADMIN_TEST_STATE__.signOut(),
  );
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
});

test('routes load only their browser entry graph', async ({ page }) => {
  await installAdminAuthFixture(page, 'non-admin');
  const requested = new Set<string>();
  page.on('request', (request) => {
    requested.add(new URL(request.url()).pathname);
  });

  await page.goto('/?v=1&seed=route-graph&territories=18&continents=3');
  await expect(
    page.getByRole('heading', { name: 'Choose your world' }),
  ).toBeVisible();
  expect([...requested]).toContain('/src/app/App.tsx');
  expect(
    [...requested].filter(
      (path) =>
        path.startsWith('/src/admin/') &&
        !path.endsWith('/adminAccess.tsx') &&
        !path.endsWith('/adminAccessContext.ts') &&
        !path.endsWith('/adminAccessState.ts') &&
        !path.endsWith('/adminApi.ts'),
    ),
  ).toEqual([]);

  requested.clear();
  await page.goto(adminPreview('empty'));
  await expect(
    page.getByRole('heading', { name: 'Admin Dashboard' }),
  ).toBeVisible();
  expect([...requested]).toContain('/src/admin/AdminDashboard.tsx');
  expect([...requested]).toContain('/src/admin/reportSource.ts');
  expect([...requested].some((path) => path.startsWith('/src/app/'))).toBe(
    false,
  );
  expect(
    [...requested].some((path) => path.startsWith('/src/components/')),
  ).toBe(false);
  expect(
    [...requested].some((path) => path.startsWith('/src/core/generation/')),
  ).toBe(false);
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('direct /admin navigation shows an understandable empty state', async ({
  page,
}) => {
  await page.goto(adminPreview('empty'));
  await expect(
    page.getByRole('heading', { name: 'Admin Dashboard' }),
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
  await installAdminAuthFixture(page, 'non-admin');
  await page.goto(adminPreview('failed'));
  await expect(page.getByRole('heading', { name: 'Suites' })).toBeVisible();
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
  await installAdminAuthFixture(page, 'non-admin');
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
  await page.goto(adminPreview('reactive'));
  await expect(page.locator('.admin-current [role="status"]')).toHaveText(
    'Running',
  );
  await expect(page.locator('.admin-current [role="status"]')).toHaveText(
    'Passed',
    {
      timeout: 5_000,
    },
  );
});

test('failed and interrupted reports expose factual details', async ({
  page,
}) => {
  await page.goto(adminPreview('failed'));
  await expect(page.locator('.admin-current [role="status"]')).toHaveText(
    'Failed',
  );
  await page.getByText('Failure details').click();
  await expect(page.getByLabel('Suites').getByText(/TS2322/)).toBeVisible();
  await expect(page.locator('.failure-card textarea')).toContainText(
    'simulate:bots',
  );
  await page.goto(adminPreview('interrupted'));
  await expect(page.locator('.admin-current [role="status"]')).toHaveText(
    'Interrupted',
  );
  await expect(page.getByText('Runner received SIGINT.')).toBeVisible();
});

test('coverage and bot metrics are readable', async ({ page }) => {
  await page.goto(adminPreview('passed'));
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
  await page.goto(adminPreview('running'));
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
  await page.getByRole('button', { name: 'Refresh dashboard' }).click();
});

test('mobile dashboard does not overflow horizontally', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'mobile-390',
    'mobile viewport assertion',
  );
  await page.goto(adminPreview('failed'));
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
});

test('normal game and seed URL remain unaffected', async ({ page }) => {
  await installAdminAuthFixture(page, 'non-admin');
  await page.goto('/?v=1&seed=admin-regression&territories=18&continents=3');
  await expect(page.getByLabel('Planet seed')).toHaveValue('admin-regression');
  await expect(
    page.getByRole('heading', { name: 'Choose your world' }),
  ).toBeVisible();
});

test('balance study running state updates, filters configurations, and exposes CLI helpers', async ({
  page,
}) => {
  await page.goto(adminPreview('study-reactive'));
  await expect(
    page.getByRole('heading', { name: 'Balance Studies', exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-study-status]')).toHaveText(
    /Running|Completed/,
  );
  await page.getByText('CLI quick start and copyable commands').click();
  await expect(
    page.getByLabel(/Copy pnpm study:balance --preset thorough --dry-run/),
  ).toHaveValue(/--dry-run/);
  await expect(
    page.getByLabel(
      /Copy pnpm study:balance --diagnose six-seat --scale standard/,
    ),
  ).toHaveValue(/six-seat/);
  await expect(page.getByText('4 seats · Recommended')).toBeVisible();
  await expect(page.getByText('5 seats · Expanded match')).toBeVisible();
  await expect(page.getByText('6 seats · Expanded/long match')).toBeVisible();
  await expect(
    page.getByText('Win rate across all matches').first(),
  ).toBeAttached();
  await expect(
    page.getByText('Outcome-adjusted baseline').first(),
  ).toBeAttached();
  await expect(
    page.getByText('Share of decided victories').first(),
  ).toBeAttached();
  await expect(
    page.getByText('Equal share among winners').first(),
  ).toBeAttached();
  await expect(
    page.getByText(/may run substantially longer/).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Six-seat diagnostic' }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/admin');
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
  await page.goto(adminPreview('interrupted'));
  await expect(
    page.getByText(/pnpm study:balance --resume balance-fixture-interrupted/),
  ).toBeVisible();
  await page.goto(adminPreview('failed'));
  await expect(page.getByLabel('Study reproduction command')).toContainText(
    'study:balance --reproduce',
  );
});

test('recent balance study selection is read-only and mobile-safe', async ({
  page,
}, testInfo) => {
  await page.goto(adminPreview('running'));
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
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBeGreaterThan(
      await page.evaluate(() => document.documentElement.clientHeight),
    );
  }
});
