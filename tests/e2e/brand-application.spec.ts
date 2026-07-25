import { expect, test } from '@playwright/test';
import { openScenario, reviewPath, type Scenario } from './helpers';

const applicationBrandScenarios: Scenario[] = [
  'world-setup',
  'reinforcement',
  'activity-dock',
  'game-over',
];

for (const scenario of applicationBrandScenarios) {
  test(`application brand review: ${scenario}`, async ({ page }, testInfo) => {
    await openScenario(page, scenario);

    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.locator('.board-brand .fustify-logo')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      )
      .toBeLessThanOrEqual(1);

    if (scenario === 'world-setup') {
      await expect(
        page.getByRole('button', { name: 'Start Game' }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Generate World' }),
      ).toBeVisible();
    }
    if (scenario === 'activity-dock') {
      await expect(
        page.getByRole('heading', { name: 'Activity' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Collapse Activity' }).click();
      await expect(
        page.getByRole('button', { name: /Open Activity/i }),
      ).toBeVisible();
      await page.getByRole('button', { name: /Open Activity/i }).click();
    }
    if (scenario === 'game-over') {
      await expect(
        page.getByRole('dialog', { name: 'Match won' }),
      ).toBeVisible();
    }

    await page.screenshot({
      path: reviewPath(testInfo, `brand-${scenario}`),
      fullPage: true,
      animations: 'disabled',
    });
  });
}
