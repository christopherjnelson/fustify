import { expect, test } from '@playwright/test';

test('a non-host sees the responsive and accessible authoritative match launch overlay', async ({
  page,
}, testInfo) => {
  await page.goto(
    '/multiplayer/match/visual-match?visual-review=1&scenario=multiplayer-match-launch&role=nonhost',
  );

  const overlay = page.getByRole('dialog', {
    name: 'Preparing Visual Atlas',
  });
  await expect(overlay).toBeVisible();
  await expect(overlay).toBeFocused();
  await expect(
    overlay.getByText(/balancing starting territories/i),
  ).toBeVisible();
  await expect(overlay.locator('[role="progressbar"]')).toHaveCount(0);
  await expect(overlay.getByText(/\d+%/)).toHaveCount(0);

  await page.screenshot({
    fullPage: true,
    path: `test-results/ui-review/${testInfo.project.name}/multiplayer-match-launch.png`,
  });
});
