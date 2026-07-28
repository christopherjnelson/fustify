import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../multiplayer/database.types';
import {
  parseProfileUpdate,
  parseUserProfile,
  profileDisplayNameSchema,
  type ProfileUpdate,
  type UserProfile,
} from './profileModel';

const PROFILE_COLUMNS =
  'user_id, display_name, avatar_url, onboarding_completed, created_at, updated_at';

const PROFILE_ERROR_MESSAGES: Record<string, string> = {
  account_required: 'Create an account to customize your profile.',
  invalid_profile_avatar_url: 'Use a valid HTTPS avatar URL.',
  invalid_profile_display_name:
    'Use a username between 1 and 40 characters without control characters.',
  not_authenticated: 'Your account session is unavailable.',
  profile_unavailable: 'Your profile is temporarily unavailable.',
  username_unavailable: 'That username is already taken.',
};

const SANITIZED_PROFILE_ERRORS = new Set([
  ...Object.values(PROFILE_ERROR_MESSAGES),
  'Profile request failed.',
]);

async function runProfileRequest<T>(request: PromiseLike<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    throw profileApiError(error);
  }
}

export function profileApiError(error: unknown): Error {
  if (error instanceof Error && SANITIZED_PROFILE_ERRORS.has(error.message)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const knownKey = Object.keys(PROFILE_ERROR_MESSAGES).find((key) =>
    message.includes(key),
  );
  return new Error(
    knownKey ? PROFILE_ERROR_MESSAGES[knownKey] : 'Profile request failed.',
  );
}

function profileUpdateError(error: unknown): Error {
  if (!(error instanceof z.ZodError)) return profileApiError(error);
  const avatarIssue = error.issues.some((issue) =>
    issue.path.includes('avatarUrl'),
  );
  return new Error(
    avatarIssue
      ? PROFILE_ERROR_MESSAGES.invalid_profile_avatar_url
      : PROFILE_ERROR_MESSAGES.invalid_profile_display_name,
  );
}

function parseProfileResponse(value: unknown): UserProfile {
  try {
    return parseUserProfile(value);
  } catch {
    throw profileApiError('invalid_profile_response');
  }
}

export type ProfileLookup =
  { status: 'found'; profile: UserProfile } | { status: 'missing' };

export async function fetchProfileByUserId(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<ProfileLookup> {
  let validatedUserId: string;
  try {
    validatedUserId = z.uuid().parse(userId);
  } catch (error) {
    throw profileApiError(error);
  }
  const { data, error } = await runProfileRequest(
    client
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('user_id', validatedUserId)
      .maybeSingle(),
  );
  if (error) throw profileApiError(error);
  return data
    ? { status: 'found', profile: parseProfileResponse(data) }
    : { status: 'missing' };
}

export async function fetchProfilesByUserIds(
  client: SupabaseClient<Database>,
  userIds: readonly string[],
): Promise<UserProfile[]> {
  let uniqueUserIds: string[];
  try {
    uniqueUserIds = [
      ...new Set(userIds.map((userId) => z.uuid().parse(userId))),
    ];
  } catch (error) {
    throw profileApiError(error);
  }
  if (uniqueUserIds.length === 0) return [];

  const { data, error } = await runProfileRequest(
    client
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .in('user_id', uniqueUserIds),
  );
  if (error) throw profileApiError(error);
  return (data ?? []).map(parseProfileResponse);
}

export async function fetchOwnProfileForVerifiedUser(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<UserProfile> {
  const profile = await fetchProfileByUserId(client, userId);
  if (profile.status === 'found') return profile.profile;

  const { data, error } = await runProfileRequest(
    client.rpc('ensure_own_profile'),
  );
  if (error || !data) {
    throw profileApiError(error ?? 'profile_unavailable');
  }
  const ensuredProfile = parseProfileResponse(data);
  if (ensuredProfile.userId !== userId) {
    throw profileApiError('profile_unavailable');
  }
  return ensuredProfile;
}

export async function fetchCurrentProfile(
  client: SupabaseClient<Database>,
): Promise<UserProfile> {
  const { data, error } = await runProfileRequest(client.auth.getUser());
  if (error || !data.user) {
    throw profileApiError(error ?? 'not_authenticated');
  }
  return fetchOwnProfileForVerifiedUser(client, data.user.id);
}

export async function updateCurrentProfile(
  client: SupabaseClient<Database>,
  update: ProfileUpdate,
): Promise<UserProfile> {
  let parsedUpdate: ProfileUpdate;
  try {
    parsedUpdate = parseProfileUpdate(update);
  } catch (error) {
    throw profileUpdateError(error);
  }

  const { data, error } = await runProfileRequest(
    client.rpc('update_own_profile', {
      p_display_name: parsedUpdate.displayName,
      p_avatar_url: parsedUpdate.avatarUrl,
    }),
  );
  if (error || !data) {
    throw profileApiError(error ?? 'profile_unavailable');
  }
  return parseProfileResponse(data);
}

export async function completeCurrentProfile(
  client: SupabaseClient<Database>,
  update: ProfileUpdate,
): Promise<UserProfile> {
  let parsedUpdate: ProfileUpdate;
  try {
    parsedUpdate = parseProfileUpdate(update);
  } catch (error) {
    throw profileUpdateError(error);
  }

  const { data, error } = await runProfileRequest(
    client.rpc('complete_own_profile', {
      p_display_name: parsedUpdate.displayName,
      p_avatar_url: parsedUpdate.avatarUrl,
    }),
  );
  if (error || !data) {
    throw profileApiError(error ?? 'profile_unavailable');
  }
  return parseProfileResponse(data);
}

const usernameOptionsRowSchema = z.object({
  available: z.boolean(),
  suggestions: z.array(profileDisplayNameSchema).max(3),
});

export type UsernameOptions = z.infer<typeof usernameOptionsRowSchema>;

export async function fetchUsernameOptions(
  client: SupabaseClient<Database>,
  candidate: string,
): Promise<UsernameOptions> {
  let normalized: string;
  try {
    normalized = profileDisplayNameSchema.parse(candidate);
  } catch (error) {
    throw profileUpdateError(error);
  }
  const { data, error } = await runProfileRequest(
    client.rpc('username_options', { p_candidate: normalized }).single(),
  );
  if (error || !data) {
    throw profileApiError(error ?? 'profile_unavailable');
  }
  try {
    return usernameOptionsRowSchema.parse(data);
  } catch {
    throw profileApiError('invalid_profile_response');
  }
}
