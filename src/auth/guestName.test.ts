import { describe, expect, it } from 'vitest';
import { isGeneratedGuestDisplayName, profileInitials } from './guestName';

describe('generated guest display names', () => {
  it('recognizes the friendly server-generated format', () => {
    expect(isGeneratedGuestDisplayName('MistyBadger-482')).toBe(true);
    expect(isGeneratedGuestDisplayName('Guest 1234')).toBe(false);
    expect(isGeneratedGuestDisplayName('Misty-Badger-482')).toBe(false);
  });

  it('derives compact avatar initials without including the suffix', () => {
    expect(profileInitials('MistyBadger-482')).toBe('MB');
    expect(profileInitials('Player One')).toBe('PO');
  });
});
