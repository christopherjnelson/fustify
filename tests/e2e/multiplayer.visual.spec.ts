import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const visualAuthState = 'test-results/multiplayer-visual-auth.json';

test('multiplayer lobby visual', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-390');
  const hasReusableIdentity = existsSync(visualAuthState);
  const context = await browser.newContext({
    storageState: hasReusableIdentity ? visualAuthState : undefined,
    viewport: testInfo.project.use.viewport,
  });
  const page = await context.newPage();
  await page.goto('/multiplayer');
  await page.getByLabel('Display name').fill('Visual Host');
  if (testInfo.project.name === 'desktop-1920' && !hasReusableIdentity) {
    // Responsive captures reuse this anonymous identity instead of consuming
    // multiple hosted Auth signups for one visual assertion.
    await context.storageState({ path: visualAuthState });
  }
  await page.getByRole('button', { name: 'Create private room' }).click();
  await expect(
    page.getByRole('heading', { name: 'Multiplayer lobby' }),
  ).toBeVisible();
  await expect(page.getByTestId('connection-status')).toHaveText('Live');
  const roomId = page.url().split('/').at(-1)!;

  try {
    const seedInput = page.getByLabel('Seed');
    const initialSeed = await seedInput.inputValue();
    expect(initialSeed).toMatch(/^[a-z]+-[a-z]+-\d{3}$/);
    expect(initialSeed).not.toBe('atlas-prime');
    const revisionLabel = page.locator(
      '.room-summary-status > span:first-child',
    );
    const initialRevision = await revisionLabel.textContent();
    await page.getByRole('button', { name: 'Generate World' }).click();
    await expect(revisionLabel).not.toHaveText(initialRevision!);
    const generatedSeed = await seedInput.inputValue();
    expect(generatedSeed).not.toBe(initialSeed);
    await page.reload();
    await expect(seedInput).toHaveValue(generatedSeed);

    const deterministicSeed = `multiplayer-visual-${testInfo.project.name}`;
    const generatedRevision = await revisionLabel.textContent();
    await seedInput.fill(deterministicSeed);
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(revisionLabel).not.toHaveText(generatedRevision!);
    await page.reload();
    await expect(seedInput).toHaveValue(deterministicSeed);
    const preview = page.getByTestId('multiplayer-minimap');
    await expect(preview).toBeVisible();
    await expect(preview.locator('.minimap-territories path')).toHaveCount(42);
    await expect(
      preview.locator('button, input, select, a, [tabindex]'),
    ).toHaveCount(0);

    await page.screenshot({
      fullPage: true,
      path: `test-results/ui-review/${testInfo.project.name}/multiplayer-lobby-visual.png`,
    });
    await expect(page.locator('.multiplayer-shell')).toHaveScreenshot(
      `multiplayer-lobby-${testInfo.project.name}.png`,
      {
        mask: [page.getByTestId('room-code'), page.getByLabel('Seed')],
      },
    );
  } finally {
    await page.evaluate(async (id) => {
      const { getSupabaseClient } =
        await import('/src/multiplayer/supabaseClient.ts');
      await getSupabaseClient().rpc('close_room', { room_id: id });
      await getSupabaseClient().rpc('leave_room', { room_id: id });
    }, roomId);
    await context.close();
  }
});
