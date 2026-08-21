import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { createAuthoritativeMatch } from '../src/multiplayer/authoritativeEngine.ts';
import { sha256Fingerprint } from '../src/multiplayer/gameProtocol.ts';
import { PostgresGameplayService } from './gameplayService.ts';

const matchId = '40000000-0000-4000-8000-000000000004';
const roomId = '10000000-0000-4000-8000-000000000001';
const commandId = '50000000-0000-4000-8000-000000000005';
const actorUserId = 'actor-user';

async function fixture() {
  return createAuthoritativeMatch(
    matchId,
    {
      id: roomId,
      seed: 'gameplay-service-test',
      territory_count: 42,
      continent_count: 6,
      assignment_mode: 'random',
      generator_version: 4,
    },
    [
      {
        seatIndex: 0,
        userId: actorUserId,
        displayName: 'Actor',
        controllerType: 'human',
      },
      {
        seatIndex: 1,
        userId: 'other-user',
        displayName: 'Other',
        controllerType: 'human',
      },
    ],
  );
}

function serviceDatabase(
  initialized: Awaited<ReturnType<typeof fixture>>,
  acceptedCommand?: Record<string, unknown>,
) {
  const client = {
    query: vi.fn(async (sql: string) => {
      if (sql.startsWith('select * from matches')) {
        return {
          rows: [
            {
              id: matchId,
              room_id: roomId,
              status: 'active',
              revision: '0',
              seat_order_snapshot: initialized.seatOrderSnapshot,
              planet_snapshot: initialized.planet,
              state_snapshot: initialized.state,
            },
          ],
        };
      }
      if (sql.includes('from room_seats as seats')) {
        return { rows: [{ seat_index: 0 }] };
      }
      if (sql.includes('from match_commands')) {
        return { rows: acceptedCommand ? [acceptedCommand] : [] };
      }
      return { rows: [], rowCount: 1 };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;
  const pool = {
    query: vi.fn(async () => ({ rows: [{ user_id: actorUserId }] })),
    connect: vi.fn(async () => client),
  } as unknown as Pool;
  return { service: new PostgresGameplayService(pool), pool, client };
}

describe('Postgres authoritative gameplay service', () => {
  it('runs a reducer command and persists one atomic command revision', async () => {
    const initialized = await fixture();
    const { service, client } = serviceDatabase(initialized);
    const territoryId = Object.entries(initialized.state.territories).find(
      ([, territory]) => territory.ownerId === initialized.state.activePlayerId,
    )![0];

    const result = await service.command('Bearer valid-session-token', {
      matchId,
      expectedRevision: 0,
      idempotencyKey: commandId,
      action: { type: 'PLACE_REINFORCEMENT', territoryId, amount: 1 },
    });

    expect(result).toMatchObject({ acceptedRevision: 1, duplicate: false });
    expect(result.stateFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(client.query).toHaveBeenCalledWith('begin');
    expect(client.query).toHaveBeenCalledWith('commit');
    expect(
      (client.query as ReturnType<typeof vi.fn>).mock.calls.some(([sql]) =>
        String(sql).includes('insert into match_commands'),
      ),
    ).toBe(true);
    expect(
      (client.query as ReturnType<typeof vi.fn>).mock.calls.some(([sql]) =>
        String(sql).includes('update matches set state_snapshot'),
      ),
    ).toBe(true);
  });

  it('returns the original result for an identical idempotent replay', async () => {
    const initialized = await fixture();
    const territoryId = Object.entries(initialized.state.territories).find(
      ([, territory]) => territory.ownerId === initialized.state.activePlayerId,
    )![0];
    const action = { type: 'PLACE_REINFORCEMENT', territoryId, amount: 1 };
    const commandHash = await sha256Fingerprint({
      expectedRevision: 0,
      action,
    });
    const { service, client } = serviceDatabase(initialized, {
      actor_user_id: actorUserId,
      command_hash: commandHash,
      command_payload: action,
      resulting_revision: '1',
      resulting_state_fingerprint: 'a'.repeat(64),
    });

    await expect(
      service.command('Bearer valid-session-token', {
        matchId,
        expectedRevision: 0,
        idempotencyKey: commandId,
        action,
      }),
    ).resolves.toEqual({
      acceptedRevision: 1,
      stateFingerprint: 'a'.repeat(64),
      duplicate: true,
    });
    expect(
      (client.query as ReturnType<typeof vi.fn>).mock.calls.some(([sql]) =>
        String(sql).includes('insert into match_commands'),
      ),
    ).toBe(false);
  });

  it('rejects malformed authorization before opening a transaction', async () => {
    const initialized = await fixture();
    const { service, pool } = serviceDatabase(initialized);

    await expect(
      service.command(null, {
        matchId,
        expectedRevision: 0,
        idempotencyKey: commandId,
        action: { type: 'END_ATTACK_PHASE' },
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'not_authenticated',
        status: 401,
      }),
    );
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
