import { existsSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const authStateA = 'test-results/multiplayer-waiting-player-a.json';
const authStateB = 'test-results/multiplayer-waiting-player-b.json';

async function openPlayer(
  context: BrowserContext,
  displayName: string,
  authStatePath: string,
) {
  const page = await context.newPage();
  await page.goto('/multiplayer');
  await expect(
    page.getByRole('heading', { name: 'Private multiplayer rooms' }),
  ).toBeVisible();
  if (!existsSync(authStatePath)) {
    await context.storageState({ path: authStatePath });
  }
  await page.getByLabel('Display name').fill(displayName);
  return page;
}

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const { useGameStore } = await import('/src/state/useGameStore.ts');
    const state = useGameStore.getState();
    return {
      match: state.match,
      planet: state.planet,
      ownPlayerId: state.multiplayerSession?.ownPlayerId ?? null,
      revision: state.multiplayerSession?.revision ?? -1,
      pending: state.multiplayerSession?.pending ?? false,
      inspectedTerritoryId: state.inspectedTerritoryId,
      focusSequence: state.focusSequence,
    };
  });
}

async function waitForPhase(page: Page, phase: string) {
  await expect
    .poll(async () => (await snapshot(page)).match?.phase, { timeout: 30_000 })
    .toBe(phase);
}

async function waitForIdle(page: Page) {
  await expect
    .poll(async () => (await snapshot(page)).pending, { timeout: 30_000 })
    .toBe(false);
}

async function chooseFromTerritoryList(page: Page, territoryName: string) {
  await page.getByRole('button', { name: /Territory list/ }).click();
  await page.getByRole('button', { name: 'All territories' }).click();
  await page
    .getByRole('button', {
      name: new RegExp(
        `^${territoryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`,
      ),
    })
    .click();
  await page.getByRole('button', { name: 'Close and view globe' }).click();
}

async function closeRoom(page: Page, roomId: string) {
  await page.evaluate(async (id) => {
    const { getSupabaseClient } =
      await import('/src/multiplayer/supabaseClient.ts');
    await getSupabaseClient().rpc('close_room', { room_id: id });
  }, roomId);
}

