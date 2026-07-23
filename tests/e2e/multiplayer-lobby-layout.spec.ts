import { existsSync } from 'node:fs';
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';

const identities = {
  host: 'test-results/multiplayer-layout-host.json',
  player: 'test-results/multiplayer-layout-player.json',
  observer: 'test-results/multiplayer-layout-observer.json',
};

function contextOptions(
  path: string,
  viewport: { width: number; height: number },
) {
  return {
    storageState: existsSync(path) ? path : undefined,
    viewport,
  };
}

async function openEntry(
  context: BrowserContext,
  displayName: string,
  identityPath: string,
) {
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
  if (!existsSync(identityPath)) {
    await context.storageState({ path: identityPath });
  }
  await page.getByLabel('Display name').fill(displayName);
  return page;
}

async function expectInsideInitialViewport(
  locator: Locator,
  viewport: { width: number; height: number },
) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function roomRpc(
  page: Page,
  name: 'close_room' | 'leave_room',
  roomId: string,
) {
  await page.evaluate(
    async ({ functionName, id }) => {
      const { getSupabaseClient } =
        await import('/src/multiplayer/supabaseClient.ts');
      await getSupabaseClient().rpc(functionName, { room_id: id });
    },
    { functionName: name, id: roomId },
  );
}

test('representative five-seat lobby stays compact and synchronized', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-390');
  test.setTimeout(120_000);

  const viewport = testInfo.project.use.viewport!;
  const hostContext = await browser.newContext(
    contextOptions(identities.host, viewport),
  );
  const playerContext = await browser.newContext(
    contextOptions(identities.player, viewport),
  );
  const observerContext = await browser.newContext(
    contextOptions(identities.observer, viewport),
  );
  await hostContext.grantPermissions(['clipboard-read', 'clipboard-write']);

  const host = await openEntry(hostContext, 'Layout Host', identities.host);
  const player = await openEntry(
    playerContext,
    'Layout Player',
    identities.player,
  );
  const observer = await openEntry(
    observerContext,
    'Unseated Observer',
    identities.observer,
  );
  let roomId = '';

  try {
    await host.getByRole('button', { name: 'Create private room' }).click();
    await expect(
      host.getByRole('heading', { name: 'Multiplayer lobby' }),
    ).toBeVisible();
    await expect(host.getByTestId('connection-status')).toHaveText('Live');
    roomId = host.url().split('/').at(-1)!;

    await host
      .getByTestId('seat-0')
      .getByRole('button', { name: 'Claim Seat 1' })
      .click();
    await expect(
      host.getByRole('button', { name: 'Start Match' }),
    ).toBeDisabled();
    await expect(
      host.getByText('At least 2 players must claim seats before starting.'),
    ).toBeVisible();

    const code = await host.getByTestId('room-code').innerText();
    await host.getByRole('button', { name: 'Copy room code' }).click();
    await expect(host.getByRole('button', { name: 'Copied!' })).toBeVisible();
    await expect(host.getByText('Room code copied.')).toBeVisible();

    await player.getByLabel('Room code').fill(code);
    await player.getByRole('button', { name: 'Join room' }).click();
    await player
      .getByTestId('seat-1')
      .getByRole('button', { name: 'Claim Seat 2' })
      .click();
    await observer.getByLabel('Room code').fill(code);
    await observer.getByRole('button', { name: 'Join room' }).click();

    await expect(host.getByTestId('seat-0')).toContainText('Layout Host');
    await expect(host.getByTestId('seat-0')).toContainText('Crimson');
    await expect(host.getByTestId('seat-0')).toContainText('Host');
    await expect(host.getByTestId('seat-0')).toContainText('You');
    await expect(host.getByTestId('seat-1')).toContainText('Layout Player');
    await expect(host.getByTestId('seat-1')).toContainText('Azure');
    const unseated = host.getByRole('region', {
      name: 'In room without a seat',
    });
    await expect(unseated).toContainText('Unseated Observer');
    await expect(unseated).not.toContainText('Layout Host');
    await expect(unseated).not.toContainText('Layout Player');

    await expect(player.getByLabel('Seed')).toBeDisabled();
    await expect(
      player.getByText('Only the host can change room settings.'),
    ).toBeVisible();
    await expect(
      host.getByRole('button', { name: 'Start Match' }),
    ).toBeEnabled();

    const revision = await host
      .locator('.room-summary-status > span:first-child')
      .textContent();
    await host.getByRole('button', { name: 'Generate World' }).click();
    await expect(
      host.locator('.room-summary-status > span:first-child'),
    ).not.toHaveText(revision!);
    await host.getByLabel('Seed').fill(`layout-${testInfo.project.name}`);
    await host.getByRole('button', { name: 'Save settings' }).click();
    await expect(player.getByLabel('Seed')).toHaveValue(
      `layout-${testInfo.project.name}`,
    );

    const importantElements = [
      host.getByTestId('room-code'),
      host.getByRole('button', { name: /Copy room code|Copied!/ }),
      host.getByRole('heading', { name: 'Seats' }),
      unseated,
      host.getByTestId('multiplayer-minimap'),
      host.getByLabel('Seed'),
      host.getByRole('button', { name: 'Generate World' }),
      host.getByRole('button', { name: 'Save settings' }),
      host.getByRole('button', { name: 'Start Match' }),
      host.getByRole('button', { name: 'Leave room' }),
      host.getByRole('button', { name: 'Close room' }),
    ];
    for (let seat = 0; seat < 5; seat += 1) {
      importantElements.push(host.getByTestId(`seat-${seat}`));
    }
    for (const element of importantElements) {
      await expectInsideInitialViewport(element, viewport);
    }

    const panels = await host.evaluate(() => {
      const bounds = (selector: string) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      };
      return {
        roster: bounds('.setup-roster'),
        world: bounds('.setup-world-panel'),
      };
    });
    expect(panels.roster.right).toBeLessThanOrEqual(panels.world.left);
    expect(panels.roster.top).toBe(panels.world.top);

    if (testInfo.project.name === 'desktop-1920') {
      const documentSize = await host.evaluate(() => ({
        clientHeight: document.documentElement.clientHeight,
        scrollHeight: document.documentElement.scrollHeight,
      }));
      expect(documentSize.scrollHeight).toBeLessThanOrEqual(
        documentSize.clientHeight + 2,
      );
    }

    await host.screenshot({
      fullPage: true,
      path: `test-results/ui-review/${testInfo.project.name}/multiplayer-lobby-focused.png`,
    });
  } finally {
    if (roomId) {
      await roomRpc(host, 'close_room', roomId);
      await roomRpc(observer, 'leave_room', roomId);
      await roomRpc(player, 'leave_room', roomId);
      await roomRpc(host, 'leave_room', roomId);
    }
    await Promise.all([
      hostContext.close(),
      playerContext.close(),
      observerContext.close(),
    ]);
  }
});
