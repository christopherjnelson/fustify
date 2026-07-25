import { expect, test } from '@playwright/test';

test('brand preview is responsive and captures review artifacts', async ({
  page,
}, testInfo) => {
  await page.goto('/docs/brand/preview.html');
  await expect(page).toHaveTitle('Fustify brand preview');
  await expect(page.getByRole('heading', { name: 'FUSTIFY' })).toBeVisible();

  await page.getByTestId('brand-input').focus();
  await expect(page.getByTestId('brand-input')).toBeFocused();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  const screenshotRoot = `test-results/ui-review/${testInfo.project.name}`;
  await page.screenshot({
    path: `${screenshotRoot}/brand-preview.png`,
    fullPage: true,
  });

  for (const size of [16, 24, 32, 64]) {
    await page
      .locator(`.size-sample img[width="${size}"]`)
      .screenshot({ path: `${screenshotRoot}/brand-mark-${size}.png` });
  }
});
