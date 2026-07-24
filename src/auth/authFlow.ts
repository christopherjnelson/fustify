import type { SupabaseClient, User } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../multiplayer/database.types';
import {
  fetchOwnProfileForVerifiedUser,
  updateCurrentProfile,
} from './profileApi';
import { profileDisplayNameSchema, type UserProfile } from './profileModel';
import { validatedReturnPath } from './returnPath';

const GUEST_UPGRADE_KEY = 'fustify.auth.guest-email-upgrade';
const RECOVERY_SESSION_KEY = 'fustify.auth.password-recovery';
const PASSWORD_MINIMUM = 8;

function containsAsciiControl(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email()
  .refine((email) => !containsAsciiControl(email) && !/\s/u.test(email));

const passwordSchema = z.string().min(PASSWORD_MINIMUM).max(1024);

const guestUpgradeIntentSchema = z
  .object({
    intent: z.literal('guest-email-upgrade'),
    expectedUserId: z.uuid(),
    returnPath: z.string().transform(validatedReturnPath),
  })
  .strict();

export type GuestUpgradeIntent = z.infer<typeof guestUpgradeIntentSchema>;

export class AuthFlowError extends Error {
  constructor(
    public readonly code:
      | 'invalid_form'
      | 'invalid_credentials'
      | 'email_not_confirmed'
      | 'email_conflict'
      | 'account_required'
      | 'callback_failed'
      | 'identity_changed'
      | 'original_browser_required'
      | 'recovery_session_required'
      | 'request_failed',
    message: string,
  ) {
    super(message);
    this.name = 'AuthFlowError';
  }
}

function callbackUrl(
  path: string,
  returnPath: string,
  intent?: 'guest-email-upgrade',
): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set('returnPath', validatedReturnPath(returnPath));
  if (intent) url.searchParams.set('intent', intent);
  return url.toString();
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return '';
}

function isEmailConflict(error: unknown): boolean {
  const message = errorText(error);
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : '';
  return (
    code === 'email_exists' ||
    /already (?:been )?(?:registered|associated|exists)|email.*(?:taken|exists)/iu.test(
      message,
    )
  );
}

function isRateLimit(error: unknown): boolean {
  const message = errorText(error);
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? error.status
      : undefined;
  return status === 429 || /rate limit|too many requests/iu.test(message);
}

export function authFlowError(error: unknown): AuthFlowError {
  if (error instanceof AuthFlowError) return error;
  return new AuthFlowError(
    'request_failed',
    isRateLimit(error)
      ? 'Too many requests. Please wait a little while and try again.'
      : 'The account request could not be completed. Please try again.',
  );
}

export function validateEmail(value: string): string {
  try {
    return emailSchema.parse(value);
  } catch {
    throw new AuthFlowError('invalid_form', 'Enter a valid email address.');
  }
}

export function validatePasswordPair(
  password: string,
  confirmation: string,
): string {
  if (password !== confirmation) {
    throw new AuthFlowError('invalid_form', 'The passwords do not match.');
  }
  try {
    return passwordSchema.parse(password);
  } catch {
    throw new AuthFlowError(
      'invalid_form',
      `Use a password with at least ${PASSWORD_MINIMUM} characters.`,
    );
  }
}

export function validateRegistration(input: {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}) {
  let displayName: string;
  try {
    displayName = profileDisplayNameSchema.parse(input.displayName);
  } catch {
    throw new AuthFlowError(
      'invalid_form',
      'Use a display name between 1 and 40 characters.',
    );
  }
  return {
    displayName,
    email: validateEmail(input.email),
    password: validatePasswordPair(input.password, input.confirmPassword),
  };
}

export async function registerWithEmail(
  client: SupabaseClient<Database>,
  input: {
    displayName: string;
    email: string;
    password: string;
    confirmPassword: string;
    returnPath: string;
  },
): Promise<void> {
  const validated = validateRegistration(input);
  const { error } = await client.auth.signUp({
    email: validated.email,
    password: validated.password,
    options: {
      data: { display_name: validated.displayName },
      emailRedirectTo: callbackUrl('/auth/callback', input.returnPath),
    },
  });
  if (error) throw authFlowError(error);
}

