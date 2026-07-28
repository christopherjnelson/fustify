import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../multiplayer/database.types';
import { profileApiError } from './profileApi';
import { parseUserProfile, type UserProfile } from './profileModel';

export type DiscordAvatarChoice = 'current' | 'discord' | 'custom' | 'none';

export async function completeDiscordProfile(
  client: SupabaseClient<Database>,
  input: {
    username: string;
    avatarChoice: DiscordAvatarChoice;
    customAvatarUrl?: string;
  },
): Promise<UserProfile> {
  const { data, error } = await client.functions.invoke(
    'complete-discord-profile',
    { body: input },
  );
  if (error) {
    let code = error.message;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const body = (await context.clone().json()) as { code?: unknown };
        if (typeof body.code === 'string') code = body.code;
      } catch {
        // Keep the sanitized function error path below.
      }
    }
    throw profileApiError(new Error(code));
  }
  try {
    return parseUserProfile((data as { profile?: unknown } | null)?.profile);
  } catch {
    throw profileApiError('invalid_profile_response');
  }
}
