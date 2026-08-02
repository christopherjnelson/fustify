import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from './database.types';
import { heartbeatRoomMembership, type RoomState } from './multiplayerApi';
import {
  isWaitingRoomMember,
  ROOM_HEARTBEAT_INTERVAL_MS,
  startRoomHeartbeatScheduler,
} from './roomHeartbeatScheduler';

class FakeTarget {
  visibilityState: DocumentVisibilityState = 'visible';
  private readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

function schedulerTargets() {
  const windowTarget = new FakeTarget() as FakeTarget & {
    setInterval(handler: () => void, timeout: number): number;
    clearInterval(id: number): void;
  };
  windowTarget.setInterval = (handler, timeout) =>
    setInterval(handler, timeout) as unknown as number;
  windowTarget.clearInterval = (id) => clearInterval(id);
  const documentTarget = new FakeTarget();
  vi.stubGlobal('window', windowTarget);
  vi.stubGlobal('document', documentTarget);
  return { windowTarget, documentTarget };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('waiting-room membership heartbeat', () => {
  it('coalesces overlapping RPC requests and passes only the room identifier', async () => {
    let resolveRpc:
      ((value: { data: boolean; error: null }) => void) | undefined;
    const rpc = vi.fn(
      () =>
        new Promise<{ data: boolean; error: null }>((resolve) => {
          resolveRpc = resolve;
        }),
    );
    const client = { rpc } as unknown as SupabaseClient<Database>;

    const first = heartbeatRoomMembership(client, 'room-id');
    const second = heartbeatRoomMembership(client, 'room-id');

    expect(second).toBe(first);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('heartbeat_room_membership', {
      p_room_id: 'room-id',
    });
    resolveRpc?.({ data: true, error: null });
    await expect(first).resolves.toBe(true);
  });

  it('touches immediately, every minute, and on focus, visibility, and online recovery', async () => {
    vi.useFakeTimers();
    const { windowTarget, documentTarget } = schedulerTargets();
    const touch = vi.fn(async () => true);
    const stop = startRoomHeartbeatScheduler({
      touch,
      reconcile: vi.fn(async () => undefined),
    });

    expect(touch).toHaveBeenCalledTimes(1);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(ROOM_HEARTBEAT_INTERVAL_MS);
    expect(touch).toHaveBeenCalledTimes(2);

    windowTarget.dispatch('focus');
    await flushPromises();
    documentTarget.visibilityState = 'hidden';
    documentTarget.dispatch('visibilitychange');
    documentTarget.visibilityState = 'visible';
    documentTarget.dispatch('visibilitychange');
    await flushPromises();
    windowTarget.dispatch('online');
    await flushPromises();

    expect(touch).toHaveBeenCalledTimes(5);
    stop();
  });

  it('prevents overlapping touches and reconciles a no-longer-applicable membership', async () => {
    vi.useFakeTimers();
    const { windowTarget, documentTarget } = schedulerTargets();
    let resolveTouch: ((value: boolean) => void) | undefined;
    const touch = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveTouch = resolve;
        }),
    );
    const reconcile = vi.fn(async () => undefined);
    const stop = startRoomHeartbeatScheduler({
      touch,
      reconcile,
    });

    windowTarget.dispatch('focus');
    windowTarget.dispatch('online');
    documentTarget.dispatch('visibilitychange');
    await vi.advanceTimersByTimeAsync(ROOM_HEARTBEAT_INTERVAL_MS);
    expect(touch).toHaveBeenCalledTimes(1);

    resolveTouch?.(false);
    await flushPromises();
    expect(reconcile).toHaveBeenCalledTimes(1);
    stop();
  });

  it('keeps transient failures non-fatal and retries on the next normal opportunity', async () => {
    vi.useFakeTimers();
    schedulerTargets();
    const touch = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('sensitive transport detail'))
      .mockResolvedValue(true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const stop = startRoomHeartbeatScheduler({
      touch,
      reconcile: vi.fn(async () => undefined),
    });

    await flushPromises();
    expect(warn).toHaveBeenCalledWith('Waiting-room heartbeat failed.');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('sensitive');

    await vi.advanceTimersByTimeAsync(ROOM_HEARTBEAT_INTERVAL_MS);
    expect(touch).toHaveBeenCalledTimes(2);
    stop();
  });

  it('disposes the interval and recovery listeners when stopped', async () => {
    vi.useFakeTimers();
    const { windowTarget, documentTarget } = schedulerTargets();
    const touch = vi.fn(async () => true);
    const stop = startRoomHeartbeatScheduler({
      touch,
      reconcile: vi.fn(async () => undefined),
    });
    await flushPromises();

    stop();
    windowTarget.dispatch('focus');
    windowTarget.dispatch('online');
    documentTarget.dispatch('visibilitychange');
    await vi.advanceTimersByTimeAsync(ROOM_HEARTBEAT_INTERVAL_MS * 2);

    expect(touch).toHaveBeenCalledTimes(1);
  });

  it('enables scheduling only for canonical waiting-room membership', () => {
    const state = {
      room: { status: 'waiting' },
      members: [{ user_id: 'current-user' }],
    } as RoomState;

    expect(isWaitingRoomMember(state, 'current-user')).toBe(true);
    expect(isWaitingRoomMember(state, 'other-user')).toBe(false);
    expect(
      isWaitingRoomMember(
        { ...state, room: { ...state.room, status: 'closed' } },
        'current-user',
      ),
    ).toBe(false);
    expect(
      isWaitingRoomMember(
        { ...state, room: { ...state.room, status: 'active' } },
        'current-user',
      ),
    ).toBe(false);
    expect(isWaitingRoomMember(null, 'current-user')).toBe(false);
  });
});
