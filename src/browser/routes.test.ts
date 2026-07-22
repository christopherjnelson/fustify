import { describe, expect, it } from 'vitest';
import { isAdminRoute, isMultiplayerRoute } from './routes';

describe('application routes', () => {
  it('recognizes only the admin pathname as the admin application', () => {
    expect(isAdminRoute('/admin')).toBe(true);
    expect(isAdminRoute('/admin/')).toBe(true);
    expect(isAdminRoute('/')).toBe(false);
    expect(isAdminRoute('/game')).toBe(false);
  });
});

describe('multiplayer routes', () => {
  it('recognizes only the multiplayer entry, room, and match paths', () => {
    expect(isMultiplayerRoute('/multiplayer')).toBe(true);
    expect(isMultiplayerRoute('/multiplayer/room/room-id')).toBe(true);
    expect(isMultiplayerRoute('/multiplayer/match/match-id')).toBe(true);
    expect(isMultiplayerRoute('/')).toBe(false);
    expect(isMultiplayerRoute('/admin')).toBe(false);
    expect(isMultiplayerRoute('/multiplayerish')).toBe(false);
  });
});
