import type { User } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  discordIdentityAvatarUrl,
  discordIdentityEmail,
  discordProfileAvatarUrl,
  discordProfileUsername,
  stripDiscordDiscriminator,
} from './discordProfileMetadata';

function discordUser(identityData: Record<string, unknown>): User {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    app_metadata: { provider: 'discord', providers: ['discord'] },
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-07-28T00:00:00.000Z',
    identities: [
      {
        id: 'discord-identity',
        user_id: '10000000-0000-4000-8000-000000000001',
        identity_data: identityData,
        provider: 'discord',
        created_at: '2026-07-28T00:00:00.000Z',
        updated_at: '2026-07-28T00:00:00.000Z',
        last_sign_in_at: '2026-07-28T00:00:00.000Z',
      },
    ],
  } as User;
}

describe('Discord profile metadata', () => {
  it('strips legacy and #0 numeric discriminators only at the end', () => {
    expect(stripDiscordDiscriminator('redwurm#0')).toBe('redwurm');
    expect(stripDiscordDiscriminator('redwurm#1234')).toBe('redwurm');
    expect(stripDiscordDiscriminator('red#team')).toBe('red#team');
  });

  it('prefers clean provider usernames before discriminator-bearing names', () => {
    const user = discordUser({
      full_name: 'Red Wurm',
      name: 'redwurm#0',
      username: 'redwurm',
    });
    expect(discordProfileUsername(user)).toBe('Red Wurm');
  });

  it('returns the provider avatar and email when available', () => {
    const user = discordUser({
      avatar_url: 'https://cdn.discordapp.com/avatars/1/avatar.png',
      email: 'discord@example.test',
    });
    expect(discordProfileAvatarUrl(user)).toBe(
      'https://cdn.discordapp.com/avatars/1/avatar.png',
    );
    expect(discordIdentityEmail(user)).toBe('discord@example.test');
  });

  it('only trusts Discord identity metadata for server-side avatar imports', () => {
    const user = discordUser({
      avatar_url: 'https://cdn.discordapp.com/avatars/1/avatar.png',
    });
    user.user_metadata.avatar_url = 'https://attacker.example/avatar.png';

    expect(discordIdentityAvatarUrl(user)).toBe(
      'https://cdn.discordapp.com/avatars/1/avatar.png',
    );
  });
});
