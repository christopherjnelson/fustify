import { expect, test } from '@playwright/test';
import { openScenario, reviewPath, stateSnapshot } from './helpers';

test('Activity and gameplay controls share a collision-safe left rail', async ({
  page,
}, testInfo) => {
  await openScenario(page, 'activity-dock');

  const activity = page.getByRole('region', {
    name: 'Activity',
    exact: true,
  });
  const minimap = page.getByTestId('minimap');
  const legend = page.locator('.control-legend');
  await expect(activity).toBeVisible();
  await expect(minimap).toBeVisible();
  await expect(legend).toBeVisible();

  const layout = await page.evaluate(() => {
    const rect = (selector: string) =>
      document.querySelector(selector)!.getBoundingClientRect();
    const overlaps = (left: DOMRect, right: DOMRect) =>
      left.left < right.right &&
      left.right > right.left &&
      left.top < right.bottom &&
      left.bottom > right.top;
    const hudRect = rect('.hud');
    const activityRect = rect('.activity-panel');
    const minimapRect = rect('.minimap-panel');
    const territoryElement = document.querySelector('.territory-tools-panel');
    const territoryRect = territoryElement
      ? territoryElement.getBoundingClientRect()
      : null;
    const legendRect = rect('.control-legend');
    const list = document.querySelector('.event-log ol')!;
    return {
      hudBottom: hudRect.bottom,
      activityTop: activityRect.top,
      activityBottom: activityRect.bottom,
      activityLeft: activityRect.left,
      activityRight: activityRect.right,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      listScrollHeight: list.scrollHeight,
      listClientHeight: list.clientHeight,
      documentOverflow:
        document.documentElement.scrollHeight - window.innerHeight,
      overlapsMinimap: overlaps(activityRect, minimapRect),
      overlapsTerritory: territoryRect
        ? overlaps(activityRect, territoryRect)
        : false,
      overlapsLegend: overlaps(activityRect, legendRect),
    };
  });

  expect(layout.hudBottom).toBeLessThanOrEqual(layout.activityTop);
  expect(layout.activityTop).toBeGreaterThanOrEqual(0);
  expect(layout.activityBottom).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.activityLeft).toBeGreaterThanOrEqual(0);
  expect(layout.activityRight).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.listScrollHeight).toBeGreaterThan(layout.listClientHeight);
  expect(layout.documentOverflow).toBeLessThanOrEqual(1);
  expect(layout.overlapsMinimap).toBe(false);
  expect(layout.overlapsTerritory).toBe(false);
  expect(layout.overlapsLegend).toBe(false);

  await page.screenshot({
    path: reviewPath(testInfo, 'activity-dock-expanded'),
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Collapse Activity' }).click();
  await expect(
    page.getByRole('button', { name: 'Open Activity' }),
  ).toBeVisible();
  await expect(activity).toBeHidden();
});

test('Activity unread, scrolling, focus, and keyboard behavior is local', async ({
  page,
}) => {
  await openScenario(page, 'activity-dock');
  const activity = page.getByRole('region', {
    name: 'Activity',
    exact: true,
  });
  const list = activity.locator('.event-log ol');

  await expect(activity).toBeVisible();
  await page.getByRole('button', { name: 'Collapse Activity' }).click();
  await page.evaluate(() => {
    window.__WORLDSEED_VISUAL__!.reconcileActivityEvents();
    window.__WORLDSEED_VISUAL__!.appendActivityEvents(3);
  });
  const launcher = page.getByRole('button', { name: 'Activity, 3 new' });
  await expect(launcher).toContainText('Activity');
  await launcher.click();
  await expect(activity).toBeVisible();
  await expect(
    page.getByRole('button', { name: /New activity/i }),
  ).toBeHidden();
  await expect
    .poll(() =>
      list.evaluate(
        (element) =>
          element.scrollHeight - element.scrollTop - element.clientHeight,
      ),
    )
    .toBeLessThanOrEqual(12);

  await page.evaluate(() =>
    window.__WORLDSEED_VISUAL__!.appendActivityEvents(),
  );
  await expect(
    page.getByRole('button', { name: /New activity/i }),
  ).toBeHidden();

  await list.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  const previousScrollTop = await list.evaluate((element) => element.scrollTop);
  await page.evaluate(() =>
    window.__WORLDSEED_VISUAL__!.appendActivityEvents(2),
  );
  const newActivity = page.getByRole('button', {
    name: 'New activity (2)',
  });
  await expect(newActivity).toBeVisible();
  expect(await list.evaluate((element) => element.scrollTop)).toBe(
    previousScrollTop,
  );
  await newActivity.click();
  await expect(newActivity).toBeHidden();
  await expect
    .poll(() =>
      list.evaluate(
        (element) =>
          element.scrollHeight - element.scrollTop - element.clientHeight,
      ),
    )
    .toBeLessThanOrEqual(12);

  const focusSequence = (await stateSnapshot(page)).focusSequence;
  await activity
    .getByRole('button', { name: /^Focus / })
    .first()
    .click();
  expect((await stateSnapshot(page)).focusSequence).toBe(focusSequence + 1);
  await expect(activity).toBeVisible();

  await list.focus();
  await list.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Open Activity' }),
  ).toBeFocused();
  expect(
    await page.evaluate(() =>
      window.localStorage.getItem('fustify.activity-dock.open'),
    ),
  ).toBe('false');

  await page.getByRole('button', { name: 'Open Activity' }).click();
  await page.getByRole('button', { name: 'Ownership' }).focus();
  await page.getByRole('button', { name: 'Ownership' }).press('Escape');
  await expect(activity).toBeVisible();
});

test('Activity is absent before an active match', async ({ page }) => {
  await openScenario(page, 'pregame');
  await expect(
    page.getByRole('region', { name: 'Activity', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Open Activity/ })).toHaveCount(
    0,
  );
});
