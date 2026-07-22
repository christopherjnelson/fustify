import { existsSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const authStateA = 'test-results/multiplayer-player-a.json';
const authStateB = 'test-results/multiplayer-player-b.json';
const authStateC = 'test-results/multiplayer-player-c.json';

function reusableContextOptions(path: string) {
  return { storageState: existsSync(path) ? path : undefined };
}

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
  if (!existsSync(authStatePath))
    await context.storageState({ path: authStatePath });
  await page.getByLabel('Display name').fill(name);
  return page;
}

async function roomRpc(
  page: Page,
  name: 'close_room' | 'leave_room',
  roomId: string,
) {
  return page.evaluate(
    async ({ functionName, id }) => {
      const { getSupabaseClient } =
        await import('/src/multiplayer/supabaseClient.ts');
      const { error } = await getSupabaseClient().rpc(functionName, {
        room_id: id,
      });
      return error?.message ?? null;
    },
    { functionName: name, id: roomId },
  );
}

async function gameSnapshot(page: Page) {
  return page.evaluate(async () => {
    const { useGameStore } = await import('/src/state/useGameStore.ts');
    const state = useGameStore.getState();
    return {
      match: state.match,
      planet: state.planet,
      ownPlayerId: state.multiplayerSession?.ownPlayerId ?? null,
      revision: state.multiplayerSession?.revision ?? -1,
      fingerprint: state.multiplayerSession?.stateFingerprint ?? '',
      pending: state.multiplayerSession?.pending ?? false,
    };
  });
}

async function waitForIdle(page: Page) {
  await expect
    .poll(async () => (await gameSnapshot(page)).pending, { timeout: 30_000 })
    .toBe(false);
}

async function reconcileCanonicalState(page: Page) {
  await page.evaluate(async () => {
    const hook = (
      window as typeof window & {
        __FUSTIFY_MULTIPLAYER_TEST__?: {
          refreshCanonical?: () => Promise<void>;
        };
      }
    ).__FUSTIFY_MULTIPLAYER_TEST__;
    await hook?.refreshCanonical?.();
  });
}

async function activePage(pages: Page[]): Promise<Page> {
  for (const page of pages) {
    const snapshot = await gameSnapshot(page);
    if (snapshot.match?.activePlayerId === snapshot.ownPlayerId) return page;
  }
  throw new Error('No browser owns the active authoritative seat.');
}

