import type { User } from '@supabase/supabase-js';
import {
  profileAvatarUrlSchema,
  profileDisplayNameSchema,
} from './profileModel';

function presentationMetadata(user: User): Record<string, unknown>[] {
  const discordIdentity = user.identities?.find(
    (identity) => identity.provider === 'discord',
  );
  return [
    ...(discordIdentity?.identity_data ? [discordIdentity.identity_data] : []),
    user.user_metadata,
  ];
}

export function stripDiscordDiscriminator(value: string): string {
  return value.replace(/#\d+$/u, '').trim();
}

export function discordProfileUsername(user: User): string | null {
  for (const metadata of presentationMetadata(user)) {
    for (const key of [
      'display_name',
      'global_name',
      'full_name',
      'username',
      'user_name',
      'preferred_username',
      'name',
    ]) {
      const value = metadata[key];
      if (typeof value !== 'string') continue;
      const parsed = profileDisplayNameSchema.safeParse(
        stripDiscordDiscriminator(value),
      );
      if (parsed.success) return parsed.data;
    }
  }
  return null;
}

export function discordProfileAvatarUrl(user: User): string | null {
  for (const metadata of presentationMetadata(user)) {
    for (const key of ['avatar_url', 'picture']) {
      const value = metadata[key];
      if (typeof value !== 'string') continue;
      const parsed = profileAvatarUrlSchema.safeParse(value);
      if (parsed.success) return parsed.data;
    }
  }
  return null;
}

export function discordIdentityAvatarUrl(user: User): string | null {
  const discordIdentity = user.identities?.find(
    (identity) => identity.provider === 'discord',
  );
  const metadata = discordIdentity?.identity_data;
  if (!metadata) return null;
  for (const key of ['avatar_url', 'picture']) {
    const value = metadata[key];
    if (typeof value !== 'string') continue;
    const parsed = profileAvatarUrlSchema.safeParse(value);
    if (parsed.success) return parsed.data;
  }
  return null;
}

export function discordIdentityEmail(user: User): string | null {
  const discordIdentity = user.identities?.find(
    (identity) => identity.provider === 'discord',
  );
  const email = discordIdentity?.identity_data?.email;
  return typeof email === 'string' && email.trim() ? email.trim() : null;
}
