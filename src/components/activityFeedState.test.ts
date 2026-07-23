import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '../core/game/types';
import { markActivityRead, reconcileActivityFeed } from './activityFeedState';

function events(...ids: string[]): MatchEvent[] {
  return ids.map((id, index) => ({
    id,
    turnNumber: 1,
    type: 'turn-started',
    message: `Event ${index + 1}`,
  }));
}

describe('activity feed tracking', () => {
  it('treats initial hydration and a new match baseline as already read', () => {
    const hydrated = reconcileActivityFeed(
      null,
      'match-1',
      events('event-1', 'event-2'),
      false,
    );
    const nextMatch = reconcileActivityFeed(
      hydrated,
      'match-2',
      events('event-1', 'event-2', 'event-3'),
      false,
    );

    expect(hydrated.unreadCount).toBe(0);
    expect(nextMatch.unreadCount).toBe(0);
  });

  it('counts only stable appended identities while Activity is not at newest', () => {
    const baseline = reconcileActivityFeed(
      null,
      'match-1',
      events('event-1', 'event-2'),
      true,
    );
    const appended = reconcileActivityFeed(
      baseline,
      'match-1',
      events('event-1', 'event-2', 'event-3', 'event-4'),
      false,
    );
    const identical = reconcileActivityFeed(
      appended,
      'match-1',
      events('event-1', 'event-2', 'event-3', 'event-4'),
      false,
    );

    expect(appended.unreadCount).toBe(2);
    expect(identical.unreadCount).toBe(2);
  });

  it('does not count canonical replacement as newly appended activity', () => {
    const baseline = reconcileActivityFeed(
      null,
      'match-1',
      events('event-1', 'event-2', 'event-3'),
      true,
    );
    const reconciled = reconcileActivityFeed(
      baseline,
      'match-1',
      events('event-1', 'event-2'),
      false,
    );
    const restored = reconcileActivityFeed(
      reconciled,
      'match-1',
      events('event-1', 'event-2', 'event-3'),
      false,
    );

    expect(reconciled.unreadCount).toBe(0);
    expect(restored.unreadCount).toBe(0);
  });

  it('keeps pinned appends read and explicitly clears accumulated unread', () => {
    const baseline = reconcileActivityFeed(
      null,
      'match-1',
      events('event-1'),
      true,
    );
    const unread = reconcileActivityFeed(
      baseline,
      'match-1',
      events('event-1', 'event-2'),
      false,
    );
    const pinned = reconcileActivityFeed(
      unread,
      'match-1',
      events('event-1', 'event-2', 'event-3'),
      true,
    );

    expect(pinned.unreadCount).toBe(0);
    expect(markActivityRead(unread).unreadCount).toBe(0);
  });
});
