import { expect, test } from '@playwright/test';
import { reviewPath } from './helpers';

test('multiplayer Activity reaction rail stays compact and contextual', async ({
  page,
}, testInfo) => {
  await page.goto(
    '/multiplayer/match/visual-match?visual-review=1&scenario=multiplayer-activity-reactions',
  );

  const activity = page.getByRole('region', {
    name: 'Activity',
    exact: true,
  });
  await expect(activity).toBeVisible();
  const rows = activity.locator('.event-log li');
  await expect(rows).toHaveCount(8);
  await expect(rows.first().locator('.event-reaction-button')).toHaveCount(4);
  await expect(
    activity.getByRole('button', { name: /^Focus / }).first(),
  ).toBeVisible();
  await expect(
    rows.filter({ has: page.locator('[data-event-icon="combat"]') }).first(),
  ).toHaveCSS('--event-player-color', '#e24f4f');
  await expect(
    rows
      .filter({ has: page.locator('[data-event-icon="combat"]') })
      .first()
      .locator('.event-participant-marker'),
  ).toHaveCount(2);

  const layout = await activity.evaluate((panel) => {
    const list = panel.querySelector('.event-log ol')!;
    const buttons = [...panel.querySelectorAll('.event-reaction-button')];
    const focusButtons = [...panel.querySelectorAll('.event-focus-button')];
    return {
      scrollable: list.scrollHeight > list.clientHeight,
      widestReaction: Math.max(
        ...buttons.map((button) => button.getBoundingClientRect().width),
      ),
      focusVisible: focusButtons.every(
        (button) => button.getBoundingClientRect().width > 0,
      ),
      panelBottom: panel.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
    };
  });
  expect(layout.scrollable).toBe(true);
  expect(layout.widestReaction).toBeLessThan(54);
  expect(layout.focusVisible).toBe(true);
  expect(layout.panelBottom).toBeLessThanOrEqual(layout.viewportHeight);

  await page.screenshot({
    path: reviewPath(testInfo, 'multiplayer-activity-reactions'),
    fullPage: true,
  });
});
