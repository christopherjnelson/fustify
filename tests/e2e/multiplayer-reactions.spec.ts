import { existsSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const authStateA = 'test-results/multiplayer-reaction-player-a.json';
const authStateB = 'test-results/multiplayer-reaction-player-b.json';

async function newPlayer(
  context: BrowserContext,
  name: string,
  authStatePath: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/multiplayer');
  const entry = page.getByRole('heading', {
    name: 'Private multiplayer rooms',
  });
  const authError = page.getByRole('heading', {
    name: 'Could not restore multiplayer session',
  });
  await Promise.race([entry.waitFor(), authError.waitFor()]);
  if (await authError.isVisible()) {
    await page.waitForTimeout(1_500);
    await page.reload();
  }
  await expect(entry).toBeVisible();
  if (!existsSync(authStatePath)) {
    await context.storageState({ path: authStatePath });
  }
  await page.getByLabel('Display name').fill(name);
  return page;
}

async function gameSnapshot(page: Page) {
  return page.evaluate(async () => {
    const { useGameStore } = await import('/src/state/useGameStore.ts');
    const state = useGameStore.getState();
    return {
      match: state.match,
      revision: state.multiplayerSession?.revision ?? -1,
      pending: state.multiplayerSession?.pending ?? false,
      focusTargetTerritoryId: state.focusTargetTerritoryId,
    };
  });
}

async function waitForIdle(page: Page) {
  await expect
    .poll(async () => (await gameSnapshot(page)).pending, { timeout: 30_000 })
    .toBe(false);
}

async function closeAndLeave(page: Page, roomId: string) {
  return page.evaluate(async (id) => {
    const { getSupabaseClient } =
      await import('/src/multiplayer/supabaseClient.ts');
    const client = getSupabaseClient();
    await client.rpc('close_room', { room_id: id });
    await client.rpc('leave_room', { room_id: id });
  }, roomId);
}

async function leave(page: Page, roomId: string) {
  return page.evaluate(async (id) => {
    const { getSupabaseClient } =
      await import('/src/multiplayer/supabaseClient.ts');
    await getSupabaseClient().rpc('leave_room', { room_id: id });
  }, roomId);
}

async function createFocusableActivityEvent(page: Page) {
  const before = (await gameSnapshot(page)).revision;
  const target = await page.evaluate(async () => {
    const { useGameStore } = await import('/src/state/useGameStore.ts');
    const state = useGameStore.getState();
    const match = state.match!;
    const territoryId = Object.entries(match.territories).find(
      ([, territory]) => territory.ownerId === match.activePlayerId,
    )![0];
    state.dispatchGameAction({ type: 'SELECT_TERRITORY', territoryId });
    return territoryId;
  });
  await expect
    .poll(
      async () =>
        (await gameSnapshot(page)).match?.selectedSourceTerritoryId ?? null,
    )
    .toBe(target);
  await page.evaluate(async (territoryId) => {
    const { useGameStore } = await import('/src/state/useGameStore.ts');
    const state = useGameStore.getState();
    state.dispatchGameAction({
      type: 'PLACE_REINFORCEMENT',
      territoryId,
      amount: state.match!.remainingReinforcements,
    });
  }, target);
  await expect
    .poll(async () => (await gameSnapshot(page)).revision, {
      timeout: 30_000,
    })
    .toBe(before + 1);
  await waitForIdle(page);
  return target;
}

function reactionRow(page: Page, eventId: string) {
  return page.locator(`.event-reactions[data-event-id="${eventId}"]`);
}

async function chooseReaction(page: Page, eventId: string, label: string) {
  const row = reactionRow(page, eventId);
  await row
    .getByRole('button', {
      name: new RegExp(
        `(add ${label}|switch to ${label}|remove your ${label}) reaction`,
        'i',
      ),
    })
    .click();
}

test('two participants synchronize persistent Activity reactions without changing gameplay', async ({
  browser,
}, testInfo) => {
  test.setTimeout(3 * 60_000);
  const contextA = await browser.newContext({
    storageState: existsSync(authStateA) ? authStateA : undefined,
  });
  const contextB = await browser.newContext({
    storageState: existsSync(authStateB) ? authStateB : undefined,
  });
  const pageA = await newPlayer(contextA, 'Reaction Alpha', authStateA);
  await pageA.waitForTimeout(1_200);
  const pageB = await newPlayer(contextB, 'Reaction Bravo', authStateB);
  let roomId = '';

  try {
    await pageA.getByRole('button', { name: 'Create private room' }).click();
    await expect(
      pageA.getByRole('heading', { name: 'Multiplayer lobby' }),
    ).toBeVisible();
    roomId = pageA.url().split('/').at(-1)!;
    await pageA.getByLabel('Territories').fill('12');
    await pageA.getByLabel('Continents').fill('2');
    await pageA.getByRole('spinbutton', { name: 'Seats' }).fill('2');
    await pageA.getByLabel('Seed').fill('activity-reactions-acceptance');
    await pageA.getByRole('button', { name: 'Save settings' }).click();
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
    await expect(
      pageA.getByRole('button', { name: 'Start Match' }),
    ).toBeEnabled();
    await pageA.getByRole('button', { name: 'Start Match' }).click();
    await expect(pageA.getByTestId('multiplayer-match')).toBeVisible();
    await expect(pageB.getByTestId('multiplayer-match')).toBeVisible();

    const territoryId = await createFocusableActivityEvent(pageA);
    await expect
      .poll(async () => (await gameSnapshot(pageB)).revision, {
        timeout: 30_000,
      })
      .toBe((await gameSnapshot(pageA)).revision);
    const baselineRevision = (await gameSnapshot(pageA)).revision;
    const eventId = (await gameSnapshot(pageA)).match!.events.at(-1)!.id;
    await expect(reactionRow(pageA, eventId)).toBeVisible();
    await expect(reactionRow(pageB, eventId)).toBeVisible();

    const focus = pageA.getByRole('button', { name: /^Focus / }).last();
    await focus.click();
    expect((await gameSnapshot(pageA)).focusTargetTerritoryId).toBe(
      territoryId,
    );

    await expect(reactionRow(pageA, eventId).getByRole('button')).toHaveCount(
      4,
    );
    for (const label of ['fire', 'laugh', 'heart', 'angry']) {
      await expect(
        reactionRow(pageA, eventId).getByRole('button', {
          name: new RegExp(`add ${label} reaction`, 'i'),
        }),
      ).toBeVisible();
    }

    await chooseReaction(pageA, eventId, 'fire');
    await expect(
      reactionRow(pageB, eventId).getByRole('button', {
        name: /1 fire reaction/,
      }),
    ).toBeVisible();

    await pageA.getByRole('button', { name: 'Collapse Activity' }).click();
    await chooseReaction(pageB, eventId, 'heart');
    await expect(
      pageA.getByRole('button', { name: 'Open Activity' }),
    ).toBeVisible();
    await pageA.getByRole('button', { name: 'Open Activity' }).click();
    await expect(
      reactionRow(pageA, eventId).getByRole('button', {
        name: /1 heart reaction/,
      }),
    ).toBeVisible();

    await chooseReaction(pageA, eventId, 'laugh');
    await expect(
      reactionRow(pageB, eventId).getByRole('button', {
        name: /1 laugh reaction/,
      }),
    ).toBeVisible();
    await expect(
      reactionRow(pageB, eventId).getByRole('button', {
        name: /^add fire reaction$/,
      }),
    ).toBeVisible();
    await reactionRow(pageA, eventId)
      .getByRole('button', { name: /Remove your laugh reaction/ })
      .click();
    await expect(
      reactionRow(pageB, eventId).getByRole('button', {
        name: /^add laugh reaction$/,
      }),
    ).toBeVisible();

    await pageB.reload();
    await expect(pageB.getByTestId('multiplayer-match')).toBeVisible();
    await expect(
      reactionRow(pageB, eventId).getByRole('button', {
        name: /Remove your heart reaction/,
      }),
    ).toBeVisible();

    await pageA.evaluate(async () => {
      await window.__FUSTIFY_MULTIPLAYER_TEST__?.interruptRealtime();
    });
    await chooseReaction(pageB, eventId, 'angry');
    await expect(
      reactionRow(pageA, eventId).getByRole('button', {
        name: /1 angry reaction/,
      }),
    ).toBeVisible();
    await chooseReaction(pageB, eventId, 'heart');
    await pageA.evaluate(async () => {
      await window.__FUSTIFY_MULTIPLAYER_TEST__?.refreshCanonical?.();
      await window.__FUSTIFY_MULTIPLAYER_TEST__?.refreshCanonical?.();
    });
    await expect(
      reactionRow(pageA, eventId).getByRole('button', {
        name: /1 heart reaction/,
      }),
    ).toBeVisible();

    expect((await gameSnapshot(pageA)).revision).toBe(baselineRevision);
    expect((await gameSnapshot(pageB)).revision).toBe(baselineRevision);
    await expect(
      pageA.getByRole('button', { name: /New activity/i }),
    ).toHaveCount(0);
    await pageA.screenshot({
      fullPage: true,
      path: `test-results/ui-review/${testInfo.project.name}/multiplayer-reactions.png`,
    });
  } finally {
    if (roomId) {
      await closeAndLeave(pageA, roomId).catch(() => undefined);
      await leave(pageB, roomId).catch(() => undefined);
    }
    await Promise.all([contextA.close(), contextB.close()]);
  }
});
