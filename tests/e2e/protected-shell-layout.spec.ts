import { expect, test } from '@playwright/test';

test('multiplayer match shell owns the upper-right navigation and connection state', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('fustify:globe-controls-collapsed', 'true');
  });
  await page.goto(
    '/multiplayer/match/visual-match?visual-review=1&scenario=multiplayer-reinforcement-active',
  );
  const shell = page.locator('.branded-app-header');
  const hud = page.locator('.left-hud-rail');
  const minimap = page.getByTestId('minimap');
  const status = shell.getByTestId('connection-status');

  await expect(shell).toBeVisible();
  await expect(status).toHaveText('Live');
  await expect(status).toHaveAccessibleName('Connection status: Live');
  await expect(page.locator('.multiplayer-game-connection')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Multiplayer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  const layout = await page.evaluate(() => {
    const rect = (selector: string) =>
      document.querySelector(selector)!.getBoundingClientRect();
    const overlaps = (left: DOMRect, right: DOMRect) =>
      left.left < right.right &&
      left.right > right.left &&
      left.top < right.bottom &&
      left.bottom > right.top;
    const shellRect = rect('.branded-app-header');
    const hudRect = rect('.left-hud-rail');
    const minimapRect = rect('.minimap-panel');
    return {
      shellRight: shellRect.right,
      viewportWidth: window.innerWidth,
      hudTop: hudRect.top,
      shellOverlapsHud: overlaps(shellRect, hudRect),
      shellOverlapsMinimap: overlaps(shellRect, minimapRect),
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  });

  expect(layout.shellRight).toBeGreaterThan(layout.viewportWidth - 32);
  expect(layout.hudTop).toBeLessThanOrEqual(
    page.viewportSize()!.width <= 430 ? 76 : 18,
  );
  expect(layout.shellOverlapsHud).toBe(false);
  expect(layout.shellOverlapsMinimap).toBe(false);
  expect(layout.overflow).toBeLessThanOrEqual(1);
  await expect(hud).toBeVisible();
  await expect(minimap).toBeVisible();
  await page.screenshot({
    path: `test-results/ui-review/${testInfo.project.name}/multiplayer-match-shell.png`,
    fullPage: true,
  });
});