export async function signInWithEmail(
  client: SupabaseClient<Database>,
  input: { email: string; password: string },
): Promise<{ user: User; profile: UserProfile }> {
  const email = validateEmail(input.email);
  if (input.password.length === 0) {
    throw new AuthFlowError('invalid_form', 'Enter your password.');
  }
  const { error } = await client.auth.signInWithPassword({
    email,
    password: input.password,
  });
  if (error) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : '';
    if (
      code === 'email_not_confirmed' ||
      /email(?: address)? not confirmed/iu.test(errorText(error))
    ) {
      throw new AuthFlowError(
        'email_not_confirmed',
        'Confirm your email address before signing in.',
      );
    }
    throw new AuthFlowError(
      'invalid_credentials',
      'The email or password is incorrect.',
    );
  }
  const verified = await client.auth.getUser();
  if (verified.error || !verified.data.user) {
    throw authFlowError(verified.error);
  }
  const profile = await fetchOwnProfileForVerifiedUser(
    client,
    verified.data.user.id,
  );
  return { user: verified.data.user, profile };
}

function writeGuestUpgradeIntent(intent: GuestUpgradeIntent): void {
  window.sessionStorage.setItem(GUEST_UPGRADE_KEY, JSON.stringify(intent));
}

export function clearGuestUpgradeIntent(): void {
  window.sessionStorage.removeItem(GUEST_UPGRADE_KEY);
}

export function readGuestUpgradeIntent(): GuestUpgradeIntent | null {
  const stored = window.sessionStorage.getItem(GUEST_UPGRADE_KEY);
  if (!stored) return null;
  try {
    return guestUpgradeIntentSchema.parse(JSON.parse(stored));
  } catch {
    clearGuestUpgradeIntent();
    return null;
  }
}

export async function initiateGuestEmailUpgrade(
  client: SupabaseClient<Database>,
  input: { email: string; expectedUserId: string; returnPath: string },
): Promise<void> {
  const email = validateEmail(input.email);
  const verified = await client.auth.getUser();
  if (
    verified.error ||
    !verified.data.user ||
    verified.data.user.id !== input.expectedUserId ||
    verified.data.user.is_anonymous !== true
  ) {
    throw new AuthFlowError(
      'account_required',
      'The guest session is no longer available.',
    );
  }
  const intent = guestUpgradeIntentSchema.parse({
    intent: 'guest-email-upgrade',
    expectedUserId: input.expectedUserId,
    returnPath: input.returnPath,
  });
  writeGuestUpgradeIntent(intent);

  const { error } = await client.auth.updateUser(
    { email },
    {
      emailRedirectTo: callbackUrl(
        '/auth/callback',
        intent.returnPath,
        'guest-email-upgrade',
      ),
    },
  );
  if (!error) return;

  clearGuestUpgradeIntent();
  if (isEmailConflict(error)) {
    throw new AuthFlowError(
      'email_conflict',
      'That email is already associated with an existing Fustify account.',
    );
  }
  throw authFlowError(error);
}

export type AuthCallbackResult =
  | {
      kind: 'guest-upgrade-completion';
      user: User;
      intent: GuestUpgradeIntent;
    }
  | { kind: 'confirmed'; user: User; returnPath: string };

function callbackFailure(message: string): AuthFlowError {
  return new AuthFlowError('callback_failed', message);
}

export async function completeAuthCallback(
  client: SupabaseClient<Database>,
  href: string,
): Promise<AuthCallbackResult> {
  const url = new URL(href);
  const isGuestUpgradeCallback =
    url.searchParams.get('intent') === 'guest-email-upgrade';
  const callbackError =
    url.searchParams.get('error_description') ?? url.searchParams.get('error');
  if (callbackError) {
    throw callbackFailure(
      'The email link could not be confirmed. Request a new link and try again.',
    );
  }

  const code = url.searchParams.get('code');
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      throw isGuestUpgradeCallback
        ? new AuthFlowError(
            'original_browser_required',
            'Complete this upgrade in the original browser where the guest account was created.',
          )
        : callbackFailure('The email link is invalid or expired.');
    }
  }

  const verified = await client.auth.getUser();
  const intent = readGuestUpgradeIntent();
  if (verified.error || !verified.data.user) {
    throw new AuthFlowError(
      intent ? 'original_browser_required' : 'callback_failed',
      intent
        ? 'Complete this upgrade in the original browser where the guest account was created.'
        : 'The confirmed account session is unavailable. Please sign in.',
    );
  }

  const user = verified.data.user;
  if (isGuestUpgradeCallback && !intent) {
    throw new AuthFlowError(
      'original_browser_required',
      'Complete this upgrade in the original browser where the guest account was created.',
    );
  }
  if (intent) {
    if (user.id !== intent.expectedUserId) {
      throw new AuthFlowError(
        'identity_changed',
        'The returned account did not match this guest identity. No guest data was upgraded.',
      );
    }
    if (!user.email_confirmed_at || user.is_anonymous !== false) {
      throw callbackFailure(
        'The email address has not finished verification. Open the newest link in the original browser.',
      );
    }
    return { kind: 'guest-upgrade-completion', user, intent };
  }

  return {
    kind: 'confirmed',
    user,
    returnPath: validatedReturnPath(url.searchParams.get('returnPath')),
  };
}

