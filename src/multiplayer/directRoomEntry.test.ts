import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from './database.types';
import {
  directRoomEntryFailure,
  directRoomEntryStatus,
  enterRoomFromDirectLink,
  isValidDirectRoomId,
} from './directRoomEntry';
import { RoomMembershipRequiredError, type RoomState } from './multiplayerApi';

const roomId = '10000000-0000-4000-8000-000000000001';
const userId = '20000000-0000-4000-8000-000000000001';

function client(): SupabaseClient<Database> {
  return {} as SupabaseClient<Database>;
}

function roomState(id = roomId): RoomState {
  return {
    room: {
      id,
      status: 'waiting',
    },
    members: [],
    seats: [],
    match: null,
  } as unknown as RoomState;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('direct public-room entry', () => {
  it('uses the normal authoritative load without joining an existing member', async () => {
    const canonical = roomState();
    const fetch = vi.fn(async () => canonical);
    const join = vi.fn();

    await expect(
      enterRoomFromDirectLink(client(), userId, roomId, { fetch, join }),
    ).resolves.toBe(canonical);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(join).not.toHaveBeenCalled();
  });

  it('joins a non-member only after an RLS-hidden load, then refetches authoritative state', async () => {
    const canonical = roomState();
    const calls: string[] = [];
    const fetch = vi
      .fn()
      .mockImplementationOnce(async () => {
        calls.push('protected-load');
        throw new RoomMembershipRequiredError('member read returned no room');
      })
      .mockImplementationOnce(async () => {
        calls.push('authoritative-refetch');
        return canonical;
      });
    const join = vi.fn(async () => {
      calls.push('join-public-room');
    });

    await expect(
      enterRoomFromDirectLink(client(), userId, roomId, { fetch, join }),
    ).resolves.toBe(canonical);
    expect(calls).toEqual([
      'protected-load',
      'join-public-room',
      'authoritative-refetch',
    ]);
  });

  it('coalesces Strict Mode and rerender entry attempts through join completion', async () => {
    const canonical = roomState();
    const protectedLoad = deferred<RoomState>();
    const joinRequest = deferred<void>();
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => protectedLoad.promise)
      .mockImplementationOnce(async () => canonical);
    const join = vi.fn(() => joinRequest.promise);
    const supabase = client();

    const first = enterRoomFromDirectLink(supabase, userId, roomId, {
      fetch,
      join,
    });
    const duplicate = enterRoomFromDirectLink(supabase, userId, roomId, {
      fetch,
      join,
    });
    expect(duplicate).toBe(first);

    protectedLoad.reject(
      new RoomMembershipRequiredError('member read returned no room'),
    );
    await vi.waitFor(() => expect(join).toHaveBeenCalledTimes(1));
    joinRequest.resolve();

    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      canonical,
      canonical,
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(join).toHaveBeenCalledTimes(1);
  });

  it('does not expose the failed pre-membership load after a successful join', async () => {
    const canonical = roomState();
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(
        new RoomMembershipRequiredError('stale unavailable result'),
      )
      .mockResolvedValueOnce(canonical);
    const join = vi.fn(async () => undefined);

    const result = await enterRoomFromDirectLink(client(), userId, roomId, {
      fetch,
      join,
    });

    expect(result).toBe(canonical);
    expect(join).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not join in response to a transport or application failure', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('network unavailable'));
    const join = vi.fn();

    await expect(
      enterRoomFromDirectLink(client(), userId, roomId, { fetch, join }),
    ).rejects.toThrow('network unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(join).not.toHaveBeenCalled();
  });

  it('keeps pending entry on the loading screen', () => {
    expect(directRoomEntryStatus(null)).toEqual({
      title: 'Loading room',
      message: 'Checking room access and restoring canonical room state…',
    });
  });

  it('rejects invalid route ids before any room request', async () => {
    const fetch = vi.fn();
    const join = vi.fn();

    expect(isValidDirectRoomId('not-a-room-id')).toBe(false);
    await expect(
      enterRoomFromDirectLink(client(), userId, 'not-a-room-id', {
        fetch,
        join,
      }),
    ).rejects.toThrow('invalid');
    expect(fetch).not.toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
    expect(directRoomEntryStatus('invalid-link').title).toBe(
      'Invalid room link',
    );
  });

  it('maps only safe join outcomes and keeps unavailable cases indistinguishable', () => {
    expect(
      directRoomEntryFailure({
        code: 'P0001',
        message: 'public_room_unavailable',
      }),
    ).toBe('unavailable');
    expect(directRoomEntryStatus('unavailable')).toEqual({
      title: 'Room unavailable',
      message: 'This room is unavailable or no longer accepting players.',
    });
    expect(
      directRoomEntryFailure({ code: 'P0001', message: 'full_room' }),
    ).toBe('full');
    expect(
      directRoomEntryFailure({ code: 'P0001', message: 'account_required' }),
    ).toBe('account');
  });

  it('does not mislabel transport or server failures as private rooms', () => {
    const rawError = new Error('fetch failed: secret upstream detail');
    expect(directRoomEntryFailure(rawError)).toBe('temporary');
    const status = directRoomEntryStatus('temporary');
    expect(status.title).toBe('Room temporarily unavailable');
    expect(status.message).not.toContain('private');
    expect(status.message).not.toContain('secret');
  });
});
