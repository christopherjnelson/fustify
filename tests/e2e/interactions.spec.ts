import { expect, test } from '@playwright/test';
import { openScenario, stateSnapshot } from './helpers';

test('world and pregame controls have accessible labels and headings', async ({
  page,
}) => {
  await openScenario(page, 'world-setup');
  await expect(
    page.getByRole('heading', { name: 'Configure your world' }),
  ).toBeVisible();
  await expect(page.getByLabel('Planet seed')).toHaveValue(
    'visual-review-atlas',
  );
  await expect(page.getByLabel('Territory count')).toHaveValue('42');

  await openScenario(page, 'pregame');
  await expect(
    page.getByRole('heading', { name: 'Choose your factions' }),
  ).toBeVisible();
  await expect(page.getByLabel('Player 1 name')).toBeVisible();
  await expect(page.getByLabel(/Crimson League color/i)).toBeVisible();
});

test('handoff traps focus and reveals the prepared turn', async ({ page }) => {
  await openScenario(page, 'handoff');
  const dialog = page.getByRole('dialog');
  const begin = page.getByRole('button', {
    name: /Begin turn 1 for Crimson League/i,
  });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(begin).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(begin).toBeFocused();
  await begin.click();
  await expect(page.locator('.turn-banner')).toContainText(
    'Turn 1 · Reinforce',
  );
  expect((await stateSnapshot(page)).mode).toBe('playing');
});

test('territory navigator opens, focuses search, selects, focuses camera, and closes', async ({
  page,
}) => {
  await openScenario(page, 'navigator');
  const trigger = page.getByRole('button', { name: /Territory list/i });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Territory navigator' });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Search territories')).toBeFocused();
  const before = await stateSnapshot(page);
  await dialog.locator('ul button:not(:disabled)').first().click();
  const after = await stateSnapshot(page);
  expect(after.focusSequence).toBe(before.focusSequence + 1);
  expect(after.focusTargetTerritoryId).not.toBeNull();
  await page.getByRole('button', { name: /Close and view globe/i }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('keyboard shortcut opens and Escape closes the navigator', async ({
  page,
}) => {
  await openScenario(page, 'navigator');
  await page.keyboard.press('Control+K');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('reinforcement controls advance to attack', async ({ page }) => {
  await openScenario(page, 'reinforcement');
  await page.getByRole('button', { name: /Territory list/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('ul button:not(:disabled)').first().click();
  await page.getByRole('button', { name: /Close and view globe/i }).click();
  await page.getByRole('button', { name: /Place all/i }).click();
  await expect(page.getByText('Attack phase', { exact: true })).toBeVisible();
  expect((await stateSnapshot(page)).phase).toBe('attack');
});

test('attack source and target scenarios expose legal phase controls', async ({
  page,
}) => {
  await openScenario(page, 'attack-source');
  await expect(page.getByText('Attack phase', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'End attack phase' }),
  ).toBeEnabled();

  await openScenario(page, 'attack-target');
  await expect(page.getByLabel('Attack dice')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Attack', exact: true }),
  ).toBeEnabled();
});

test('pending capture and fortification controls complete phase actions', async ({
  page,
}) => {
  await openScenario(page, 'pending-capture');
  await expect(
    page.getByRole('heading', { name: 'Move armies in' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Complete capture move' }).click();
  expect((await stateSnapshot(page)).phase).toBe('attack');

  await openScenario(page, 'fortification');
  await page.getByRole('button', { name: 'Skip fortification' }).click();
  await expect(
    page.getByRole('heading', { name: /Ready for the next player/i }),
  ).toBeVisible();
  expect((await stateSnapshot(page)).phase).toBe('turn-end');
});

test('event log and saved resume controls are operable', async ({ page }) => {
  await openScenario(page, 'reinforcement');
  const logButton = page.getByRole('button', { name: /Event log/i });
  await logButton.click();
  await expect(page.getByText('Latest events')).toBeVisible();
  await page.getByRole('button', { name: 'Hide log' }).click();
  await expect(page.getByText('Latest events')).toBeHidden();

  await openScenario(page, 'saved-resume');
  await expect(page.getByText('Local match available')).toBeVisible();
  await page.getByRole('button', { name: 'Resume saved match' }).click();
  await expect(page.getByRole('dialog')).toContainText('Pass the device');
});

test('game-over dialog provides review and rematch choices', async ({
  page,
}) => {
  await openScenario(page, 'game-over');
  const dialog = page.getByRole('dialog', { name: 'Match won' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Review world' }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Same ownership rematch' }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Reroll ownership' }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Different world' }),
  ).toBeVisible();
});
