import { expect, test, type Page } from '@playwright/test';

async function expectNoOverlap(page: Page) {
  const panel = await page.locator('.game-setup-shell-overlay').boundingBox();
  const minimap = await page.getByTestId('minimap').boundingBox();
  const legend = await page.locator('.control-legend').boundingBox();
  expect(panel).not.toBeNull();
  expect(minimap).not.toBeNull();
  expect(legend).not.toBeNull();

  const overlaps = (
    left: NonNullable<typeof panel>,
    right: NonNullable<typeof panel>,
  ) =>
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y;

  expect(overlaps(panel!, minimap!)).toBe(false);
  expect(overlaps(panel!, legend!)).toBe(false);
}

async function expectGlobeDrag(page: Page) {
  const canvas = page.locator('.globe-canvas');
  const focus = page.getByTestId('minimap').locator('.minimap-focus');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const before = await focus.evaluate((element) => ({
    longitude: element.getAttribute('data-longitude'),
    latitude: element.getAttribute('data-latitude'),
  }));
  const x = box!.x + box!.width * 0.72;
  const y = box!.y + box!.height * 0.42;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y + 40, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() =>
      focus.evaluate((element) => ({
        longitude: element.getAttribute('data-longitude'),
        latitude: element.getAttribute('data-latitude'),
      })),
    )
    .not.toEqual(before);
}

test('local setup keeps both compact stages beside the interactive globe', async ({
  page,
}, testInfo) => {
  test.skip(
    !['desktop-1920', 'laptop-1366'].includes(testInfo.project.name),
    'Focused desktop setup check',
  );

  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.goto(
    '/local?v=1&seed=local-setup-layout&territories=42&continents=5&players=4&assignment=random',
  );
  await page.locator('.globe-canvas').waitFor({ state: 'visible' });
  await expect(
    page.getByRole('heading', { name: 'Choose your world' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'World settings' }),
  ).toBeVisible();
  await expect(page.getByLabel('Planet seed')).toBeVisible();
  await expect(page.getByLabel('Territory count')).toBeVisible();
  await expect(page.getByLabel('Continent count')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Generate World' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await expect(page.locator('.globe-canvas')).toBeVisible();
  await expect(page.getByTestId('minimap')).toBeVisible();
  await expectNoOverlap(page);
  await expectGlobeDrag(page);
  await page.screenshot({
    path: `test-results/ui-review/${testInfo.project.name}/local-world-setup.png`,
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(
    page.getByRole('heading', { name: 'Preview and assign territories' }),
  ).toBeVisible();
  await expect(page.getByTestId(/^local-seat-/)).toHaveCount(4);
  for (let seat = 1; seat <= 4; seat += 1) {
    await expect(page.getByLabel(`Player ${seat} name`)).toBeVisible();
  }
  await expect(page.locator('select[aria-label$=" color"]')).toHaveCount(4);
  await expect(page.locator('select[aria-label$=" controller"]')).toHaveCount(
    4,
  );
  await expect(page.getByLabel('Player count')).toHaveValue('4');
  await expect(page.getByLabel('Random assignment')).toBeChecked();
  await expect(page.getByLabel('Player draft')).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'World settings' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save setup' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Assign territories' }),
  ).toBeVisible();
  await expect(page.getByTestId('minimap')).toHaveAttribute(
    'data-testid',
    'minimap',
  );
  await expect(
    page.getByTestId('minimap').locator('.minimap-map'),
  ).toHaveAttribute('data-interactive', 'false');
  await expectNoOverlap(page);

  const documentOverflow = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  expect(documentOverflow).toBeLessThanOrEqual(1);
  const actions = await page.locator('.setup-action-bar').boundingBox();
  const viewport = page.viewportSize();
  expect(actions).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(actions!.y + actions!.height).toBeLessThanOrEqual(viewport!.height);
  await page.screenshot({
    path: `test-results/ui-review/${testInfo.project.name}/local-player-setup.png`,
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Save setup' }).click();
  await page.getByRole('button', { name: 'World settings' }).click();
  await expect(page.getByLabel('Local saved session')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Resume saved session' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete save' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume saved session' }).click();
  await expect(
    page.getByRole('heading', { name: 'Preview and assign territories' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'World settings' }).click();
  await page.getByRole('button', { name: 'Delete save' }).click();
  await expect(page.getByLabel('Local saved session')).toHaveCount(0);
});
