import type { MatchEvent } from '../core/game/types';

export interface ActivityFeedTracking {
  matchId: string;
  eventIds: string[];
  seenEventIds: string[];
  unreadCount: number;
}

export function reconcileActivityFeed(
  previous: ActivityFeedTracking | null,
  matchId: string,
  events: readonly MatchEvent[],
  readingNewest: boolean,
): ActivityFeedTracking {
  const eventIds = events.map((event) => event.id);
  if (!previous || previous.matchId !== matchId) {
    return { matchId, eventIds, seenEventIds: eventIds, unreadCount: 0 };
  }

  const seenEventIds = [...new Set([...previous.seenEventIds, ...eventIds])];
  const isAppend =
    eventIds.length >= previous.eventIds.length &&
    previous.eventIds.every((id, index) => eventIds[index] === id);
  if (!isAppend) {
    return { ...previous, eventIds, seenEventIds };
  }

  const seen = new Set(previous.seenEventIds);
  const appendedCount = eventIds
    .slice(previous.eventIds.length)
    .filter((id) => !seen.has(id)).length;
  return {
    matchId,
    eventIds,
    seenEventIds,
    unreadCount: readingNewest ? 0 : previous.unreadCount + appendedCount,
  };
}

export function markActivityRead(
  tracking: ActivityFeedTracking,
): ActivityFeedTracking {
  return tracking.unreadCount === 0
    ? tracking
    : { ...tracking, unreadCount: 0 };
}
