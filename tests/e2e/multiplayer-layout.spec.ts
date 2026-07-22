import { expect, test, type Page } from '@playwright/test';

async function openAuthoritativeMatch(page: Page) {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.goto(
    '/multiplayer/match/visual-match?visual-review=1&scenario=multiplayer-reinforcement-active',
  );
  await expect(page.getByTestId('multiplayer-match')).toBeVisible();
  await expect(page.getByTestId('multiplayer-authority-status')).toBeVisible();
}

async function layout(page: Page) {
  return page.evaluate(() => {
    const bounds = (selector: string) => {
      const box = document.querySelector(selector)!.getBoundingClientRect();
      return {
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
        width: box.width,
        height: box.height,
      };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scene: bounds('[data-testid="multiplayer-match"]'),
      canvas: bounds('.globe-canvas'),
      hud: bounds('.hud'),
      minimap: bounds('.minimap-panel'),
      legend: bounds('.control-legend'),
    };
  });
}

test('desktop authoritative match fills the viewport and survives refresh', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1920');
  await openAuthoritativeMatch(page);
  const before = await layout(page);

  expect(before.scene.height).toBeGreaterThanOrEqual(
    before.viewport.height * 0.98,
  );
  expect(before.canvas.height).toBeGreaterThan(700);
  expect(before.hud.left).toBeLessThan(30);
  expect(before.minimap.bottom).toBeGreaterThan(before.viewport.height * 0.75);
  expect(before.minimap.right).toBeLessThanOrEqual(before.viewport.width);
  expect(before.legend.bottom).toBeLessThanOrEqual(before.viewport.height);

  await page.reload();
  await expect(page.getByTestId('multiplayer-match')).toBeVisible();
  expect((await layout(page)).scene).toEqual(before.scene);
});

test('mobile authoritative match keeps required controls in bounds', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390');
  await openAuthoritativeMatch(page);
  const current = await layout(page);

  expect(current.scene.height).toBeGreaterThanOrEqual(
    current.viewport.height * 0.98,
  );
  for (const control of [current.hud, current.minimap, current.legend]) {
    expect(control.left).toBeGreaterThanOrEqual(0);
    expect(control.right).toBeLessThanOrEqual(current.viewport.width + 1);
    expect(control.top).toBeGreaterThanOrEqual(0);
    expect(control.bottom).toBeLessThanOrEqual(current.scene.height + 1);
  }
});
