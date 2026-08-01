import { expect, test, type Page } from '@playwright/test';
import { openScenario, reviewPath, stateSnapshot } from './helpers';
import { installRegisteredAuthFixture } from './registeredAuthTestClient';

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith('mobile-'),
    'Mobile gameplay chrome is covered by touch-enabled projects.',
  );
  await installRegisteredAuthFixture(page);
});

function mobileToolbar(page: Page) {
  return page.getByRole('navigation', { name: 'Mobile match controls' });
}

async function capture(
  page: Page,
  testInfo: Parameters<typeof reviewPath>[0],
  name: string,
) {
  await page.screenshot({
    path: reviewPath(testInfo, `mobile-gameplay-${name}`),
    fullPage: true,
    animations: 'disabled',
  });
}

test('keeps a real touchable globe exposed behind the phase peek', async ({
  page,
}, testInfo) => {
  await openScenario(page, 'reinforcement');
  const toolbar = mobileToolbar(page);
  const actions = toolbar.getByRole('button', { name: 'Actions' });
  await expect(toolbar).toBeVisible();
  await expect(actions).toHaveAttribute('aria-expanded', 'false');

  const layout = await page.evaluate(() => {
    const shell = document
      .querySelector('.mobile-gameplay-shell')!
      .getBoundingClientRect();
    const point = { x: window.innerWidth / 2, y: shell.top / 2 };
    const hit = document.elementFromPoint(point.x, point.y);
    return {
      shellTop: shell.top,
      viewportHeight: window.innerHeight,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      point,
      hitCanvas: hit?.closest('.globe-canvas') !== null,
    };
  });
  expect(layout.shellTop / layout.viewportHeight).toBeGreaterThanOrEqual(0.65);
  expect(layout.overflow).toBeLessThanOrEqual(1);
  expect(layout.hitCanvas).toBe(true);
  await capture(page, testInfo, 'peek');
  await expect(page.locator('.mobile-gameplay-shell')).toHaveScreenshot(
    'mobile-gameplay-peek.png',
  );

  await page.evaluate(() => {
    const canvas = document.querySelector('.globe-canvas')!;
    canvas.addEventListener(
      'pointerdown',
      () =>
        document.documentElement.setAttribute('data-mobile-canvas-hit', '1'),
      { once: true },
    );
  });
  await page.touchscreen.tap(layout.point.x, layout.point.y);
  await expect(page.locator('html')).toHaveAttribute(
    'data-mobile-canvas-hit',
    '1',
  );
});

