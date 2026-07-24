import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from './database.types';
import {
  MATCH_BOOTSTRAP_COLUMNS,
  MATCH_MUTABLE_COLUMNS,
  MATCH_VERSION_COLUMNS,
  type MultiplayerMatch,
} from './multiplayerApi';
import {
  MATCH_FALLBACK_INTERVAL_MS,
  MatchSynchronization,
} from './matchSynchronization';

type QueryResult = { data: unknown; error: unknown };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function match(overrides: Partial<MultiplayerMatch> = {}): MultiplayerMatch {
  return {
    id: 'match-a',
    room_id: 'room-a',
    status: 'active',
    revision: 4,
    setup_snapshot: { assignmentMode: 'random' },
    seat_order_snapshot: [{ playerId: 'player-a' }],
    generator_metadata: { version: 1 },
    planet_snapshot: { seed: 'small-world' },
    state_snapshot: { turnNumber: 2 },
    state_fingerprint: 'fingerprint-4',
    last_command_type: 'END_TURN',
    winner_player_id: null,
    winner_user_id: null,
    created_at: '2026-07-24T12:00:00Z',
    updated_at: '2026-07-24T12:00:04Z',
    ...overrides,
  };
}

function queryClient() {
  const requests: string[] = [];
  const responses = new Map<
    string,
    Array<QueryResult | Promise<QueryResult>>
  >();
  const enqueue = (
    columns: string,
    response: QueryResult | Promise<QueryResult>,
  ) => {
    const queue = responses.get(columns) ?? [];
    queue.push(response);
    responses.set(columns, queue);
  };
  const client = {
    from: vi.fn((table: string) => {
      expect(table).toBe('matches');
      return {
        select: (columns: string) => {
          requests.push(columns);
          return {
            eq: () => ({
              maybeSingle: async () => {
                const response = responses.get(columns)?.shift();
                if (!response)
                  throw new Error(`Missing query response for ${columns}`);
                return response;
              },
            }),
          };
        },
      };
    }),
  } as unknown as SupabaseClient<Database>;
  return { client, requests, enqueue };
}

