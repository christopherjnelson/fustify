import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from './database.types';
import {
  aggregateMatchEventReactions,
  fetchMatchEventReactions,
  isReactableMatchEvent,
  setMatchEventReaction,
  subscribeToMatchEventReactions,
  type MatchEventReactionRow,
} from './matchEventReactions';

const rows: MatchEventReactionRow[] = [
  {
    eventId: 'event-2',
    userId: 'user-a',
    reaction: 'fire',
    updatedAt: '2026-07-23T12:00:00Z',
  },
  {
    eventId: 'event-2',
    userId: 'user-b',
    reaction: 'heart',
    updatedAt: '2026-07-23T12:00:01Z',
  },
  {
    eventId: 'event-2',
    userId: 'user-c',
    reaction: 'fire',
    updatedAt: '2026-07-23T12:00:02Z',
  },
];

describe('multiplayer Activity reaction aggregation', () => {
  it('derives deterministic counts and the current user reaction', () => {
    expect(aggregateMatchEventReactions(rows, 'user-b')).toEqual({
      'event-2': {
        eventId: 'event-2',
        counts: { fire: 2, laugh: 0, heart: 1, angry: 0 },
        ownReaction: 'heart',
      },
    });
  });

  it('deduplicates repeated canonical rows without inflating counts', () => {
    const first = aggregateMatchEventReactions([...rows, ...rows], 'user-a');
    const refetched = aggregateMatchEventReactions(rows, 'user-a');
    expect(first).toEqual(refetched);
    expect(first['event-2']?.counts.fire).toBe(2);
  });

  it('resolves impossible duplicate conflicts deterministically', () => {
    const duplicate = {
      ...rows[0]!,
      reaction: 'laugh' as const,
      updatedAt: '2026-07-23T12:00:03Z',
    };
    expect(
      aggregateMatchEventReactions([duplicate, rows[0]!], 'user-a')['event-2']
        ?.ownReaction,
    ).toBe('laugh');
    expect(
      aggregateMatchEventReactions([rows[0]!, duplicate], 'user-a')['event-2']
        ?.counts,
    ).toEqual({ fire: 0, laugh: 1, heart: 0, angry: 0 });
  });

  it('only enables trusted canonical event identities', () => {
    expect(isReactableMatchEvent({ id: 'event-1' })).toBe(true);
    expect(isReactableMatchEvent({ id: 'event-0' })).toBe(false);
    expect(isReactableMatchEvent({ id: 'legacy-message' })).toBe(false);
    expect(
      isReactableMatchEvent({ id: undefined } as unknown as { id: string }),
    ).toBe(false);
  });
});

describe('multiplayer Activity reaction API', () => {
  it('fetches RLS-protected rows and parses the stable reaction contract', async () => {
    const order = vi.fn();
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order,
    };
    const chainedSecondOrder = vi.fn().mockResolvedValue({
      data: [
        {
          event_id: 'event-1',
          user_id: 'user-a',
          reaction: 'fire',
          updated_at: '2026-07-23T12:00:00Z',
        },
      ],
      error: null,
    });
    builder.order.mockReturnValueOnce({ order: chainedSecondOrder });
    const client = {
      from: vi.fn(() => builder),
    } as unknown as SupabaseClient<Database>;

    await expect(fetchMatchEventReactions(client, 'match-a')).resolves.toEqual([
      {
        eventId: 'event-1',
        userId: 'user-a',
        reaction: 'fire',
        updatedAt: '2026-07-23T12:00:00Z',
      },
    ]);
    expect(builder.eq).toHaveBeenCalledWith('match_id', 'match-a');
  });

  it('uses explicit desired-state RPC arguments for set and remove', async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    const client = { rpc } as unknown as SupabaseClient<Database>;

    await setMatchEventReaction(client, 'match-a', 'event-2', 'angry');
    await setMatchEventReaction(client, 'match-a', 'event-2', null);

    expect(rpc).toHaveBeenNthCalledWith(1, 'set_match_event_reaction', {
      p_match_id: 'match-a',
      p_event_id: 'event-2',
      p_reaction: 'angry',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'set_match_event_reaction', {
      p_match_id: 'match-a',
      p_event_id: 'event-2',
      p_reaction: null,
    });
  });

  it('sanitizes database failures before they reach Activity rendering', async () => {
    const client = {
      rpc: vi.fn(async () => ({
        data: null,
        error: new Error(
          'match_event_not_found: internal SQL context should stay private',
        ),
      })),
    } as unknown as SupabaseClient<Database>;

    await expect(
      setMatchEventReaction(client, 'match-a', 'event-404', 'fire'),
    ).rejects.toThrow(
      'That Activity entry is no longer available for reactions.',
    );
  });

  it('subscribes to only the current match reaction rows', () => {
    const channel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    };
    const client = {
      channel: vi.fn(() => channel),
    } as unknown as SupabaseClient<Database>;
    const onChange = vi.fn();
    const onStatus = vi.fn();

    expect(
      subscribeToMatchEventReactions(client, 'match-a', onChange, onStatus),
    ).toBe(channel);
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'match_event_reactions',
        filter: 'match_id=eq.match-a',
      },
      onChange,
    );
    expect(channel.subscribe).toHaveBeenCalledWith(onStatus);
  });
});
