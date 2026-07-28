import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Discord profile completion Edge Function security', () => {
  it('verifies the user and Discord identity before privileged storage access', async () => {
    const source = await readFile(
      'supabase/functions/complete-discord-profile/index.ts',
      'utf8',
    );
    expect(source).toContain('scoped.auth.getUser()');
    expect(source).toContain('user.is_anonymous !== false');
    expect(source).toContain('!hasDiscordIdentity(user)');
    expect(source).toContain('discordIdentityAvatarUrl(user)');
    expect(source).toContain('`${user.id}/avatar.${imported.extension}`');
    expect(source).toContain('downloadDiscordAvatar(discordUrl, fetch)');
    expect(source).not.toMatch(
      /downloadDiscordAvatar\(\s*(?:body|request|customAvatarUrl)/u,
    );
  });

  it('completes the profile through the caller-scoped RPC', async () => {
    const source = await readFile(
      'supabase/functions/complete-discord-profile/index.ts',
      'utf8',
    );
    expect(source).toContain("scoped.rpc('complete_own_profile'");
    expect(source).not.toContain("admin.rpc('complete_own_profile'");
  });

  it('uses service authority only for a fixed-path copy and falls back to the trusted CDN URL', async () => {
    const source = await readFile(
      'supabase/functions/complete-discord-profile/index.ts',
      'utf8',
    );
    expect(source).toContain("admin.storage\n        .from('profile-avatars')");
    expect(source).toContain('if (!upload.error)');
    expect(source).toContain('avatarUrl = discordUrl;');
    expect(source).toContain("if (avatarChoice === 'custom')");
    expect(source).not.toMatch(
      /downloadDiscordAvatar\(\s*(?:custom|body\.customAvatarUrl)/u,
    );
  });
});
