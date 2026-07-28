import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { MatchEvent } from '../core/game/types';
import type { Database, Tables } from './database.types';
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
  client: SupabaseClient<Database>,
  matchId: string,
): Promise<MatchEventReactionRow[]> {
  const { data, error } = await client
    .from('match_event_reactions')
    .select('event_id,user_id,reaction,updated_at')
    .eq('match_id', matchId)
    .order('event_id')
    .order('user_id');
  if (error) throw multiplayerError(error);
  return (data ?? []).map((row) => {
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
  client: SupabaseClient<Database>,
  matchId: string,
  eventId: string,
  reaction: MatchEventReaction | null,
): Promise<void> {
  const { error } = await client.rpc('set_match_event_reaction', {
    p_match_id: matchId,
    p_event_id: eventId,
    // The database intentionally accepts null to remove the caller's reaction.
    p_reaction: reaction as string,
  });
  if (error) throw multiplayerError(error);
}

export function subscribeToMatchEventReactions(
  client: SupabaseClient<Database>,
  matchId: string,
  onChange: () => void,
  onStatus: (status: string) => void,
): RealtimeChannel {
  return client
    .channel(`private-match-reactions:${matchId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'match_event_reactions',
        filter: `match_id=eq.${matchId}`,
      },
      onChange,
    )
    .subscribe(onStatus);
}

export type MatchEventReactionRecord = Tables<'match_event_reactions'>;
