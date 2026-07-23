import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TurnNotificationBanner } from '../components/TurnNotificationController';
import { presentTurnNotification } from './turnPresentation';
import {
  readTurnSoundPreference,
  TURN_SOUND_STORAGE_KEY,
  writeTurnSoundPreference,
} from './turnSoundPreference';

const notification = {
  playerId: 'human-a',
  playerName: 'Crimson League',
  turnNumber: 2,
};

describe('turn notification presentation', () => {
  it('always shows visually while respecting disabled or rejected sound', async () => {
    const show = vi.fn();
    const play = vi.fn();
    presentTurnNotification(notification, false, show, play);
    expect(show).toHaveBeenCalledWith(notification);
    expect(play).not.toHaveBeenCalled();

    const rejectedPlay = vi.fn(() => Promise.reject(new Error('blocked')));
    expect(() =>
      presentTurnNotification(notification, true, show, rejectedPlay),
    ).not.toThrow();
    await Promise.resolve();
    expect(show).toHaveBeenCalledTimes(2);
    expect(rejectedPlay).toHaveBeenCalledOnce();

    const markup = renderToStaticMarkup(
      createElement(TurnNotificationBanner, { notification }),
    );
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('Crimson League — your turn');
  });

  it('persists the preference and defaults safely when storage is unavailable', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(readTurnSoundPreference(storage)).toBe(true);
    writeTurnSoundPreference(false, storage);
    expect(values.get(TURN_SOUND_STORAGE_KEY)).toBe('false');
    expect(readTurnSoundPreference(storage)).toBe(false);

    const unavailable = {
      getItem: () => {
        throw new Error('storage unavailable');
      },
      setItem: () => {
        throw new Error('storage unavailable');
      },
    };
    expect(readTurnSoundPreference(unavailable)).toBe(true);
    expect(() => writeTurnSoundPreference(false, unavailable)).not.toThrow();
    expect(readTurnSoundPreference(unavailable)).toBe(false);
  });
});