export async function completeGuestUpgrade(
  client: SupabaseClient<Database>,
  input: {
    expectedUserId: string;
    displayName: string;
    password: string;
    confirmPassword: string;
  },
): Promise<UserProfile> {
  let displayName: string;
  try {
    displayName = profileDisplayNameSchema.parse(input.displayName);
  } catch {
    throw new AuthFlowError(
      'invalid_form',
      'Use a display name between 1 and 40 characters.',
    );
  }
  const password = validatePasswordPair(input.password, input.confirmPassword);
  const before = await client.auth.getUser();
  if (
    before.error ||
    !before.data.user ||
    before.data.user.id !== input.expectedUserId ||
    before.data.user.is_anonymous !== false
  ) {
    throw new AuthFlowError(
      'identity_changed',
      'The account identity changed. No profile changes were applied.',
    );
  }

  const passwordUpdate = await client.auth.updateUser({ password });
  if (passwordUpdate.error) throw authFlowError(passwordUpdate.error);

  const profile = await updateCurrentProfile(client, {
    displayName,
    avatarUrl: null,
  });
  const after = await client.auth.getUser();
  if (
    after.error ||
    !after.data.user ||
    after.data.user.id !== input.expectedUserId
  ) {
    throw new AuthFlowError(
      'identity_changed',
      'The account identity changed unexpectedly. Please contact support.',
    );
  }
  clearGuestUpgradeIntent();
  return profile;
}

export async function requestPasswordRecovery(
  client: SupabaseClient<Database>,
  input: { email: string; returnPath: string },
): Promise<'sent' | 'rate-limited'> {
  const email = validateEmail(input.email);
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl('/auth/reset-password', input.returnPath),
  });
  if (!error) return 'sent';
  if (isRateLimit(error)) return 'rate-limited';
  throw authFlowError(error);
}

export function clearRecoveryState(): void {
  window.sessionStorage.removeItem(RECOVERY_SESSION_KEY);
}

export async function establishRecoverySession(
  client: SupabaseClient<Database>,
  href: string,
): Promise<User> {
  const url = new URL(href);
  const code = url.searchParams.get('code');
  if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      throw new AuthFlowError(
        'recovery_session_required',
        'This password-reset link is invalid or expired.',
      );
    }
    const redirectType = (
      data as (typeof data & { redirectType?: string | null }) | null
    )?.redirectType;
    if (redirectType !== 'recovery') {
      throw new AuthFlowError(
        'recovery_session_required',
        'This link is not a password-reset link.',
      );
    }
    window.sessionStorage.setItem(RECOVERY_SESSION_KEY, 'ready');
  }
  if (window.sessionStorage.getItem(RECOVERY_SESSION_KEY) !== 'ready') {
    throw new AuthFlowError(
      'recovery_session_required',
      'Request a password-reset email before visiting this page.',
    );
  }
  const verified = await client.auth.getUser();
  if (verified.error || !verified.data.user) {
    clearRecoveryState();
    throw new AuthFlowError(
      'recovery_session_required',
      'The password-reset session is unavailable or expired.',
    );
  }
  return verified.data.user;
}

export async function completePasswordRecovery(
  client: SupabaseClient<Database>,
  password: string,
  confirmation: string,
): Promise<void> {
  if (window.sessionStorage.getItem(RECOVERY_SESSION_KEY) !== 'ready') {
    throw new AuthFlowError(
      'recovery_session_required',
      'The password-reset session is unavailable or expired.',
    );
  }
  const validatedPassword = validatePasswordPair(password, confirmation);
  const { error } = await client.auth.updateUser({
    password: validatedPassword,
  });
  if (error) throw authFlowError(error);
  clearRecoveryState();
}

export async function signOutRegisteredAccount(
  client: SupabaseClient<Database>,
): Promise<void> {
  clearGuestUpgradeIntent();
  clearRecoveryState();
  const { error } = await client.auth.signOut();
  if (error) throw authFlowError(error);
}
