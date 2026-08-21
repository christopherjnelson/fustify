import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationClient } from './applicationClient';
import {
  aggregateMatchEventReactions,
  fetchMatchEventReactions,
  setMatchEventReaction,
} from './matchEventReactions';

const client = {} as ApplicationClient;

afterEach(() => vi.unstubAllGlobals());

describe('multiplayer Activity reactions', () => {
  it('aggregates canonical rows and identifies the current user reaction', () => {
    expect(
      aggregateMatchEventReactions(
        [
          { eventId: 'event-1', userId: 'a', reaction: 'fire', updatedAt: '1' },
          { eventId: 'event-1', userId: 'b', reaction: 'fire', updatedAt: '1' },
          {
            eventId: 'event-1',
            userId: 'a',
            reaction: 'heart',
            updatedAt: '2',
          },
        ],
        'a',
      ),
    ).toMatchObject({
      'event-1': {
        counts: { fire: 1, laugh: 0, heart: 1, angry: 0 },
        ownReaction: 'heart',
      },
    });
  });

  it('fetches and maps reaction rows through the application API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                event_id: 'event-1',
                user_id: 'user-a',
                reaction: 'laugh',
                updated_at: '2026-08-20T00:00:00Z',
              },
            ]),
          ),
      ),
    );
    await expect(fetchMatchEventReactions(client, 'match-a')).resolves.toEqual([
      {
        eventId: 'event-1',
        userId: 'user-a',
        reaction: 'laugh',
        updatedAt: '2026-08-20T00:00:00Z',
      },
    ]);
  });

  it('sets the explicit desired reaction through the application API', async () => {
    const fetch = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetch);
    await setMatchEventReaction(client, 'match-a', 'event-1', 'heart');
    expect(fetch).toHaveBeenCalledWith(
      '/api/multiplayer/matches/match-a/reactions',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ eventId: 'event-1', reaction: 'heart' }),
      }),
    );
  });
});
