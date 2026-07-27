import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WaitingRoomExitDialog } from './WaitingRoomExitDialog';
import {
  closedRoomLandingNotice,
  runWaitingRoomExit,
  waitingRoomExitCopy,
} from './waitingRoomExit';

describe('waiting room exit confirmation', () => {
  it('returns host and guest closure feedback to the correct lifecycle owner', () => {
    expect(closedRoomLandingNotice('host-id', 'host-id')).toBeUndefined();
    expect(closedRoomLandingNotice('host-id', 'guest-id')).toBe(
      'The host closed this room.',
    );
  });

  it('uses host-specific close-room language', () => {
    expect(waitingRoomExitCopy(true)).toEqual({
      title: 'Close Room and Leave?',
      description: 'Leaving will close this room for everyone.',
      action: 'Close Room',
    });
  });

  it('uses guest-specific leave-room language', () => {
    expect(waitingRoomExitCopy(false)).toEqual({
      title: 'Leave Room?',
      description: 'You will leave this multiplayer room.',
      action: 'Leave Room',
    });
  });

  it('renders an accessible, retryable dialog without raw errors', () => {
    const markup = renderToStaticMarkup(
      createElement(WaitingRoomExitDialog, {
        host: true,
        busy: false,
        error: 'The room could not be left. Try again.',
        onCancel: () => undefined,
        onConfirm: () => undefined,
      }),
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain(
      'aria-describedby="waiting-room-exit-description"',
    );
    expect(markup).toContain('The room could not be left. Try again.');
    expect(markup).toContain('Cancel');
  });

  it('disables both actions and exposes a busy state while leaving', () => {
    const markup = renderToStaticMarkup(
      createElement(WaitingRoomExitDialog, {
        host: false,
        busy: true,
        error: null,
        onCancel: () => undefined,
        onConfirm: () => undefined,
      }),
    );

    expect(markup.match(/disabled=""/gu)).toHaveLength(2);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Leaving…');
  });

  it('waits for leave success before navigating and deduplicates confirmation', async () => {
    let resolveLeave!: () => void;
    const leave = new Promise<void>((resolve) => {
      resolveLeave = resolve;
    });
    const calls: string[] = [];
    const pending = { current: false };
    const first = runWaitingRoomExit({
      pending,
      leave: () => {
        calls.push('rpc');
        return leave;
      },
      onSuccess: () => calls.push('navigate'),
      onFailure: () => calls.push('error'),
    });
    await runWaitingRoomExit({
      pending,
      leave: async () => {
        calls.push('duplicate-rpc');
      },
      onSuccess: () => calls.push('duplicate-navigation'),
      onFailure: () => calls.push('duplicate-error'),
    });

    expect(calls).toEqual(['rpc']);
    resolveLeave();
    await first;
    expect(calls).toEqual(['rpc', 'navigate']);
  });

  it('stays put after failure and allows retry', async () => {
    const calls: string[] = [];
    const pending = { current: false };
    await runWaitingRoomExit({
      pending,
      leave: async () => {
        throw new Error('raw Supabase detail');
      },
      onSuccess: () => calls.push('navigate'),
      onFailure: () => calls.push('contained-error'),
    });
    await runWaitingRoomExit({
      pending,
      leave: async () => {
        calls.push('retry-rpc');
      },
      onSuccess: () => calls.push('navigate'),
      onFailure: () => calls.push('error'),
    });

    expect(calls).toEqual(['contained-error', 'retry-rpc', 'navigate']);
  });

  it('ignores a late result after the room view has been abandoned', async () => {
    let resolveLeave!: () => void;
    const leave = new Promise<void>((resolve) => {
      resolveLeave = resolve;
    });
    const calls: string[] = [];
    let active = true;
    const request = runWaitingRoomExit({
      pending: { current: false },
      leave: () => leave,
      isActive: () => active,
      onSuccess: () => calls.push('navigate'),
      onFailure: () => calls.push('error'),
    });

    active = false;
    resolveLeave();
    await request;

    expect(calls).toEqual([]);
  });
});
