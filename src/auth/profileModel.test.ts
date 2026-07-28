import { describe, expect, it } from 'vitest';
import {
  parseProfileUpdate,
  parseUserProfile,
  profileAvatarUrlSchema,
  profileDisplayNameSchema,
} from './profileModel';

const profileRow = {
  user_id: '10000000-0000-4000-8000-000000000001',
  display_name: 'Guest 1000',
  avatar_url: null,
  onboarding_completed: true,
  created_at: '2026-07-24T06:00:00.000Z',
  updated_at: '2026-07-24T06:00:00.000Z',
};

describe('profile model', () => {
  it('parses a trusted profile row into the frontend naming convention', () => {
    expect(parseUserProfile(profileRow)).toEqual({
      userId: profileRow.user_id,
      displayName: 'Guest 1000',
      avatarUrl: null,
      onboardingCompleted: true,
      createdAt: profileRow.created_at,
      updatedAt: profileRow.updated_at,
    });
  });

  it('rejects malformed or unexpectedly shaped database JSON', () => {
    expect(() =>
      parseUserProfile({ ...profileRow, user_id: 'not-a-uuid' }),
    ).toThrow();
    expect(() => parseUserProfile({ ...profileRow, is_admin: true })).toThrow();
  });

  it('trims ordinary Unicode display names and rejects unsafe names', () => {
    expect(profileDisplayNameSchema.parse('  Renée 星  ')).toBe('Renée 星');
    expect(() => profileDisplayNameSchema.parse('   ')).toThrow();
    expect(() => profileDisplayNameSchema.parse('x'.repeat(41))).toThrow();
    expect(() => profileDisplayNameSchema.parse('Bad\nName')).toThrow();
  });

  it('accepts nullable HTTPS avatars and rejects unsafe URLs', () => {
    expect(profileAvatarUrlSchema.parse(null)).toBeNull();
    expect(
      profileAvatarUrlSchema.parse('  https://cdn.example.com/a.png  '),
    ).toBe('https://cdn.example.com/a.png');
    expect(() =>
      profileAvatarUrlSchema.parse('http://example.com/a'),
    ).toThrow();
    expect(() =>
      profileAvatarUrlSchema.parse(
        'https://user:password@example.com/avatar.png',
      ),
    ).toThrow();
    expect(() =>
      profileAvatarUrlSchema.parse(`https://example.com/${'x'.repeat(2049)}`),
    ).toThrow();
  });

  it('normalizes profile updates without introducing authorization fields', () => {
    expect(
      parseProfileUpdate({
        displayName: '  Player One  ',
        avatarUrl: null,
      }),
    ).toEqual({ displayName: 'Player One', avatarUrl: null });
  });
});
