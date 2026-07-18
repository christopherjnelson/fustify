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
    page.getByRole('heading', { name: 'Preview and assign territories' }),
  ).toBeVisible();
  await expect(page.getByLabel('Player 1 name')).toBeVisible();
  await expect(page.getByLabel(/Crimson League color/i)).toBeVisible();
  await expect(page.getByLabel('Random assignment')).toBeChecked();
  await expect(page.getByLabel('Player draft')).toBeEnabled();
});

test('minimap follows neutral, draft, ready, and active ownership lifecycle', async ({
  page,
}) => {
  await openScenario(page, 'pregame');
  const minimap = page.getByTestId('minimap');
  await expect(minimap).toBeVisible();
  await expect(minimap).toHaveAccessibleName('World minimap');
  const territories = minimap.locator('.minimap-territories path');
  await expect(territories).toHaveCount(42);
  await expect(
    minimap.locator('.minimap-territories path[data-owner-id=""]'),
  ).toHaveCount(42);

  await page.getByLabel('Player draft').check();
  await page.getByRole('button', { name: 'Begin player draft' }).click();
  await page.getByLabel('Territory to claim').selectOption('territory-01');
  await page.getByRole('button', { name: /Claim for Crimson League/i }).click();
  await expect(
    minimap.locator('[data-territory-id="territory-01"]'),
  ).toHaveAttribute('data-owner-id', 'player-01');
  await page.getByRole('button', { name: 'Restart draft' }).click();
  await expect(
    minimap.locator('.minimap-territories path[data-owner-id=""]'),
  ).toHaveCount(42);
  await page.getByLabel('Territory to claim').selectOption('territory-02');
  await page.getByRole('button', { name: /Claim for Crimson League/i }).click();
  await page.getByRole('button', { name: 'Cancel draft' }).click();
  await expect(
    minimap.locator('.minimap-territories path[data-owner-id=""]'),
  ).toHaveCount(42);

  await openScenario(page, 'pregame-random-ready');
  await expect(
    page
      .getByTestId('minimap')
      .locator('.minimap-territories path[data-owner-id=""]'),
  ).toHaveCount(0);
  await openScenario(page, 'draft-complete');
  await expect(
    page
      .getByTestId('minimap')
      .locator('.minimap-territories path[data-owner-id=""]'),
  ).toHaveCount(0);
  await openScenario(page, 'reinforcement');
  await expect(page.getByTestId('minimap')).toBeVisible();
  await expect(
    page
      .getByTestId('minimap')
      .locator('.minimap-territories path[data-owner-id=""]'),
  ).toHaveCount(0);
  await expect(page.locator('.minimap-active-player')).toContainText(
    'Crimson League',
  );
});

test('minimap reflects reducer ownership and remains a non-interactive overview', async ({
  page,
}) => {
  await openScenario(page, 'pending-capture');
  const minimap = page.getByTestId('minimap');
  const before = await stateSnapshot(page);
  for (const [territoryId, territory] of Object.entries(
    before.match.territories,
  )) {
    await expect(
      minimap.locator(`[data-territory-id="${territoryId}"]`),
    ).toHaveAttribute('data-owner-id', territory.ownerId);
  }
  await expect(
    minimap.locator('button, input, select, a, [tabindex]'),
  ).toHaveCount(0);
  const bounds = await minimap.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + 12);
  const after = await stateSnapshot(page);
  expect(after.match).toEqual(before.match);
  expect(after.setupPhase).toBe(before.setupPhase);

  await page.getByRole('button', { name: /Territory list/i }).focus();
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() =>
      document
        .querySelector('.minimap-panel')
        ?.contains(document.activeElement),
    ),
  ).toBe(false);
});

test('minimap stays in bounds and separate from primary controls', async ({
  page,
}) => {
  await openScenario(page, 'pregame');
  const viewport = page.viewportSize()!;
  const minimap = await page.getByTestId('minimap').boundingBox();
  const panel = await page.locator('.pregame-panel').boundingBox();
  expect(minimap).not.toBeNull();
  expect(panel).not.toBeNull();
  expect(minimap!.x).toBeGreaterThanOrEqual(0);
  expect(minimap!.y).toBeGreaterThanOrEqual(0);
  expect(minimap!.x + minimap!.width).toBeLessThanOrEqual(viewport.width);
  expect(minimap!.y + minimap!.height).toBeLessThanOrEqual(viewport.height);
  const overlaps =
    minimap!.x < panel!.x + panel!.width &&
    minimap!.x + minimap!.width > panel!.x &&
    minimap!.y < panel!.y + panel!.height &&
    minimap!.y + minimap!.height > panel!.y;
  expect(overlaps).toBe(false);
});

