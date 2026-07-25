import { expect, test } from '@playwright/test';
import { openScenario } from './helpers';

test('globe controls collapse safely and remember the session preference', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-390',
    'Mobile intentionally starts with the compact control',
  );
  await page.clock.install();
  await openScenario(page, 'world-setup', 'expanded');

  const controls = page.getByRole('complementary', {
    name: 'Globe controls',
  });
  const toggle = page.getByRole('button', { name: 'Controls' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(controls.getByText('Drag')).toBeVisible();

  await controls.hover();
  await page.clock.fastForward(8_100);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await page.mouse.move(900, 200);
  await page.clock.fastForward(8_100);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.focus();
  await page.clock.fastForward(8_100);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await toggle.click();
  await page.reload();
  await page.locator('.globe-canvas').waitFor({ state: 'visible' });
  await expect(page.getByRole('button', { name: 'Controls' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('globe controls are viewport-centered and collapse after interaction', async ({
  page,
}, testInfo) => {
  await openScenario(page, 'reinforcement', 'expanded');
  const controls = page.getByRole('complementary', {
    name: 'Globe controls',
  });
  const bounds = await controls.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(
    Math.abs(bounds!.x + bounds!.width / 2 - viewport!.width / 2),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: `test-results/ui-review/${testInfo.project.name}/controls-expanded.png`,
    fullPage: true,
  });

  await page.locator('.globe-canvas').dispatchEvent('wheel');
  await expect(page.getByRole('button', { name: 'Controls' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.screenshot({
    path: `test-results/ui-review/${testInfo.project.name}/controls-collapsed.png`,
    fullPage: true,
  });
});
