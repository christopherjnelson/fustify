import { describe, expect, it } from 'vitest';
import { usernameSuggestions } from './profileApi.ts';

describe('profile API', () => {
  it('returns bounded deterministic username alternatives', () => {
    expect(usernameSuggestions('atlas')).toEqual([
      'atlas2',
      'atlas42',
      'atlasprime',
    ]);
    expect(
      usernameSuggestions('x'.repeat(40)).every((name) => name.length <= 40),
    ).toBe(true);
  });
});