test('world setup, player validation, ownership reroll, and match start flow', async ({
  page,
}) => {
  await openScenario(page, 'world-setup');
  await page.getByLabel('Planet seed').fill('browser-gameplay-flow');
  await page.getByLabel('Territory count').fill('18');
  await page.getByLabel('Continent count').fill('3');
  await page.getByLabel('Player count').fill('3');
  await page.getByRole('button', { name: 'Generate / apply' }).click();
  await expect(
    page.getByRole('heading', { name: 'Preview and assign territories' }),
  ).toBeVisible();
  expect((await stateSnapshot(page)).hasMatch).toBe(false);
  expect(
    (await stateSnapshot(page)).planet.territories.every(
      (territory) => territory.ownerId === null && territory.armyCount === 0,
    ),
  ).toBe(true);

  const firstName = page.getByLabel('Player 1 name');
  const secondName = page.getByLabel('Player 2 name');
  await firstName.fill('North');
  await secondName.fill('North');
  await expect(page.getByRole('alert')).toContainText(/names must be unique/i);
  await expect(
    page.getByRole('button', { name: 'Begin random assignment' }),
  ).toBeDisabled();
  await secondName.fill('South');
  const firstColor = page.locator('select').nth(0);
  const secondColor = page.locator('select').nth(1);
  const firstColorValue = await firstColor.inputValue();
  await expect(
    secondColor.locator(`option[value="${firstColorValue}"]`),
  ).toHaveAttribute('disabled', '');

  await page.getByRole('button', { name: 'Begin random assignment' }).click();
  await expect(page.getByText(/Ready · Variant 0/)).toBeVisible();
  await expect(
    page
      .getByTestId('minimap')
      .locator('.minimap-territories path[data-owner-id=""]'),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Reroll assignment' }).click();
  await expect(page.getByText(/Ready · Variant 1/)).toBeVisible();
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(page.getByRole('dialog')).toContainText('Pass the device');
  await page.getByRole('button', { name: /Begin turn 1/i }).click();
  await expect(page.locator('.turn-banner')).toContainText(
    'Turn 1 · Reinforce',
  );
});

test('pregame balance states enforce start behavior and expose details', async ({
  page,
}) => {
  await openScenario(page, 'pregame-invalid');
  await expect(page.getByText('Start blocked')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start match' }),
  ).toBeDisabled();

  await openScenario(page, 'pregame-poor');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(
    page.getByRole('heading', { name: 'Preview and assign territories' }),
  ).toBeVisible();

  await openScenario(page, 'pregame-expanded');
  await page.getByText('How is this scored?').click();
  await expect(
    page.getByText(/Eight categories compare totals/i),
  ).toBeVisible();
  await page.locator('.pregame-panel').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByRole('button', { name: 'Start match' })).toBeVisible();

  await openScenario(page, 'pregame-rerolled');
  await expect(page.getByText(/Ready · Variant 1/)).toBeVisible();
});

test('player draft is keyboard-operable, advances turns, rejects duplicates, and starts explicitly', async ({
  page,
}) => {
  await openScenario(page, 'pregame');
  await page.getByLabel('Player draft').focus();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Player draft')).toBeChecked();
  await page.getByRole('button', { name: 'Begin player draft' }).click();
  await expect(
    page.getByRole('heading', { name: /Crimson League chooses now/i }),
  ).toBeVisible();
  await page.getByLabel('Territory to claim').selectOption('territory-01');
  await page.getByRole('button', { name: /Claim for Crimson League/i }).click();
  await expect(
    page.getByRole('heading', { name: /Azure Pact chooses now/i }),
  ).toBeVisible();
  await page.getByLabel('Territory to claim').selectOption('territory-01');
  await page.getByRole('button', { name: /Claim for Azure Pact/i }).click();
  await expect(page.getByRole('alert')).toContainText(/already been drafted/i);

  await openScenario(page, 'draft-complete');
  await expect(page.getByText('Draft ready')).toBeVisible();
  await expect(page.getByText(/Draft balance is advisory/i)).toBeVisible();
  await page.getByRole('button', { name: 'Start match' }).click();
  await expect(page.getByRole('dialog')).toContainText('Pass the device');
});

