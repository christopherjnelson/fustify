import { describe, expect, it } from 'vitest';
import { hasLocalSetupParameters, isMultiplayerRoute } from './routes';

describe('multiplayer routes', () => {
  it('recognizes only the multiplayer entry, room, and match paths', () => {
    expect(isMultiplayerRoute('/multiplayer')).toBe(true);
    expect(isMultiplayerRoute('/multiplayer/room/room-id')).toBe(true);
    expect(isMultiplayerRoute('/multiplayer/match/match-id')).toBe(true);
    expect(isMultiplayerRoute('/')).toBe(false);
    expect(isMultiplayerRoute('/multiplayerish')).toBe(false);
  });
});

describe('legacy local setup URLs', () => {
  it('recognizes every supported setup key without treating arbitrary queries as local', () => {
    for (const key of [
      'v',
      'generator',
      'seed',
      'territories',
      'continents',
      'players',
      'assignment',
    ]) {
      expect(hasLocalSetupParameters(`?${key}=value`)).toBe(true);
    }
    expect(hasLocalSetupParameters('')).toBe(false);
    expect(hasLocalSetupParameters('?campaign=summer')).toBe(false);
  });
});
