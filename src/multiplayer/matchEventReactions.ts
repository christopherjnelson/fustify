import type { MatchEvent } from '../core/game/types';
import type {
  ApplicationClient,
  RealtimeSubscription,
} from './applicationClient';
import type { Tables } from './database.types';
import { multiplayerError } from './multiplayerError';

export const MATCH_EVENT_REACTIONS = [
  'fire',
  'laugh',
  'heart',
  'angry',
] as const;

export type MatchEventReaction = (typeof MATCH_EVENT_REACTIONS)[number];

export interface MatchEventReactionRow {
  eventId: string;
  userId: string;
  reaction: MatchEventReaction;
  updatedAt: string;
}

export interface EventReactionSummary {
  eventId: string;
  counts: Record<MatchEventReaction, number>;
  ownReaction: MatchEventReaction | null;
}

export type EventReactionSummaries = Record<string, EventReactionSummary>;

export interface ActivityReactionController {
  canReact: boolean;
  summaries: EventReactionSummaries;
  pendingEventIds: ReadonlySet<string>;
  errors: Readonly<Record<string, string>>;
  setReaction: (eventId: string, reaction: MatchEventReaction | null) => void;
}

function isMatchEventReaction(value: unknown): value is MatchEventReaction {
  return (
    typeof value === 'string' &&
    MATCH_EVENT_REACTIONS.includes(value as MatchEventReaction)
  );
}

function emptyCounts(): Record<MatchEventReaction, number> {
  return { fire: 0, laugh: 0, heart: 0, angry: 0 };
}

export function isReactableMatchEvent(event: Pick<MatchEvent, 'id'>): boolean {
  return typeof event.id === 'string' && /^event-[1-9][0-9]*$/.test(event.id);
}

export function aggregateMatchEventReactions(
  rows: readonly MatchEventReactionRow[],
  ownUserId: string,
): EventReactionSummaries {
  const canonicalRows = new Map<string, MatchEventReactionRow>();
  for (const row of rows) {
    if (!isMatchEventReaction(row.reaction)) continue;
    const key = `${row.eventId}\u0000${row.userId}`;
    const previous = canonicalRows.get(key);
    if (
      !previous ||
      row.updatedAt > previous.updatedAt ||
      (row.updatedAt === previous.updatedAt &&
        row.reaction.localeCompare(previous.reaction) > 0)
    ) {
      canonicalRows.set(key, row);
    }
  }

  const summaries: EventReactionSummaries = {};
  const orderedRows = [...canonicalRows.values()].sort(
    (left, right) =>
      left.eventId.localeCompare(right.eventId) ||
      left.userId.localeCompare(right.userId),
  );
  for (const row of orderedRows) {
    const summary = (summaries[row.eventId] ??= {
      eventId: row.eventId,
      counts: emptyCounts(),
      ownReaction: null,
    });
    summary.counts[row.reaction] += 1;
    if (row.userId === ownUserId) summary.ownReaction = row.reaction;
  }
  return summaries;
}

export async function fetchMatchEventReactions(
  _client: ApplicationClient,
  matchId: string,
): Promise<MatchEventReactionRow[]> {
  const response = await fetch(
    `/api/multiplayer/matches/${encodeURIComponent(matchId)}/reactions`,
    { credentials: 'same-origin' },
  );
  const data = (await response.json()) as
    | Array<{
        event_id: string;
        user_id: string;
        reaction: string;
        updated_at: string;
      }>
    | { code?: string };
  if (!response.ok || !Array.isArray(data)) {
    throw multiplayerError(
      !Array.isArray(data) && typeof data.code === 'string' ? data.code : data,
    );
  }
  return data.map((row) => {
    if (!isMatchEventReaction(row.reaction)) {
      throw multiplayerError('invalid_event_reaction');
    }
    return {
      eventId: row.event_id,
      userId: row.user_id,
      reaction: row.reaction,
      updatedAt: row.updated_at,
    };
  });
}

export async function setMatchEventReaction(
  _client: ApplicationClient,
  matchId: string,
  eventId: string,
  reaction: MatchEventReaction | null,
): Promise<void> {
  const response = await fetch(
    `/api/multiplayer/matches/${encodeURIComponent(matchId)}/reactions`,
    {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, reaction }),
    },
  );
  if (!response.ok) {
    const body = (await response.json()) as { code?: string };
    throw multiplayerError(body.code ?? body);
  }
}

export function subscribeToMatchEventReactions(
  _client: ApplicationClient,
  _matchId: string,
  onChange: () => void,
  onStatus: (status: string) => void,
): RealtimeSubscription {
  onStatus('SUBSCRIBED');
  const timer = window.setInterval(onChange, 1_000);
  return {
    unsubscribe() {
      window.clearInterval(timer);
    },
  };
}

export type MatchEventReactionRecord = Tables<'match_event_reactions'>;
