import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Room } from './multiplayerApi';
import { PostMatchActions } from './PostMatchActions';
import { createPostMatchRoomCreator } from './postMatchRoomCreator';

const settings = {
  seed: 'completed-world-314',
  territoryCount: 42,
  continentCount: 5,
  assignmentMode: 'random' as const,
  maxSeats: 4,
};

const room = (id: string) => ({ id }) as Room;

function markup(reviewing: boolean, isHost: boolean) {
  return renderToStaticMarkup(
    createElement(PostMatchActions, {
      reviewing,
      isHost,
      settings,
      createRoom: vi.fn(),
      onReviewingChange: vi.fn(),
      navigate: vi.fn(),
    }),
  );
}

describe('completed multiplayer post-match actions', () => {
  it('renders results and review navigation without the old loop', () => {
    const results = markup(false, true);
    expect(results).toContain('Review World');
    expect(results).toContain('Return to Multiplayer');
    expect(results).toContain('Rematch Same World');
    expect(results).toContain('Generate New World');

    const review = markup(true, false);
    expect(review).toContain('Back to Results');
    expect(review).toContain('Return to Multiplayer');
    expect(review).toContain(
      'The host can create the next room and share its new code.',
    );
    expect(review).not.toContain('Rematch Options');
    expect(review).not.toContain('Rematch Same World');
    expect(review).not.toContain('Generate New World');
  });

  it('creates same-world and fresh-seed rooms through one boundary without mutating settings', async () => {
    const original = structuredClone(settings);
    const createRoom = vi
      .fn<(candidate: typeof settings) => Promise<Room>>()
      .mockResolvedValueOnce(room('same-room'))
      .mockResolvedValueOnce(room('new-room'));
    const generateSeed = vi.fn(() => 'fresh-harbor-271');
    const navigate = vi.fn();
    const creator = createPostMatchRoomCreator({
      settings,
      createRoom,
      generateSeed,
      navigate,
      onPendingChange: vi.fn(),
      onError: vi.fn(),
    });

    await creator.rematchSameWorld();
    await creator.generateNewWorld();

    expect(createRoom).toHaveBeenNthCalledWith(1, settings);
    expect(createRoom).toHaveBeenNthCalledWith(2, {
      ...settings,
      seed: 'fresh-harbor-271',
    });
    expect(generateSeed).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenNthCalledWith(1, '/multiplayer/room/same-room');
    expect(navigate).toHaveBeenNthCalledWith(2, '/multiplayer/room/new-room');
    expect(settings).toEqual(original);
  });

  it('blocks duplicate creation and permits retry after a local failure', async () => {
    let rejectFirst!: (error: Error) => void;
    const firstAttempt = new Promise<Room>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const createRoom = vi
      .fn<(candidate: typeof settings) => Promise<Room>>()
      .mockReturnValueOnce(firstAttempt)
      .mockResolvedValueOnce(room('retry-room'));
    const navigate = vi.fn();
    const errors: Array<string | null> = [];
    const pending: boolean[] = [];
    const creator = createPostMatchRoomCreator({
      settings,
      createRoom,
      generateSeed: vi.fn(() => 'unused-seed'),
      navigate,
      onPendingChange: (value) => pending.push(value),
      onError: (message) => errors.push(message),
    });

    const originalAttempt = creator.rematchSameWorld();
    await creator.generateNewWorld();
    expect(createRoom).toHaveBeenCalledTimes(1);

    rejectFirst(new Error('sensitive Supabase detail'));
    await originalAttempt;
    expect(navigate).not.toHaveBeenCalled();
    expect(errors.at(-1)).toBe('Multiplayer request failed.');
    expect(pending).toEqual([true, false]);

    await creator.rematchSameWorld();
    expect(createRoom).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith('/multiplayer/room/retry-room');
  });
});
