import { expect, test, type BrowserContext, type Page } from '@playwright/test';

async function openEntry(context: BrowserContext, displayName: string) {
  const page = await context.newPage();
  await page.goto('/multiplayer');
  await expect(
    page.getByRole('heading', { name: 'Private multiplayer rooms' }),
  ).toBeVisible();
  await page.getByLabel('Display name').fill(displayName);
  return page;
}

async function closeRoom(page: Page, roomId: string) {
  await page.evaluate(async (id) => {
    const { getSupabaseClient } =
      await import('/src/multiplayer/supabaseClient.ts');
    await getSupabaseClient().rpc('close_room', { room_id: id });
  }, roomId);
}

test('sparse claimed seats keep their colors through refresh and match start', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await openEntry(hostContext, 'Violet Host');
  await host.waitForTimeout(1_100);
  const guest = await openEntry(guestContext, 'Azure Guest');
  let roomId = '';

  try {
    await host.getByRole('button', { name: 'Create private room' }).click();
    roomId = host.url().split('/').at(-1)!;
    await host.getByLabel('Territories').fill('12');
    await host.getByLabel('Continents').fill('2');
    await host.getByRole('button', { name: 'Save settings' }).click();

    const seat5 = host.getByTestId('seat-4');
    await expect(seat5).toContainText('Violet');
    await seat5.getByRole('button', { name: 'Claim Seat 5' }).click();
    await expect(seat5).toContainText('Violet Host');
    await expect(seat5).toContainText('Violet');
    await expect(seat5).toContainText('Host');
    await expect(seat5).toContainText('You');
    await expect(seat5).toHaveCSS('--setup-seat-color', '#9a68d7');

    await host.reload();
    await expect(host.getByTestId('seat-4')).toContainText('Violet Host');
    await expect(host.getByTestId('seat-4')).toContainText('Violet');

    const code = await host.getByTestId('room-code').innerText();
    await guest.getByLabel('Room code').fill(code);
    await guest.getByRole('button', { name: 'Join room' }).click();
    await guest
      .getByTestId('seat-1')
      .getByRole('button', { name: 'Claim Seat 2' })
      .click();

    await expect(host.getByTestId('seat-1')).toContainText('Azure Guest');
    await expect(host.getByTestId('seat-1')).toContainText('Azure');
    await expect(host.getByTestId('seat-4')).toContainText('Violet Host');
    await expect(host.getByTestId('seat-4')).toContainText('Violet');

    await host.getByRole('button', { name: 'Start Match' }).click();
    await expect(host.getByTestId('multiplayer-match')).toBeVisible();
    await expect(guest.getByTestId('multiplayer-match')).toBeVisible();

    for (const page of [host, guest]) {
      const snapshot = await page.evaluate(async () => {
        const { useGameStore } = await import('/src/state/useGameStore.ts');
        const state = useGameStore.getState();
        return {
          players: state.matchSetup.players.map(
            ({ id, name, colorId, seatIndex }) => ({
              id,
              name,
              colorId,
              seatIndex,
            }),
          ),
          ownership: [
            ...new Set(
              Object.values(state.match?.territories ?? {}).map(
                (territory) => territory.ownerId,
              ),
            ),
          ].sort(),
        };
      });
      expect(snapshot.players).toEqual([
        {
          id: 'player-01',
          name: 'Azure Guest',
          colorId: 'color-2',
          seatIndex: 0,
        },
        {
          id: 'player-02',
          name: 'Violet Host',
          colorId: 'color-5',
          seatIndex: 1,
        },
      ]);
      expect(snapshot.ownership).toEqual(['player-01', 'player-02']);

      await expect(
        page.locator('.turn-banner').getByText('Azure Guest', { exact: true }),
      ).toBeVisible();
      await expect(page.locator('.turn-banner')).toHaveCSS(
        '--player-color',
        '#3f91e8',
      );
      await expect(page.locator('.minimap-active-player')).toHaveCSS(
        '--active-player-color',
        '#3f91e8',
      );
      await expect(
        page
          .locator(
            '.event-log li[data-actor-player-id="player-01"] .event-player-name',
          )
          .first(),
      ).toHaveCSS('color', 'rgb(63, 145, 232)');
      await expect(
        page
          .locator('.minimap-territories path[data-owner-id="player-02"]')
          .first(),
      ).toBeVisible();
    }
  } finally {
    if (roomId) await closeRoom(host, roomId).catch(() => null);
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});
