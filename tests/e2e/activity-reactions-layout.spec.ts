import { expect, test } from '@playwright/test';
import { reviewPath } from './helpers';

test('multiplayer Activity reactions stay compact, contextual, and accessible', async ({
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
  await expect(rows.first().locator('.event-reaction-button')).toHaveCount(0);
  await expect(
    rows.first().getByRole('button', { name: 'Add reaction' }),
  ).toBeVisible();
  await expect(activity.locator('.event-turn')).toHaveCount(0);
  await expect(activity.locator('.event-participant-marker')).toHaveCount(0);
  await expect(rows.nth(1).locator('.event-reaction-button')).toHaveCount(1);
  await expect(rows.nth(2).locator('.event-reaction-button')).toHaveCount(3);
  const activeReaction = rows
    .nth(3)
    .getByRole('button', { name: /remove your heart reaction/i });
  await expect(activeReaction).toHaveAttribute('aria-pressed', 'true');
  await expect(
    activity.getByRole('button', { name: /^Focus / }).first(),
  ).toBeVisible();
  await expect(
    rows.filter({ has: page.locator('[data-event-icon="combat"]') }).first(),
  ).toHaveCSS('--event-player-color', '#e24f4f');
  const countedReaction = rows
    .nth(1)
    .getByRole('button', { name: /fire reaction/i });
  await expect(countedReaction).toHaveAttribute('aria-pressed', 'false');

  const addReaction = rows.first().getByRole('button', {
    name: 'Add reaction',
  });
  await addReaction.focus();
  await page.keyboard.press('Enter');
  const picker = page.locator('.event-reaction-picker');
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('button')).toHaveCount(4);
  await expect(picker.getByRole('button').first()).toBeFocused();
  await expect(picker).toContainText('🔥Fire😂Laugh❤️Heart😡Angry');
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await expect(addReaction).toBeFocused();

  await addReaction.click();
  await expect(picker).toBeVisible();
  await activity.locator('.activity-header').click();
  await expect(picker).toBeHidden();
  await expect(activity).toBeVisible();

  const scrollBefore = await activity
    .locator('.event-log ol')
    .evaluate((list) => list.scrollTop);
  await addReaction.click();
  const pickerBounds = await picker.boundingBox();
  expect(pickerBounds).not.toBeNull();
  expect(pickerBounds!.x).toBeGreaterThanOrEqual(0);
  expect(pickerBounds!.y).toBeGreaterThanOrEqual(0);
  expect(pickerBounds!.x + pickerBounds!.width).toBeLessThanOrEqual(
    testInfo.project.use.viewport!.width,
  );
  await picker.getByRole('button', { name: 'Add fire reaction' }).click();
  await expect(picker).toBeHidden();
  await expect(activity).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __FUSTIFY_ACTIVITY_REACTION_SELECTIONS__?: Array<{
                reaction: string | null;
              }>;
            }
          ).__FUSTIFY_ACTIVITY_REACTION_SELECTIONS__?.at(-1)?.reaction,
      ),
    )
    .toBe('fire');
  expect(
    await activity.locator('.event-log ol').evaluate((list) => list.scrollTop),
  ).toBe(scrollBefore);

  await activeReaction.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __FUSTIFY_ACTIVITY_REACTION_SELECTIONS__?: Array<{
                reaction: string | null;
              }>;
            }
          ).__FUSTIFY_ACTIVITY_REACTION_SELECTIONS__?.at(-1)?.reaction,
      ),
    )
    .toBeNull();

  await countedReaction.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __FUSTIFY_ACTIVITY_REACTION_SELECTIONS__?: Array<{
                reaction: string | null;
              }>;
            }
          ).__FUSTIFY_ACTIVITY_REACTION_SELECTIONS__?.at(-1)?.reaction,
      ),
    )
    .toBe('fire');

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
