import { expect, test } from '@playwright/test';

test('match recovery bounds PostgREST reads for active, completed, and denied routes', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1920');
  const requests: Array<{ matchId: string; select: string; bytes: number }> =
    [];

  await page.route('**/rest/v1/matches**', async (route) => {
    const url = new URL(route.request().url());
    const matchId = (url.searchParams.get('id') ?? '').replace(/^eq\./, '');
    const select = url.searchParams.get('select') ?? '';
    if (matchId === 'denied') {
      requests.push({ matchId, select, bytes: 0 });
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'controlled test denial' }),
      });
      return;
    }

    const revision =
      matchId === 'active' &&
      select.includes('state_snapshot') &&
      !select.includes('planet_snapshot')
        ? 5
        : 4;
    const status = matchId === 'completed' ? 'completed' : 'active';
    const complete = {
      id: matchId,
      room_id: `room-${matchId}`,
      status,
      revision,
      setup_snapshot: { territoryCount: 12, continentCount: 2 },
      seat_order_snapshot: [{ playerId: 'player-a', userId: 'user-a' }],
      generator_metadata: { version: 1 },
      planet_snapshot: { seed: 'egress-fixture', territories: [1, 2, 3] },
      state_snapshot: { turnNumber: revision },
      state_fingerprint: `fingerprint-${revision}`,
      last_command_type: 'END_TURN',
      winner_player_id: status === 'completed' ? 'player-a' : null,
      winner_user_id: status === 'completed' ? 'user-a' : null,
      created_at: '2026-07-24T12:00:00Z',
      updated_at: `2026-07-24T12:00:0${revision}Z`,
    };
    const selected = Object.fromEntries(
      select.split(',').map((column) => {
        const key = column.trim() as keyof typeof complete;
        return [key, complete[key]];
      }),
    );
    const body = JSON.stringify(selected);
    requests.push({
      matchId,
      select,
      bytes: new TextEncoder().encode(body).length,
    });
    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });

  await page.goto('/');
  await page.clock.install();

  await page.evaluate(async () => {
    const modulePath = '/src/multiplayer/matchSynchronization.ts';
    const { MatchSynchronization } = await import(modulePath);
    const controllers = new Map<
      string,
      InstanceType<typeof MatchSynchronization>
    >();
    const installed = new Map<string, unknown[]>();
    const errors = new Map<string, string[]>();
    const client = {
      from: () => ({
        select: (columns: string) => ({
          eq: (_column: string, matchId: string) => ({
            maybeSingle: async () => {
              const url = new URL('/rest/v1/matches', window.location.origin);
              url.searchParams.set('select', columns);
              url.searchParams.set('id', `eq.${matchId}`);
              const response = await fetch(url);
              const data = await response.json();
              return response.ok
                ? { data, error: null }
                : {
                    data: null,
                    error: { status: response.status, message: 'denied' },
                  };
            },
          }),
        }),
      }),
    };
    for (const matchId of ['active', 'completed', 'denied']) {
      const matchInstalls: unknown[] = [];
      const matchErrors: string[] = [];
      installed.set(matchId, matchInstalls);
      errors.set(matchId, matchErrors);
      const synchronization = new MatchSynchronization({
        client,
        matchId,
        install: (match) => matchInstalls.push(match),
        onError: (error) => matchErrors.push(error.message),
      });
      controllers.set(matchId, synchronization);
      await synchronization.bootstrap();
      synchronization.realtimeStatus('SUBSCRIBED');
    }
    Object.assign(window, {
      __EGRESS_CONTROLLERS__: controllers,
      __EGRESS_INSTALLED__: installed,
      __EGRESS_ERRORS__: errors,
    });
  });

  await page.clock.fastForward(60_000);
  expect(requests.filter(({ matchId }) => matchId === 'active')).toHaveLength(
    1,
  );
  expect(
    requests.filter(({ matchId }) => matchId === 'completed'),
  ).toHaveLength(1);
  expect(requests.filter(({ matchId }) => matchId === 'denied')).toHaveLength(
    1,
  );
  expect(requests.some(({ select }) => select === '*')).toBe(false);

  await page.evaluate(async () => {
    const controllers = (
      window as unknown as {
        __EGRESS_CONTROLLERS__: Map<
          string,
          {
            installAcceptedRevision: (
              revision: number,
              fingerprint: string,
            ) => Promise<void>;
            realtimeChanged: (signal: {
              revision: number;
              status: string;
            }) => void;
            realtimeStatus: (status: string) => void;
          }
        >;
      }
    ).__EGRESS_CONTROLLERS__;
    const active = controllers.get('active')!;
    await active.installAcceptedRevision(5, 'fingerprint-5');
    active.realtimeChanged({ revision: 5, status: 'active' });
    active.realtimeChanged({ revision: 5, status: 'active' });
    active.realtimeStatus('CHANNEL_ERROR');
  });
  await page.clock.fastForward(30_001);
  await expect
    .poll(() => requests.filter(({ matchId }) => matchId === 'active').length)
    .toBe(3);

  const activeRequests = requests.filter(({ matchId }) => matchId === 'active');
  expect(activeRequests).toHaveLength(3);
  expect(
    activeRequests.filter(({ select }) => select.includes('planet_snapshot')),
  ).toHaveLength(1);
  expect(
    activeRequests.filter(({ select }) => select.includes('state_snapshot')),
  ).toHaveLength(2);
  expect(
    activeRequests.filter(
      ({ select }) =>
        select === 'id, status, revision, state_fingerprint, updated_at',
    ),
  ).toHaveLength(1);
});
