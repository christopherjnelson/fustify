import { expect, test, type Page } from '@playwright/test';

async function waitForGeneratedWorld(page: Page) {
  const loaded = page.locator('.home-world-loaded');
  await expect(loaded).toHaveAttribute('data-territories', '42', {
    timeout: 15_000,
  });
  await expect(loaded).toHaveAttribute('data-continents', '5');
  await expect(page.locator('.home-world-canvas')).toBeVisible();
  return loaded;
}

test('homepage preview progressively loads or waits for mobile opt-in', async ({
  page,
}, testInfo) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/?visual-review=home');
  const preview = page.locator('.home-world-preview');

  if (testInfo.project.name === 'mobile-390') {
    await expect(preview).toHaveAttribute('data-load-mode', 'manual');
    expect(
      requests.filter(
        (url) => url.includes('three') || url.includes('generatePlanet'),
      ),
    ).toEqual([]);
    await preview.getByRole('button', { name: 'View Generated Globe' }).click();
  } else {
    await expect(preview).toHaveAttribute('data-load-mode', 'automatic');
  }

  const loaded = await waitForGeneratedWorld(page);
  await expect(loaded).toHaveAttribute('data-seed', 'visual-review-atlas');
  await expect(
    preview.getByText('42 territories · 5 continents'),
  ).toBeVisible();
});

test('homepage preview regenerates with an accessible busy state', async ({
  page,
}, testInfo) => {
  await page.goto('/?visual-review=home');
  if (testInfo.project.name === 'mobile-390') {
    await page.getByRole('button', { name: 'View Generated Globe' }).click();
  }
  await waitForGeneratedWorld(page);
  const generate = page.locator('.home-world-toolbar button');
  await expect(generate).toHaveAccessibleName('Generate New World');
  await generate.click();
  await expect(generate).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByText('Generating…').first()).toBeVisible();
  await expect(generate).toHaveAttribute('aria-busy', 'false', {
    timeout: 15_000,
  });
  await expect(page.getByRole('status')).toContainText(
    'World ready: visual-review-atlas.',
  );
});

test('data-saver desktop visitors opt in before preview code loads', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1920');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    });
  });
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  const preview = page.locator('.home-world-preview');
  await expect(preview).toHaveAttribute('data-load-mode', 'manual');
  await expect(
    preview.getByRole('button', { name: 'View Generated Globe' }),
  ).toBeVisible();
  expect(
    requests.filter(
      (url) => url.includes('three') || url.includes('generatePlanet'),
    ),
  ).toEqual([]);
});

test('desktop hero keeps the preview beside the copy without overlap', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-390');
  await page.goto('/?visual-review=home');
  await waitForGeneratedWorld(page);
  const copy = await page.locator('.home-hero-copy').boundingBox();
  const preview = await page.locator('.home-world-preview').boundingBox();
  expect(copy).not.toBeNull();
  expect(preview).not.toBeNull();
  expect(copy!.x + copy!.width).toBeLessThanOrEqual(preview!.x);
  expect(preview!.x + preview!.width).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );
  if (testInfo.project.name === 'desktop-1920') {
    const modeCards = await page.locator('.mode-grid').boundingBox();
    expect(modeCards).not.toBeNull();
    expect(modeCards!.y + modeCards!.height).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerHeight),
    );
  }
});

test('a WebGL failure offers an accessible retry', async ({
  page,
}, testInfo) => {
  await page.goto('/?visual-review=home');
  if (testInfo.project.name === 'mobile-390') {
    await page.getByRole('button', { name: 'View Generated Globe' }).click();
  }
  await waitForGeneratedWorld(page);
  await page.locator('.home-world-canvas canvas').evaluate((canvas) => {
    canvas.dispatchEvent(
      new Event('webglcontextlost', { bubbles: false, cancelable: true }),
    );
  });
  await expect(
    page.getByText('Globe preview unavailable', { exact: true }),
  ).toBeVisible();
  const retry = page.getByRole('button', { name: 'Retry Globe Preview' });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(page.locator('.home-world-canvas')).toBeVisible();
  await expect(
    page.getByText('Globe preview unavailable', { exact: true }),
  ).toHaveCount(0);
});

test('navigating away while generation is active cleans up the preview', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    let terminationCount = 0;
    window.Worker = class extends NativeWorker {
      terminate() {
        terminationCount += 1;
        super.terminate();
      }
    };
    Object.defineProperty(window, '__homeWorkerTerminationCount', {
      configurable: true,
      get: () => terminationCount,
    });
  });
  await page.goto('/?visual-review=home');
  if (testInfo.project.name === 'mobile-390') {
    await page.getByRole('button', { name: 'View Generated Globe' }).click();
  }
  await waitForGeneratedWorld(page);
  await page.getByRole('button', { name: 'Generate New World' }).click();
  await page.getByRole('link', { name: 'Play Single Player' }).click();
  await expect(page).toHaveURL(/\/local$/);
  await expect(
    page.getByRole('heading', { name: 'Account required' }),
  ).toBeVisible();
  await expect(page.locator('.home-world-preview')).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __homeWorkerTerminationCount?: number;
          }
        ).__homeWorkerTerminationCount,
    ),
  ).toBeGreaterThanOrEqual(1);
});