test('two claimed browsers swap interactive and waiting HUDs after one handoff', async ({
  browser,
}) => {
  test.setTimeout(5 * 60_000);
  const contextA = await browser.newContext({
    storageState: existsSync(authStateA) ? authStateA : undefined,
  });
  const contextB = await browser.newContext({
    storageState: existsSync(authStateB) ? authStateB : undefined,
  });
  const pageA = await openPlayer(contextA, 'Waiting Alpha', authStateA);
  const pageB = await openPlayer(contextB, 'Waiting Bravo', authStateB);
  let roomId = '';

  try {
    roomId = await pageA.evaluate(async () => {
      const { createRoom } = await import('/src/multiplayer/multiplayerApi.ts');
      const { getSupabaseClient } =
        await import('/src/multiplayer/supabaseClient.ts');
      const room = await createRoom(getSupabaseClient(), 'Waiting Alpha', {
        settings: {
          seed: 'playable-beta-acceptance',
          territoryCount: 12,
          continentCount: 2,
          assignmentMode: 'random',
          maxSeats: 2,
        },
      });
      window.localStorage.setItem(
        'fustify.multiplayer.displayName',
        'Waiting Alpha',
      );
      return room.id;
    });
    await pageA.goto(`/multiplayer/room/${roomId}`);
    await expect(
      pageA.getByRole('heading', { name: 'Multiplayer lobby' }),
    ).toBeVisible();
    await pageA
      .getByTestId('seat-0')
      .getByRole('button', { name: 'Claim Seat 1' })
      .click();

    const code = await pageA.getByTestId('room-code').innerText();
    await pageB.getByLabel('Room code').fill(code);
    await pageB.getByRole('button', { name: 'Join room' }).click();
    await pageB
      .getByTestId('seat-1')
      .getByRole('button', { name: 'Claim Seat 2' })
      .click();
    await expect(pageA.getByTestId('seat-1')).toContainText('Waiting Bravo');
    await pageA.getByRole('button', { name: 'Start Match' }).click();
    await expect(pageA.getByTestId('multiplayer-match')).toBeVisible();
    await expect(pageB.getByTestId('multiplayer-match')).toBeVisible();

    const initialA = await snapshot(pageA);
    const initialB = await snapshot(pageB);
    expect(initialA.match?.activePlayerId).toBe(initialA.ownPlayerId);
    expect(initialB.match?.activePlayerId).not.toBe(initialB.ownPlayerId);
    await expect(pageA.getByText('Reinforcement pool')).toBeVisible();
    const waiting = pageB.getByTestId('multiplayer-waiting-panel');
    await expect(waiting).toContainText('Waiting Alpha');
    await expect(waiting).toContainText('Reinforcing');
    await expect(waiting).toContainText('Waiting Bravo');
    await expect(waiting).toContainText('Seat 2');
    await expect(pageB.getByText('Reinforcement pool')).toHaveCount(0);
    await expect(
      pageB.getByRole('button', { name: 'Ownership' }),
    ).toBeVisible();
    await expect(
      pageB.getByRole('button', { name: 'Continents' }),
    ).toBeVisible();
    await expect(
      pageB.getByRole('button', { name: /Territory list/ }),
    ).toBeVisible();

    let waitingGameplayRequests = 0;
    pageB.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        request.url().includes('/functions/v1/multiplayer-game')
      ) {
        waitingGameplayRequests += 1;
      }
    });
    const inspectedNames = initialB.planet.territories.slice(0, 2);
    for (const territory of inspectedNames) {
      await chooseFromTerritoryList(pageB, territory.name);
      await expect(
        pageB.getByRole('heading', { name: territory.name }),
      ).toBeVisible();
      expect((await snapshot(pageB)).inspectedTerritoryId).toBe(territory.id);
    }
    expect((await snapshot(pageB)).revision).toBe(initialB.revision);
    expect((await snapshot(pageB)).match?.selectedSourceTerritoryId).toBeNull();
    expect(waitingGameplayRequests).toBe(0);
    await expect(pageB.getByText(/not your turn/i)).toHaveCount(0);

    const focusBefore = (await snapshot(pageB)).focusSequence;
    await pageB
      .getByTestId('minimap')
      .getByRole('button')
      .first()
      .press('Enter');
    expect((await snapshot(pageB)).focusSequence).toBe(focusBefore + 1);

    const activeTargetId = Object.entries(initialA.match!.territories).find(
      ([, territory]) => territory.ownerId === initialA.ownPlayerId,
    )![0];
    const activeTargetName = initialA.planet.territories.find(
      (territory) => territory.id === activeTargetId,
    )!.name;
    await chooseFromTerritoryList(pageA, activeTargetName);
    expect((await snapshot(pageA)).match?.selectedSourceTerritoryId).toBe(
      activeTargetId,
    );
    const maxReinforcements = pageA.getByRole('button', { name: /^Max:/ });
    if (await maxReinforcements.isVisible()) await maxReinforcements.click();
    await pageA.getByRole('button', { name: /^Place \d+ arm/ }).click();
    await waitForIdle(pageA);
    await waitForPhase(pageA, 'attack');

    const activityFocus = pageB.getByRole('button', { name: /^Focus / }).last();
    await expect(activityFocus).toBeVisible();
    const activityFocusBefore = (await snapshot(pageB)).focusSequence;
    await activityFocus.click();
    expect((await snapshot(pageB)).focusSequence).toBe(activityFocusBefore + 1);

    await pageA
      .getByRole('button', { name: 'End attack phase', exact: true })
      .first()
      .click();
    const confirmation = pageA.getByRole('dialog', {
      name: 'End attacking now?',
    });
    if (await confirmation.isVisible()) {
      await confirmation
        .getByRole('button', { name: 'End attack phase', exact: true })
        .click();
    }
    await waitForIdle(pageA);
    await waitForPhase(pageA, 'fortify');
    await pageA.getByRole('button', { name: 'Skip fortification' }).click();
    await waitForIdle(pageA);
    await waitForPhase(pageA, 'turn-end');
    await pageA.getByRole('button', { name: 'End turn' }).click();
    await waitForIdle(pageA);

    await expect(pageA.getByTestId('multiplayer-waiting-panel')).toBeVisible();
    await expect(pageB.getByTestId('multiplayer-waiting-panel')).toHaveCount(0);
    await expect(pageB.getByText('Reinforcement pool')).toBeVisible();
    await expect(pageB.getByTestId('turn-notification')).toHaveCount(1);
    expect((await snapshot(pageA)).match?.selectedSourceTerritoryId).toBeNull();
    expect((await snapshot(pageB)).match?.selectedSourceTerritoryId).toBeNull();
    expect(waitingGameplayRequests).toBe(0);
  } finally {
    if (roomId) await closeRoom(pageA, roomId).catch(() => undefined);
    await Promise.all([contextA.close(), contextB.close()]);
  }
});
