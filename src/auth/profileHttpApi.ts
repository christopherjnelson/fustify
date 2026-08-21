import { z } from 'zod';
import {
  parseProfileUpdate,
  parseUserProfile,
  profileDisplayNameSchema,
  type ProfileUpdate,
  type UserProfile,
} from './profileModel';

const PROFILE_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  invalid_profile: 'Use a valid username and avatar URL.',
  invalid_profile_display_name:
    'Use a username between 1 and 40 characters without control characters.',
  not_authenticated: 'Your account session is unavailable.',
  profile_unavailable: 'Your profile is temporarily unavailable.',
  username_unavailable: 'That username is already taken.',
};

export function profileApiError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const code = Object.keys(PROFILE_ERROR_MESSAGES).find((candidate) =>
    message.includes(candidate),
  );
  return new Error(
    code ? PROFILE_ERROR_MESSAGES[code] : 'Profile request failed.',
  );
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const code =
      typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      typeof body.code === 'string'
        ? body.code
        : 'profile_request_failed';
    throw profileApiError(code);
  }
  return body;
}

export async function fetchOwnProfileForVerifiedUser(
  _client: unknown,
  userId: string,
): Promise<UserProfile> {
  const expected = z.uuid().parse(userId);
  const profile = parseUserProfile(await request('/api/profile'));
  if (profile.userId !== expected) throw profileApiError('profile_unavailable');
  return profile;
}

export async function fetchCurrentProfile(
  _client: unknown,
): Promise<UserProfile> {
  void _client;
  return parseUserProfile(await request('/api/profile'));
}

async function writeProfile(
  update: ProfileUpdate,
  complete: boolean,
): Promise<UserProfile> {
  const parsed = parseProfileUpdate(update);
  return parseUserProfile(
    await request('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ ...parsed, complete }),
    }),
  );
}

export async function updateCurrentProfile(
  _client: unknown,
  update: ProfileUpdate,
): Promise<UserProfile> {
  return writeProfile(update, false);
}

export async function completeCurrentProfile(
  _client: unknown,
  update: ProfileUpdate,
): Promise<UserProfile> {
  return writeProfile(update, true);
}

const usernameOptionsSchema = z.object({
  available: z.boolean(),
  suggestions: z.array(profileDisplayNameSchema).max(3),
});

export type UsernameOptions = z.infer<typeof usernameOptionsSchema>;

export async function fetchUsernameOptions(
  _client: unknown,
  candidate: string,
): Promise<UsernameOptions> {
  const normalized = profileDisplayNameSchema.parse(candidate);
  return usernameOptionsSchema.parse(
    await request(
      `/api/profile/username-options?candidate=${encodeURIComponent(normalized)}`,
    ),
  );
}