test('switches accessible mobile surfaces without stacking overlays', async ({
  page,
}, testInfo) => {
  await openScenario(page, 'reinforcement');
  const toolbar = mobileToolbar(page);
  const actions = toolbar.getByRole('button', { name: 'Actions' });
  const activity = toolbar.getByRole('button', { name: 'Activity' });
  const map = toolbar.getByRole('button', { name: 'Map' });

  await actions.click();
  await expect(actions).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Armies to place')).toBeVisible();
  await page.locator('summary[aria-label="Settings"]').click();
  await expect(page.getByText(/Drag to rotate.*pinch to zoom/i)).toBeVisible();
  await capture(page, testInfo, 'actions');
  await expect(page.locator('.mobile-gameplay-shell')).toHaveScreenshot(
    'mobile-gameplay-actions.png',
  );

  await page.evaluate(() =>
    window.__WORLDSEED_VISUAL__!.appendActionEventBatch('other'),
  );
  await expect(activity.locator('.mobile-toolbar-badge')).toBeVisible();
  await activity.click();
  await expect(activity).toHaveAttribute('aria-expanded', 'true');
  await expect(actions).toHaveAttribute('aria-expanded', 'false');
  await expect(
    page.getByRole('region', { name: 'Activity', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#mobile-map-panel')).toHaveCount(0);
  await capture(page, testInfo, 'activity');
  await expect(page.locator('.mobile-gameplay-shell')).toHaveScreenshot(
    'mobile-gameplay-activity.png',
  );
  await page.getByRole('button', { name: 'Close Activity' }).click();
  await expect(activity).toBeFocused();

  await map.click();
  await expect(map).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page.getByRole('heading', { name: 'World minimap' }),
  ).toBeVisible();
  await expect(
    page.getByTestId('minimap').locator('.minimap-territories path'),
  ).toHaveCount((await stateSnapshot(page)).planet.territories.length);
  await page.waitForTimeout(300);
  await expect(page.locator('.mobile-match-dock')).toHaveCount(0);
  await capture(page, testInfo, 'map');
  await expect(page.locator('.mobile-map-sheet')).toHaveScreenshot(
    'mobile-gameplay-map.png',
  );
  await page.getByRole('button', { name: 'Close Map' }).click();
  await expect(map).toBeFocused();

  await toolbar.getByRole('button', { name: 'Territories' }).click();
  const navigator = page.locator('#territory-navigator');
  await expect(navigator).toBeVisible();
  await capture(page, testInfo, 'territories');
  await expect(navigator).toHaveScreenshot('mobile-gameplay-territories.png');
  await navigator
    .getByRole('button', { name: /Close and view globe/i })
    .click();
  await expect(
    toolbar.getByRole('button', { name: 'Territories' }),
  ).toBeFocused();
});

test('opens actions when a mobile reinforcement selection becomes actionable', async ({
  page,
}, testInfo) => {
  await openScenario(page, 'reinforcement');
  const toolbar = mobileToolbar(page);
  const actions = toolbar.getByRole('button', { name: 'Actions' });
  await toolbar.getByRole('button', { name: 'Territories' }).click();
  const navigator = page.locator('#territory-navigator');
  await navigator.locator('ul button:not(:disabled)').first().click();
  await navigator
    .getByRole('button', { name: /Close and view globe/i })
    .click();
  await expect(actions).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: /^Max:/ }).click();
  await page.getByRole('button', { name: /Place \d+ armies?/ }).click();
  expect((await stateSnapshot(page)).phase).toBe('attack');
  await expect(actions).toHaveAttribute('aria-expanded', 'false');
  await capture(page, testInfo, 'after-reinforcement');
});

test('keeps mandatory capture and turn-end actions immediately reachable', async ({
  page,
}, testInfo) => {
  await openScenario(page, 'pending-capture');
  const actions = mobileToolbar(page).getByRole('button', { name: 'Actions' });
  await expect(actions).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page.getByRole('button', { name: 'Complete capture move' }),
  ).toBeVisible();
  await capture(page, testInfo, 'capture');
  await expect(page.locator('.mobile-gameplay-shell')).toHaveScreenshot(
    'mobile-gameplay-capture.png',
  );
  await page.getByRole('button', { name: 'Complete capture move' }).click();
  expect((await stateSnapshot(page)).phase).toBe('attack');

  await openScenario(page, 'fortification');
  if ((await actions.getAttribute('aria-expanded')) !== 'true') {
    await actions.click();
  }
  await page.getByRole('button', { name: 'Skip fortification' }).click();
  await expect(actions).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible();
  await capture(page, testInfo, 'turn-end');
  await expect(page.locator('.mobile-gameplay-shell')).toHaveScreenshot(
    'mobile-gameplay-turn-end.png',
  );
});

test('uses the same compact shell for multiplayer authority and waiting states', async ({
  page,
}) => {
  await openScenario(page, 'multiplayer-authority');
  await expect(mobileToolbar(page)).toBeVisible();
  await mobileToolbar(page).getByRole('button', { name: 'Actions' }).click();
  await expect(page.getByTestId('multiplayer-authority-status')).toBeVisible();
  await expect(page.locator('.gameplay-right-rail .minimap-panel')).toHaveCount(
    0,
  );
});