test('neutral and in-progress draft setups save and resume', async ({
  page,
}) => {
  for (const scenario of ['pregame', 'draft-in-progress'] as const) {
    await openScenario(page, scenario);
    const expectedPhase = (await stateSnapshot(page)).setupPhase;
    const expectedPick = (await stateSnapshot(page)).draftPickIndex;
    await page.getByRole('button', { name: 'Save setup' }).click();
    await page.reload();
    await page.waitForFunction(() => window.__WORLDSEED_VISUAL__ !== undefined);
    await page.getByRole('button', { name: 'Resume saved session' }).click();
    const resumed = await stateSnapshot(page);
    expect(resumed.setupPhase).toBe(expectedPhase);
    expect(resumed.draftPickIndex).toBe(expectedPick);
    expect(resumed.hasMatch).toBe(false);
  }
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
  const focusMarker = page.locator('.minimap-focus');
  const initialTransform = await focusMarker.getAttribute('transform');
  await dialog.locator('ul button:not(:disabled)').first().click();
  const after = await stateSnapshot(page);
  expect(after.focusSequence).toBe(before.focusSequence + 1);
  expect(after.focusTargetTerritoryId).not.toBeNull();
  await expect
    .poll(() => focusMarker.getAttribute('transform'))
    .not.toBe(initialTransform);
  expect((await stateSnapshot(page)).globeFocus).not.toEqual(before.globeFocus);
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

test('invalid reinforcement and non-adjacent attack preserve serializable state', async ({
  page,
}) => {
  await openScenario(page, 'reinforcement');
  const before = await stateSnapshot(page);
  const enemyId = Object.entries(before.match.territories).find(
    ([, territory]) => territory.ownerId !== before.match.activePlayerId,
  )![0];
  await page.evaluate((territoryId) => {
    window.__WORLDSEED_VISUAL__!.dispatch({
      type: 'PLACE_REINFORCEMENT',
      territoryId,
      amount: 1,
    });
  }, enemyId);
  await expect(page.getByRole('alert')).toContainText('NOT OWNER');
  expect((await stateSnapshot(page)).match).toEqual(before.match);

  await openScenario(page, 'attack-source');
  const attack = await stateSnapshot(page);
  const sourceId = attack.match.selectedSourceTerritoryId!;
  const adjacent = new Set(
    attack.planet.territories.find(({ id }) => id === sourceId)!
      .adjacentTerritoryIds,
  );
  const nonAdjacentEnemy = Object.entries(attack.match.territories).find(
    ([id, territory]) =>
      territory.ownerId !== attack.match.activePlayerId && !adjacent.has(id),
  )![0];
  const attackBefore = attack.match;
  await page.evaluate(
    ({ fromTerritoryId, toTerritoryId }) => {
      window.__WORLDSEED_VISUAL__!.dispatch({
        type: 'ATTACK',
        fromTerritoryId,
        toTerritoryId,
        attackDice: 1,
      });
    },
    { fromTerritoryId: sourceId, toTerritoryId: nonAdjacentEnemy },
  );
  await expect(page.getByRole('alert')).toContainText('NOT ADJACENT');
  expect((await stateSnapshot(page)).match).toEqual(attackBefore);
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

test('land-border and sea-route combat use dice controls and reducer state', async ({
  page,
}) => {
  for (const connectionType of ['land-border', 'sea-route'] as const) {
    await openScenario(page, 'attack-source');
    await page.evaluate(
      (type) => window.__WORLDSEED_VISUAL__!.prepareAttack(type),
      connectionType,
    );
    await expect(page.getByLabel('Attack dice')).toBeVisible();
    const sequence = (await stateSnapshot(page)).match.combatSequence;
    await page.getByRole('button', { name: 'Attack', exact: true }).click();
    expect((await stateSnapshot(page)).match.combatSequence).toBe(sequence + 1);
  }
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

test('capture rejects insufficient movement and player elimination is announced in events', async ({
  page,
}) => {
  await openScenario(page, 'pending-capture');
  const pending = (await stateSnapshot(page)).match.pendingCapture!;
  const before = (await stateSnapshot(page)).match;
  await page.evaluate(({ fromTerritoryId, toTerritoryId, minimumArmies }) => {
    window.__WORLDSEED_VISUAL__!.dispatch({
      type: 'MOVE_AFTER_CAPTURE',
      fromTerritoryId,
      toTerritoryId,
      amount: minimumArmies - 1,
    });
  }, pending);
  await expect(page.getByRole('alert')).toContainText('INVALID AMOUNT');
  expect((await stateSnapshot(page)).match).toEqual(before);

  await openScenario(page, 'player-elimination');
  await expect(page.getByText('A player was eliminated.')).toBeVisible();
  expect(
    Object.values((await stateSnapshot(page)).match.players).some(
      ({ eliminated }) => eliminated,
    ),
  ).toBe(true);
});

test('valid and invalid fortification follow owned connectivity', async ({
  page,
}) => {
  await openScenario(page, 'fortification');
  const snapshot = await stateSnapshot(page);
  const owned = Object.entries(snapshot.match.territories).filter(
    ([, territory]) => territory.ownerId === snapshot.match.activePlayerId,
  );
  const source = owned.find(([, territory]) => territory.armyCount >= 2);
  expect(source, 'fixture must provide a fortification source').toBeDefined();
  const enemy = Object.entries(snapshot.match.territories).find(
    ([, territory]) => territory.ownerId !== snapshot.match.activePlayerId,
  )![0];
  await page.evaluate(
    ({ fromTerritoryId, toTerritoryId }) => {
      window.__WORLDSEED_VISUAL__!.dispatch({
        type: 'FORTIFY',
        fromTerritoryId,
        toTerritoryId,
        amount: 1,
      });
    },
    { fromTerritoryId: source![0], toTerritoryId: enemy },
  );
  await expect(page.getByRole('alert')).toContainText('NOT OWNER');

  const adjacency = new Map(
    snapshot.planet.territories.map((territory) => [
      territory.id,
      territory.adjacentTerritoryIds,
    ]),
  );
  const queue = [source![0]];
  const visited = new Set<string>();
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (
        snapshot.match.territories[next]?.ownerId ===
        snapshot.match.activePlayerId
      )
        queue.push(next);
    }
  }
  const target = [...visited].find((id) => id !== source![0]);
  expect(
    target,
    'fixture must provide an owned fortification path',
  ).toBeDefined();
  await page.evaluate(
    ({ fromTerritoryId, toTerritoryId }) => {
      window.__WORLDSEED_VISUAL__!.dispatch({
        type: 'FORTIFY',
        fromTerritoryId,
        toTerritoryId,
        amount: 1,
      });
    },
    { fromTerritoryId: source![0], toTerritoryId: target! },
  );
  expect((await stateSnapshot(page)).phase).toBe('turn-end');
});

for (const scenario of [
  'reinforcement',
  'attack-source',
  'pending-capture',
  'fortification',
] as const) {
  test(`save and reload preserves ${scenario} phase through handoff`, async ({
    page,
  }) => {
    await openScenario(page, scenario);
    const expectedPhase = (await stateSnapshot(page)).phase;
    await page.evaluate(() => window.__WORLDSEED_VISUAL__!.save());
    await page.reload();
    await page.waitForFunction(() => window.__WORLDSEED_VISUAL__ !== undefined);
    await page.getByRole('button', { name: 'Resume saved session' }).click();
    await expect(page.getByRole('dialog')).toContainText('Pass the device');
    await page.getByRole('button', { name: /Begin turn/i }).click();
    expect((await stateSnapshot(page)).phase).toBe(expectedPhase);
  });
}

test('turn completion, next-player handoff, and both rematch modes retain intended setup', async ({
  page,
}) => {
  await openScenario(page, 'fortification');
  const active = (await stateSnapshot(page)).match.activePlayerId;
  await page.getByRole('button', { name: 'Skip fortification' }).click();
  await page.getByRole('button', { name: 'End turn' }).click();
  await expect(page.getByRole('dialog')).toContainText('Pass the device');
  const handed = await stateSnapshot(page);
  expect(handed.match.activePlayerId).not.toBe(active);
  await page.getByRole('button', { name: /Begin turn 2/i }).click();
  await expect(page.locator('.turn-banner')).toContainText(
    'Turn 2 · Reinforce',
  );

  await openScenario(page, 'game-over');
  const originalVariant = (await stateSnapshot(page)).ownershipVariant;
  await page.getByRole('button', { name: 'Same ownership rematch' }).click();
  expect((await stateSnapshot(page)).ownershipVariant).toBe(originalVariant);
  await expect(page.getByRole('dialog')).toContainText('Pass the device');

  await openScenario(page, 'game-over');
  await page.getByRole('button', { name: 'Reroll ownership' }).click();
  await expect(
    page.getByRole('heading', { name: 'Preview and assign territories' }),
  ).toBeVisible();
  expect((await stateSnapshot(page)).ownershipVariant).toBe(
    originalVariant + 1,
  );
});

test('event log and saved resume controls are operable', async ({ page }) => {
  await openScenario(page, 'reinforcement');
  const logButton = page.getByRole('button', { name: /Event log/i });
  await logButton.click();
  await expect(page.getByText('Latest events')).toBeVisible();
  await page.getByRole('button', { name: 'Hide log' }).click();
  await expect(page.getByText('Latest events')).toBeHidden();

  await openScenario(page, 'saved-resume');
  await expect(page.getByText('Local session available')).toBeVisible();
  await page.getByRole('button', { name: 'Resume saved session' }).click();
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