function escaped(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function selectTerritory(page: Page, territoryId: string) {
  const snapshot = await gameSnapshot(page);
  if (
    snapshot.match?.selectedSourceTerritoryId === territoryId ||
    snapshot.match?.selectedTargetTerritoryId === territoryId
  ) {
    return;
  }
  const before = snapshot.revision;
  const name = snapshot.planet.territories.find(
    (territory) => territory.id === territoryId,
  )!.name;
  await page.getByRole('button', { name: /Territory list/ }).click();
  await page.getByRole('button', { name: 'All territories' }).click();
  await page
    .getByRole('button', { name: new RegExp(`^${escaped(name)}\\.`) })
    .click();
  await expect
    .poll(async () => (await gameSnapshot(page)).revision, {
      timeout: 30_000,
    })
    .toBeGreaterThan(before);
  await page.getByRole('button', { name: 'Close and view globe' }).click();
  await waitForIdle(page);
}

async function reinforcementTarget(page: Page, aggressor: boolean) {
  return page.evaluate(async (preferWeakestEnemy) => {
    const { useGameStore } = await import('/src/state/useGameStore.ts');
    const { match, planet } = useGameStore.getState();
    if (!match) return null;
    const enemyNeighbors = (sourceId: string) =>
      (
        planet.territories.find((territory) => territory.id === sourceId)
          ?.adjacentTerritoryIds ?? []
      ).filter(
        (targetId) =>
          match.territories[targetId]?.ownerId !== match.activePlayerId,
      );
    const owned = Object.entries(match.territories)
      .filter(([, territory]) => territory.ownerId === match.activePlayerId)
      .sort((a, b) => b[1].armyCount - a[1].armyCount);
    if (preferWeakestEnemy) {
      const borders = owned
        .flatMap(([sourceId, source]) =>
          enemyNeighbors(sourceId).map((targetId) => ({
            sourceId,
            sourceArmies: source.armyCount,
            targetArmies: match.territories[targetId]!.armyCount,
          })),
        )
        .sort(
          (a, b) =>
            a.targetArmies - b.targetArmies ||
            b.sourceArmies - a.sourceArmies ||
            a.sourceId.localeCompare(b.sourceId),
        );
      if (borders[0]) return borders[0].sourceId;
    }
    if (!preferWeakestEnemy) return owned.at(-1)?.[0] ?? null;
    return (
      owned.find(([id]) => enemyNeighbors(id).length > 0)?.[0] ??
      owned[0]?.[0] ??
      null
    );
  }, aggressor);
}

async function preferredAttack(page: Page) {
  return page.evaluate(async () => {
    const { useGameStore } = await import('/src/state/useGameStore.ts');
    const { getAttackSources, getAttackTargets, getValidAttackDice } =
      await import('/src/core/game/legalActions.ts');
    const { match, planet } = useGameStore.getState();
    if (!match) return null;
    const candidates = getAttackSources(match).flatMap((sourceId) =>
      getAttackTargets(planet, match, sourceId).map((targetId) => ({
        sourceId,
        targetId,
        sourceArmies: match.territories[sourceId]!.armyCount,
        targetArmies: match.territories[targetId]!.armyCount,
      })),
    );
    candidates.sort(
      (a, b) =>
        b.sourceArmies - a.sourceArmies ||
        a.targetArmies - b.targetArmies ||
        a.sourceId.localeCompare(b.sourceId),
    );
    const enemyTerritoryCount = Object.values(match.territories).filter(
      (territory) => territory.ownerId !== match.activePlayerId,
    ).length;
    const selected = candidates.find(({ sourceArmies, targetArmies }) =>
      enemyTerritoryCount === 1
        ? sourceArmies >= Math.ceil(targetArmies * 0.6)
        : sourceArmies >= Math.ceil(targetArmies * 1.25),
    );
    if (!selected) return null;
    return {
      ...selected,
      dice: getValidAttackDice(selected.sourceArmies).at(-1)!,
    };
  });
}

async function preferredFortification(page: Page) {
  return page.evaluate(async () => {
    const { useGameStore } = await import('/src/state/useGameStore.ts');
    const { getFortifyTargets } =
      await import('/src/core/game/legalActions.ts');
    const { match, planet } = useGameStore.getState();
    if (!match) return null;
    const borderTargets = Object.entries(match.territories)
      .filter(([, territory]) => territory.ownerId === match.activePlayerId)
      .flatMap(([targetId]) =>
        (
          planet.territories.find((territory) => territory.id === targetId)
            ?.adjacentTerritoryIds ?? []
        )
          .filter(
            (enemyId) =>
              match.territories[enemyId]?.ownerId !== match.activePlayerId,
          )
          .map((enemyId) => ({
            targetId,
            enemyArmies: match.territories[enemyId]!.armyCount,
          })),
      )
      .sort(
        (a, b) =>
          a.enemyArmies - b.enemyArmies || a.targetId.localeCompare(b.targetId),
      );
    for (const { targetId } of borderTargets) {
      const source = Object.entries(match.territories)
        .filter(
          ([sourceId, territory]) =>
            sourceId !== targetId &&
            territory.ownerId === match.activePlayerId &&
            territory.armyCount >= 2 &&
            getFortifyTargets(planet, match, sourceId).includes(targetId),
        )
        .sort(
          (a, b) => b[1].armyCount - a[1].armyCount || a[0].localeCompare(b[0]),
        )[0];
      if (source) return { sourceId: source[0], targetId };
    }
    return null;
  });
}

test('two remote browsers complete one authoritative match and agree on the winner', async ({
  browser,
}, testInfo) => {
  test.setTimeout(30 * 60_000);
  const contextA = await browser.newContext(reusableContextOptions(authStateA));
  const contextB = await browser.newContext(reusableContextOptions(authStateB));
  const contextC = await browser.newContext(reusableContextOptions(authStateC));
  const pageA = await newPlayer(contextA, 'Alpha', authStateA);
  await pageA.waitForTimeout(1_200);
  const pageB = await newPlayer(contextB, 'Bravo', authStateB);
  let roomId = '';
  let sawAttack = false;
  let sawCapture = false;
  let sawOtherTurn = false;
  let refreshed = false;

  try {
    await pageA.getByRole('button', { name: 'Create private room' }).click();
    await expect(
      pageA.getByRole('heading', { name: 'Multiplayer lobby' }),
    ).toBeVisible();
    roomId = pageA.url().split('/').at(-1)!;
    await pageA.getByLabel('Territories').fill('12');
    await pageA.getByLabel('Continents').fill('2');
    await pageA.getByRole('spinbutton', { name: 'Seats' }).fill('2');
    await pageA.getByLabel('Seed').fill('playable-beta-acceptance');
    await pageA.getByRole('button', { name: 'Save settings' }).click();
    await pageA
      .getByTestId('seat-0')
      .getByRole('button', { name: 'Claim' })
      .click();
    await expect(
      pageA.getByRole('button', { name: 'Start Match' }),
    ).toBeDisabled();
    await expect(
      pageA.getByText('At least 2 players must claim seats before starting.'),
    ).toBeVisible();

    const friendlyFallback = await pageA.evaluate(async (id) => {
      const { startMatch } = await import('/src/multiplayer/multiplayerApi.ts');
      const { getSupabaseClient } =
        await import('/src/multiplayer/supabaseClient.ts');
      try {
        await startMatch(getSupabaseClient(), id);
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }, roomId);
    expect(friendlyFallback).toBe(
      'Claim at least two human seats before starting.',
    );

    const code = await pageA.getByTestId('room-code').innerText();
    await pageB.getByLabel('Room code').fill(code);
    await pageB.getByRole('button', { name: 'Join room' }).click();
    await pageB
      .getByTestId('seat-1')
      .getByRole('button', { name: 'Claim' })
      .click();
    await expect(pageA.getByTestId('seat-1')).toContainText('Bravo');
    await expect(
      pageA.getByRole('button', { name: 'Start Match' }),
    ).toBeEnabled();

    const pageC = await newPlayer(contextC, 'Outsider', authStateC);
    await pageC.goto(`/multiplayer/room/${roomId}`);
    await expect(
      pageC.getByRole('heading', { name: 'Private room unavailable' }),
    ).toBeVisible();

    await pageA.getByRole('button', { name: 'Start Match' }).click();
    await expect(pageA.getByTestId('multiplayer-match')).toBeVisible();
    await expect(pageB.getByTestId('multiplayer-match')).toBeVisible();
    const initialA = await gameSnapshot(pageA);
    const initialB = await gameSnapshot(pageB);
    expect(initialA.revision).toBe(0);
    expect(initialB.revision).toBe(0);
    expect(initialB.fingerprint).toBe(initialA.fingerprint);

    for (let step = 0; step < 900; step += 1) {
      await Promise.all([
        reconcileCanonicalState(pageA),
        reconcileCanonicalState(pageB),
      ]);
      const observerA = await gameSnapshot(pageA);
      const observerB = await gameSnapshot(pageB);
      if (observerA.match?.phase === 'game-over') break;
      expect(observerB.revision).toBe(observerA.revision);
      expect(observerB.fingerprint).toBe(observerA.fingerprint);
      const actor = await activePage([pageA, pageB]);
      const before = await gameSnapshot(actor);
      if (before.ownPlayerId === initialB.ownPlayerId) sawOtherTurn = true;

      if (before.match!.phase === 'reinforce') {
        const target = await reinforcementTarget(
          actor,
          before.ownPlayerId === initialA.ownPlayerId,
        );
        expect(target).not.toBeNull();
        await selectTerritory(actor, target!);
        await actor.getByRole('button', { name: /Place all/ }).click();
        await waitForIdle(actor);
      } else if (before.match!.phase === 'attack') {
        if (!refreshed) {
          const revision = before.revision;
          const fingerprint = before.fingerprint;
          await actor.reload();
          await expect(actor.getByTestId('multiplayer-match')).toBeVisible();
          await expect
            .poll(async () => (await gameSnapshot(actor)).revision, {
              timeout: 30_000,
            })
            .toBe(revision);
          await expect
            .poll(async () => (await gameSnapshot(actor)).fingerprint, {
              timeout: 30_000,
            })
            .toBe(fingerprint);
          refreshed = true;
        }
        const attack =
          before.ownPlayerId === initialA.ownPlayerId
            ? await preferredAttack(actor)
            : null;
        if (!attack) {
          await actor
            .getByRole('button', { name: 'End attack phase', exact: true })
            .first()
            .click();
          const confirmation = actor.getByRole('dialog', {
            name: 'End attacking now?',
          });
          if (await confirmation.isVisible()) {
            await confirmation
              .getByRole('button', {
                name: 'End attack phase',
                exact: true,
              })
              .click();
          }
          await waitForIdle(actor);
        } else {
          await selectTerritory(actor, attack.sourceId);
          await selectTerritory(actor, attack.targetId);
          await actor
            .getByLabel('Attack dice')
            .selectOption(String(attack.dice));
          await actor
            .getByRole('button', { name: 'Attack', exact: true })
            .click();
          await waitForIdle(actor);
          sawAttack = true;
        }
      } else if (before.match!.phase === 'capture') {
        const movement = actor.getByLabel('Armies to move');
        if ((await movement.count()) > 0) await movement.press('End');
        await actor
          .getByRole('button', { name: 'Complete capture move' })
          .click();
        await waitForIdle(actor);
        sawCapture = true;
      } else if (before.match!.phase === 'fortify') {
        const fortification =
          before.ownPlayerId === initialA.ownPlayerId
            ? await preferredFortification(actor)
            : null;
        if (fortification) {
          await selectTerritory(actor, fortification.sourceId);
          await selectTerritory(actor, fortification.targetId);
          const movement = actor.getByLabel('Armies to move');
          if ((await movement.count()) > 0) await movement.press('End');
          await actor
            .getByRole('button', { name: 'Fortify', exact: true })
            .click();
        } else {
          await actor
            .getByRole('button', { name: 'Skip fortification' })
            .click();
        }
        await waitForIdle(actor);
      } else if (before.match!.phase === 'turn-end') {
        await actor.getByRole('button', { name: 'End turn' }).click();
        await waitForIdle(actor);
      }
      await expect
        .poll(async () => (await gameSnapshot(pageA)).revision, {
          timeout: 30_000,
        })
        .toBeGreaterThan(before.revision);
      await expect
        .poll(async () => (await gameSnapshot(pageB)).revision, {
          timeout: 30_000,
        })
        .toBe((await gameSnapshot(pageA)).revision);
    }

    const finalA = await gameSnapshot(pageA);
    await expect
      .poll(async () => (await gameSnapshot(pageB)).revision, {
        timeout: 30_000,
      })
      .toBe(finalA.revision);
    const finalB = await gameSnapshot(pageB);
    expect(finalA.match?.phase).toBe('game-over');
    expect(finalA.match?.winnerId).toBeTruthy();
    expect(finalB.match?.winnerId).toBe(finalA.match?.winnerId);
    expect(finalB.fingerprint).toBe(finalA.fingerprint);
    expect(sawAttack).toBe(true);
    expect(sawCapture).toBe(true);
    expect(sawOtherTurn).toBe(true);
    expect(refreshed).toBe(true);
    await expect(
      pageA.getByRole('dialog', { name: 'Match won' }),
    ).toBeVisible();
    await expect(
      pageB.getByRole('dialog', { name: 'Match won' }),
    ).toBeVisible();
    await pageA.screenshot({
      fullPage: true,
      path: `test-results/ui-review/${testInfo.project.name}/multiplayer-final.png`,
    });
  } finally {
    if (roomId) {
      await roomRpc(pageA, 'close_room', roomId).catch(() => null);
      await Promise.all([
        roomRpc(pageA, 'leave_room', roomId).catch(() => null),
        roomRpc(pageB, 'leave_room', roomId).catch(() => null),
      ]);
    }
    await Promise.all([contextA.close(), contextB.close(), contextC.close()]);
  }
});
