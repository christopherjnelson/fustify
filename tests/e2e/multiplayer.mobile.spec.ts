import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const mobileAuthState = 'test-results/multiplayer-visual-auth.json';
const mobileGuestAuthState = 'test-results/multiplayer-mobile-guest.json';

test('mobile lobby keeps room controls visible without horizontal clipping', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    ...testInfo.project.use,
    storageState: existsSync(mobileAuthState) ? mobileAuthState : undefined,
  });
  const page = await context.newPage();
  await page.goto('/multiplayer');
  if (!existsSync(mobileAuthState)) {
    await context.storageState({ path: mobileAuthState });
  }
  await page.getByLabel('Display name').fill('Mobile Host');
  await page.getByRole('button', { name: 'Create private room' }).click();
  await expect(
    page.getByRole('heading', { name: 'Multiplayer lobby' }),
  ).toBeVisible();
  const roomId = page.url().split('/').at(-1)!;
  try {
    await expect(page.getByTestId('room-code')).toBeVisible();
    await expect(page.getByTestId('seat-0')).toBeVisible();
    await expect(page.getByLabel('Continents')).toHaveAttribute('max', '5');
    await expect(
      page.getByRole('spinbutton', { name: 'Seats' }),
    ).toHaveAttribute('max', '5');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      fullPage: true,
      path: `test-results/ui-review/${testInfo.project.name}/multiplayer-lobby.png`,
    });
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

test('mobile restores an authoritative active match without clipping controls', async ({
  browser,
}, testInfo) => {
  const hostContext = await browser.newContext({
    ...testInfo.project.use,
    storageState: existsSync(mobileAuthState) ? mobileAuthState : undefined,
  });
  const guestContext = await browser.newContext({
    ...testInfo.project.use,
    storageState: existsSync(mobileGuestAuthState)
      ? mobileGuestAuthState
      : undefined,
  });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  let roomId = '';
  try {
    await host.goto('/multiplayer');
    await expect(
      host.getByRole('heading', { name: 'Private multiplayer rooms' }),
    ).toBeVisible();
    await host.getByLabel('Display name').fill('Mobile Alpha');
    await host.getByRole('button', { name: 'Create private room' }).click();
    roomId = host.url().split('/').at(-1)!;
    await host.getByLabel('Territories').fill('12');
    await host.getByLabel('Continents').fill('2');
    await host.getByRole('spinbutton', { name: 'Seats' }).fill('2');
    await host.getByRole('button', { name: 'Save settings' }).click();
    await host
      .getByTestId('seat-0')
      .getByRole('button', { name: 'Claim' })
      .click();
    const code = await host.getByTestId('room-code').innerText();

    await host.waitForTimeout(1_200);
    await guest.goto('/multiplayer');
    await expect(
      guest.getByRole('heading', { name: 'Private multiplayer rooms' }),
    ).toBeVisible();
    if (!existsSync(mobileGuestAuthState)) {
      await guestContext.storageState({ path: mobileGuestAuthState });
    }
    await guest.getByLabel('Display name').fill('Mobile Bravo');
    await guest.getByLabel('Room code').fill(code);
    await guest.getByRole('button', { name: 'Join room' }).click();
    await guest
      .getByTestId('seat-1')
      .getByRole('button', { name: 'Claim' })
      .click();
    await expect(
      host.getByRole('button', { name: 'Start Match' }),
    ).toBeEnabled();
    await host.getByRole('button', { name: 'Start Match' }).click();
    await expect(host.getByTestId('multiplayer-match')).toBeVisible();
    await expect(guest.getByTestId('multiplayer-match')).toBeVisible();

    const initial = await host.evaluate(async () => {
      const { useGameStore } = await import('/src/state/useGameStore.ts');
      const state = useGameStore.getState();
      return {
        revision: state.multiplayerSession!.revision,
        fingerprint: state.multiplayerSession!.stateFingerprint,
        target: Object.entries(state.match!.territories).find(
          ([, territory]) => territory.ownerId === state.match!.activePlayerId,
        )![0],
        targetName: state.planet.territories.find(
          (territory) =>
            territory.id ===
            Object.entries(state.match!.territories).find(
              ([, item]) => item.ownerId === state.match!.activePlayerId,
            )![0],
        )!.name,
      };
    });
    await host.getByRole('button', { name: /Territory list/ }).click();
    await host.getByRole('button', { name: 'All territories' }).click();
    await host
      .getByRole('button', {
        name: new RegExp(
          `^${initial.targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`,
        ),
      })
      .click();
    await host.getByRole('button', { name: 'Close and view globe' }).click();
    await expect
      .poll(async () =>
        host.evaluate(async () => {
          const { useGameStore } = await import('/src/state/useGameStore.ts');
          return useGameStore.getState().multiplayerSession?.pending;
        }),
      )
      .toBe(false);
    await guestContext.setOffline(true);
    await host.getByRole('button', { name: /Place all/ }).click();
    await expect
      .poll(async () =>
        host.evaluate(async () => {
          const { useGameStore } = await import('/src/state/useGameStore.ts');
          return useGameStore.getState().match?.phase;
        }),
      )
      .toBe('attack');
    const active = await host.evaluate(async () => {
      const { useGameStore } = await import('/src/state/useGameStore.ts');
      const state = useGameStore.getState();
      return {
        revision: state.multiplayerSession!.revision,
        fingerprint: state.multiplayerSession!.stateFingerprint,
      };
    });
    expect(active.revision).toBeGreaterThan(initial.revision);

    await guestContext.setOffline(false);
    await guest.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect
      .poll(async () =>
        guest.evaluate(async () => {
          const { useGameStore } = await import('/src/state/useGameStore.ts');
          return useGameStore.getState().multiplayerSession?.revision;
        }),
      )
      .toBe(active.revision);
    await expect(guest.getByTestId('state-fingerprint')).toHaveText(
      active.fingerprint,
    );

    await host.reload();
    await expect(host.getByTestId('multiplayer-match')).toBeVisible();
    await expect
      .poll(async () =>
        host.evaluate(async () => {
          const { useGameStore } = await import('/src/state/useGameStore.ts');
          return useGameStore.getState().multiplayerSession?.revision;
        }),
      )
      .toBe(active.revision);
    await expect(host.getByTestId('state-fingerprint')).toHaveText(
      active.fingerprint,
    );
    expect(
      await host.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await host.screenshot({
      fullPage: true,
      path: `test-results/ui-review/${testInfo.project.name}/multiplayer-active-restore.png`,
    });
  } finally {
    if (roomId) {
      await host
        .evaluate(async (id) => {
          const { getSupabaseClient } =
            await import('/src/multiplayer/supabaseClient.ts');
          await getSupabaseClient().rpc('close_room', { room_id: id });
          await getSupabaseClient().rpc('leave_room', { room_id: id });
        }, roomId)
        .catch(() => undefined);
      await guest
        .evaluate(async (id) => {
          const { getSupabaseClient } =
            await import('/src/multiplayer/supabaseClient.ts');
          await getSupabaseClient().rpc('leave_room', { room_id: id });
        }, roomId)
        .catch(() => undefined);
    }
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});