function controller(
  client: SupabaseClient<Database>,
  installed: MultiplayerMatch[],
  errors: Error[] = [],
  onCompleted = vi.fn(),
) {
  return {
    synchronization: new MatchSynchronization({
      client,
      matchId: 'match-a',
      install: (canonical) => installed.push(canonical),
      onError: (error) => errors.push(error),
      onCompleted,
    }),
    onCompleted,
  };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

describe('match synchronization reads', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('bootstraps once with explicit fields and retains immutable setup data', async () => {
    const { client, requests, enqueue } = queryClient();
    const canonical = match();
    enqueue(MATCH_BOOTSTRAP_COLUMNS, { data: canonical, error: null });
    const installed: MultiplayerMatch[] = [];
    const { synchronization } = controller(client, installed);
    const remounted = controller(client, installed).synchronization;

    const abandonedBootstrap = synchronization.bootstrap();
    const retainedBootstrap = remounted.bootstrap();
    synchronization.stop();
    await Promise.all([abandonedBootstrap, retainedBootstrap]);

    expect(requests).toEqual([MATCH_BOOTSTRAP_COLUMNS]);
    expect(MATCH_BOOTSTRAP_COLUMNS).not.toBe('*');
    expect(installed[0]?.planet_snapshot).toEqual({ seed: 'small-world' });
    expect(installed[0]?.setup_snapshot).toEqual({
      assignmentMode: 'random',
    });
    remounted.stop();
  });

  it('ignores installed Realtime revisions and coalesces newer duplicates', async () => {
    const { client, requests, enqueue } = queryClient();
    enqueue(MATCH_BOOTSTRAP_COLUMNS, { data: match(), error: null });
    const next = deferred<QueryResult>();
    enqueue(MATCH_MUTABLE_COLUMNS, next.promise);
    const installed: MultiplayerMatch[] = [];
    const { synchronization } = controller(client, installed);
    await synchronization.bootstrap();

    synchronization.realtimeChanged({ revision: 4, status: 'active' });
    synchronization.realtimeChanged({ revision: 5, status: 'active' });
    synchronization.realtimeChanged({ revision: 5, status: 'active' });
    expect(requests).toEqual([MATCH_BOOTSTRAP_COLUMNS, MATCH_MUTABLE_COLUMNS]);

    next.resolve({
      data: {
        status: 'active',
        revision: 5,
        state_snapshot: { turnNumber: 3 },
        state_fingerprint: 'fingerprint-5',
        last_command_type: 'END_TURN',
        winner_player_id: null,
        winner_user_id: null,
        updated_at: '2026-07-24T12:00:05Z',
      },
      error: null,
    });
    await settle();

    expect(
      requests.filter((request) => request === MATCH_MUTABLE_COLUMNS),
    ).toHaveLength(1);
    expect(MATCH_MUTABLE_COLUMNS).not.toContain('planet_snapshot');
    expect(MATCH_MUTABLE_COLUMNS).not.toContain('setup_snapshot');
    expect(installed.at(-1)?.planet_snapshot).toEqual({ seed: 'small-world' });
    synchronization.stop();
  });

  it('uses a disconnected-only lightweight fallback no faster than 30 seconds', async () => {
    const { client, requests, enqueue } = queryClient();
    enqueue(MATCH_BOOTSTRAP_COLUMNS, { data: match(), error: null });
    enqueue(MATCH_VERSION_COLUMNS, {
      data: {
        id: 'match-a',
        status: 'active',
        revision: 4,
        state_fingerprint: 'fingerprint-4',
        updated_at: '2026-07-24T12:00:04Z',
      },
      error: null,
    });
    const installed: MultiplayerMatch[] = [];
    const { synchronization } = controller(client, installed);
    await synchronization.bootstrap();
    synchronization.realtimeStatus('SUBSCRIBED');

    await vi.advanceTimersByTimeAsync(MATCH_FALLBACK_INTERVAL_MS * 2);
    expect(requests).toEqual([MATCH_BOOTSTRAP_COLUMNS]);

    synchronization.realtimeStatus('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(MATCH_FALLBACK_INTERVAL_MS - 1);
    expect(requests).toEqual([MATCH_BOOTSTRAP_COLUMNS]);
    await vi.advanceTimersByTimeAsync(1);
    expect(MATCH_FALLBACK_INTERVAL_MS).toBeGreaterThanOrEqual(30_000);
    expect(requests.at(-1)).toBe(MATCH_VERSION_COLUMNS);
    synchronization.stop();
  });

  it('fetches mutable state only after a version probe finds a newer revision', async () => {
    const { client, requests, enqueue } = queryClient();
    enqueue(MATCH_BOOTSTRAP_COLUMNS, { data: match(), error: null });
    enqueue(MATCH_VERSION_COLUMNS, {
      data: {
        id: 'match-a',
        status: 'active',
        revision: 5,
        state_fingerprint: 'fingerprint-5',
        updated_at: '2026-07-24T12:00:05Z',
      },
      error: null,
    });
    enqueue(MATCH_MUTABLE_COLUMNS, {
      data: {
        status: 'active',
        revision: 5,
        state_snapshot: { turnNumber: 3 },
        state_fingerprint: 'fingerprint-5',
        last_command_type: 'END_TURN',
        winner_player_id: null,
        winner_user_id: null,
        updated_at: '2026-07-24T12:00:05Z',
      },
      error: null,
    });
    const installed: MultiplayerMatch[] = [];
    const { synchronization } = controller(client, installed);
    await synchronization.bootstrap();
    synchronization.realtimeStatus('CHANNEL_ERROR');

    await vi.advanceTimersByTimeAsync(MATCH_FALLBACK_INTERVAL_MS);

    expect(requests).toEqual([
      MATCH_BOOTSTRAP_COLUMNS,
      MATCH_VERSION_COLUMNS,
      MATCH_MUTABLE_COLUMNS,
    ]);
    expect(installed.at(-1)?.revision).toBe(5);
    synchronization.stop();
  });

  it('shuts polling down when completion is installed', async () => {
    const { client, requests, enqueue } = queryClient();
    enqueue(MATCH_BOOTSTRAP_COLUMNS, { data: match(), error: null });
    enqueue(MATCH_MUTABLE_COLUMNS, {
      data: {
        status: 'completed',
        revision: 5,
        state_snapshot: { turnNumber: 3 },
        state_fingerprint: 'fingerprint-5',
        last_command_type: 'END_TURN',
        winner_player_id: 'player-a',
        winner_user_id: 'user-a',
        updated_at: '2026-07-24T12:00:05Z',
      },
      error: null,
    });
    const installed: MultiplayerMatch[] = [];
    const { synchronization, onCompleted } = controller(client, installed);
    await synchronization.bootstrap();

    synchronization.realtimeChanged({ revision: 5, status: 'completed' });
    await settle();
    synchronization.realtimeStatus('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(MATCH_FALLBACK_INTERVAL_MS * 3);

    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(installed.at(-1)?.status).toBe('completed');
    expect(requests).toEqual([MATCH_BOOTSTRAP_COLUMNS, MATCH_MUTABLE_COLUMNS]);
    synchronization.stop();
  });

  it('bootstraps a completed review once without scheduling recovery reads', async () => {
    const { client, requests, enqueue } = queryClient();
    enqueue(MATCH_BOOTSTRAP_COLUMNS, {
      data: match({ status: 'completed' }),
      error: null,
    });
    const installed: MultiplayerMatch[] = [];
    const { synchronization } = controller(client, installed);

    await synchronization.bootstrap();
    await vi.advanceTimersByTimeAsync(MATCH_FALLBACK_INTERVAL_MS * 3);
    synchronization.visibilityChanged(false);
    synchronization.visibilityChanged(true);

    expect(requests).toEqual([MATCH_BOOTSTRAP_COLUMNS]);
    synchronization.stop();
  });

  it('stops after an authorization failure and permits a fresh controller retry', async () => {
    const first = queryClient();
    first.enqueue(MATCH_BOOTSTRAP_COLUMNS, {
      data: null,
      error: { status: 401, message: 'secret gateway detail' },
    });
    const errors: Error[] = [];
    const failed = controller(first.client, [], errors).synchronization;
    await failed.bootstrap();
    failed.realtimeStatus('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(MATCH_FALLBACK_INTERVAL_MS * 3);

    expect(first.requests).toEqual([MATCH_BOOTSTRAP_COLUMNS]);
    expect(errors[0]?.message).toBe(
      'This private room is unavailable to this player.',
    );
    expect(errors[0]?.message).not.toContain('gateway');

    const restored = queryClient();
    restored.enqueue(MATCH_BOOTSTRAP_COLUMNS, {
      data: match(),
      error: null,
    });
    const retried = controller(restored.client, []).synchronization;
    await retried.bootstrap();
    expect(restored.requests).toEqual([MATCH_BOOTSTRAP_COLUMNS]);
    failed.stop();
    retried.stop();
  });

  it('coalesces visibility probes and invalidates stale mutable responses', async () => {
    const { client, requests, enqueue } = queryClient();
    enqueue(MATCH_BOOTSTRAP_COLUMNS, { data: match(), error: null });
    const firstProbe = deferred<QueryResult>();
    enqueue(MATCH_VERSION_COLUMNS, firstProbe.promise);
    enqueue(MATCH_VERSION_COLUMNS, {
      data: {
        id: 'match-a',
        status: 'active',
        revision: 4,
        state_fingerprint: 'fingerprint-4',
        updated_at: '2026-07-24T12:00:04Z',
      },
      error: null,
    });
    const installed: MultiplayerMatch[] = [];
    const { synchronization } = controller(client, installed);
    await synchronization.bootstrap();

    synchronization.visibilityChanged(true);
    synchronization.visibilityChanged(true);
    expect(
      requests.filter((request) => request === MATCH_VERSION_COLUMNS),
    ).toHaveLength(1);
    firstProbe.resolve({
      data: {
        id: 'match-a',
        status: 'active',
        revision: 4,
        state_fingerprint: 'fingerprint-4',
        updated_at: '2026-07-24T12:00:04Z',
      },
      error: null,
    });
    await settle();
    expect(
      requests.filter((request) => request === MATCH_VERSION_COLUMNS),
    ).toHaveLength(2);

    const staleMutable = deferred<QueryResult>();
    enqueue(MATCH_MUTABLE_COLUMNS, staleMutable.promise);
    synchronization.realtimeChanged({ revision: 5, status: 'active' });
    synchronization.stop();
    staleMutable.resolve({
      data: {
        status: 'active',
        revision: 5,
        state_snapshot: { turnNumber: 99 },
        state_fingerprint: 'fingerprint-5',
        last_command_type: 'END_TURN',
        winner_player_id: null,
        winner_user_id: null,
        updated_at: '2026-07-24T12:00:05Z',
      },
      error: null,
    });
    await settle();
    expect(installed).toHaveLength(1);
  });
});
