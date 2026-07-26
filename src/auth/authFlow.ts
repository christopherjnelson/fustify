import type { EmailOtpType, SupabaseClient, User } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../multiplayer/database.types';
import {
  fetchOwnProfileForVerifiedUser,
  updateCurrentProfile,
} from './profileApi';
import { isGeneratedGuestDisplayName } from './guestName';
import {
  profileAvatarUrlSchema,
  profileDisplayNameSchema,
  type UserProfile,
} from './profileModel';
import { validatedReturnPath } from './returnPath';
import {
  ensureRegisteredSessionReady,
  invalidateRegisteredSessionPreparation,
} from './registeredSession';

const GUEST_UPGRADE_KEY = 'fustify.auth.guest-email-upgrade';
const DISCORD_AUTH_KEY = 'fustify.auth.discord';
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

const discordAuthIntentSchema = z.discriminatedUnion('intent', [
  z
    .object({
      intent: z.literal('discord-sign-in'),
      returnPath: z.string().transform(validatedReturnPath),
    })
    .strict(),
  z
    .object({
      intent: z.literal('discord-link'),
      expectedUserId: z.uuid(),
      returnPath: z.string().transform(validatedReturnPath),
    })
    .strict(),
  z
    .object({
      intent: z.literal('legacy-discord-upgrade'),
      expectedUserId: z.uuid(),
      returnPath: z.string().transform(validatedReturnPath),
    })
    .strict(),
]);

export type DiscordAuthIntent = z.infer<typeof discordAuthIntentSchema>;

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
      | 'discord_provider_unavailable'
      | 'oauth_cancelled'
      | 'oauth_callback_expired'
      | 'discord_identity_missing'
      | 'identity_conflict'
      | 'session_refresh_failed'
      | 'legacy_conversion_failed'
      | 'profile_unavailable'
      | 'original_browser_required'
      | 'recovery_session_required'
      | 'invalid_email_link'
      | 'expired_email_link'
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

function errorCode(error: unknown): string {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : '';
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

function isDiscordProviderUnavailable(error: unknown): boolean {
  return /provider.*(?:disabled|not enabled|unsupported)|discord.*(?:disabled|not enabled|unavailable)/iu.test(
    errorText(error),
  );
}

function isIdentityConflict(error: unknown): boolean {
  const message = errorText(error);
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : '';
  return (
    code === 'identity_already_exists' ||
    code === 'identity_already_linked' ||
    /identity.*already|already.*(?:linked|connected|associated)/iu.test(message)
  );
}

function discordAuthError(error: unknown): AuthFlowError {
  if (error instanceof AuthFlowError) return error;
  if (isDiscordProviderUnavailable(error)) {
    return new AuthFlowError(
      'discord_provider_unavailable',
      'Discord sign-in is temporarily unavailable. Please use email and password.',
    );
  }
  if (isIdentityConflict(error)) {
    return new AuthFlowError(
      'identity_conflict',
      'This Discord account is already connected to another Fustify account. Sign out before using Discord to access that account.',
    );
  }
  return authFlowError(error);
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
): Promise<{ confirmationRequired: boolean; email: string }> {
  const validated = validateRegistration(input);
  const { data, error } = await client.auth.signUp({
    email: validated.email,
    password: validated.password,
    options: {
      data: { display_name: validated.displayName },
      emailRedirectTo: callbackUrl('/auth/callback', input.returnPath),
    },
  });
  if (error) throw authFlowError(error);
  return {
    confirmationRequired: !data.session && !data.user?.email_confirmed_at,
    email: validated.email,
  };
}

export async function resendSignupVerification(
  client: SupabaseClient<Database>,
  input: { email: string; returnPath: string },
): Promise<void> {
  const email = validateEmail(input.email);
  const { error } = await client.auth.resend({
    type: 'signup',
    email,
    options: {
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

function writeDiscordAuthIntent(intent: DiscordAuthIntent): void {
  window.sessionStorage.setItem(DISCORD_AUTH_KEY, JSON.stringify(intent));
}

export function clearDiscordAuthIntent(): void {
  window.sessionStorage.removeItem(DISCORD_AUTH_KEY);
}

export function readDiscordAuthIntent(): DiscordAuthIntent | null {
  const stored = window.sessionStorage.getItem(DISCORD_AUTH_KEY);
  if (!stored) return null;
  try {
    return discordAuthIntentSchema.parse(JSON.parse(stored));
  } catch {
    clearDiscordAuthIntent();
    return null;
  }
}

export function hasDiscordIdentity(user: User): boolean {
  return (
    user.identities?.some((identity) => identity.provider === 'discord') ===
    true
  );
}

export function hasEmailIdentity(user: User): boolean {
  return (
    user.identities?.some((identity) => identity.provider === 'email') === true
  );
}

function discordCallbackUrl(): string {
  return new URL('/auth/callback', window.location.origin).toString();
}

export async function signInWithDiscord(
  client: SupabaseClient<Database>,
  returnPath: string,
): Promise<void> {
  clearGuestUpgradeIntent();
  clearDiscordAuthIntent();
  const intent = discordAuthIntentSchema.parse({
    intent: 'discord-sign-in',
    returnPath,
  });
  writeDiscordAuthIntent(intent);
  let error: unknown;
  try {
    ({ error } = await client.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: discordCallbackUrl() },
    }));
  } catch (requestError) {
    error = requestError;
  }
  if (!error) return;
  clearDiscordAuthIntent();
  throw discordAuthError(error);
}

export async function linkDiscordIdentity(
  client: SupabaseClient<Database>,
  input: {
    intent: 'discord-link' | 'legacy-discord-upgrade';
    expectedUserId: string;
    returnPath: string;
  },
): Promise<void> {
  clearGuestUpgradeIntent();
  clearDiscordAuthIntent();
  const verified = await client.auth.getUser();
  const user = verified.data.user;
  const expectsAnonymous = input.intent === 'legacy-discord-upgrade';
  if (
    verified.error ||
    !user ||
    user.id !== input.expectedUserId ||
    user.is_anonymous !== expectsAnonymous
  ) {
    throw new AuthFlowError(
      'identity_changed',
      'The current account identity could not be verified. Discord was not connected.',
    );
  }
  if (hasDiscordIdentity(user)) {
    throw new AuthFlowError(
      'identity_conflict',
      'Discord is already connected to this Fustify account.',
    );
  }

  const intent = discordAuthIntentSchema.parse(input);
  writeDiscordAuthIntent(intent);
  let error: unknown;
  try {
    ({ error } = await client.auth.linkIdentity({
      provider: 'discord',
      options: { redirectTo: discordCallbackUrl() },
    }));
  } catch (requestError) {
    error = requestError;
  }
  if (!error) return;
  clearDiscordAuthIntent();
  throw discordAuthError(error);
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
  clearDiscordAuthIntent();
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
  | {
      kind: 'discord-completion';
      user: User;
      intent: DiscordAuthIntent;
      profile: UserProfile;
    }
  | {
      kind: 'invitation';
      user: User;
      returnPath: string;
    }
  | { kind: 'confirmed'; user: User; returnPath: string };

export type SupportedTokenHashType = Extract<
  EmailOtpType,
  'signup' | 'recovery' | 'invite'
>;
const SUPPORTED_TOKEN_HASH_TYPES = [
  'signup',
  'recovery',
  'invite',
] as const satisfies readonly SupportedTokenHashType[];

function supportedTokenHashType(value: string): SupportedTokenHashType | null {
  return SUPPORTED_TOKEN_HASH_TYPES.find((type) => type === value) ?? null;
}

function callbackHashParameters(url: URL): URLSearchParams {
  return new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : '');
}

function callbackParameter(url: URL, key: string): string | null {
  return (
    url.searchParams.get(key) ?? callbackHashParameters(url).get(key) ?? null
  );
}

function hasTokenHashInput(url: URL): boolean {
  return url.searchParams.has('token_hash') || url.searchParams.has('type');
}

function assertSingleCallbackMechanism(url: URL): void {
  if (url.searchParams.has('code') && hasTokenHashInput(url)) {
    throw new AuthFlowError(
      'invalid_email_link',
      'This email link contains conflicting callback parameters.',
    );
  }
}

function callbackLinkError(
  error: unknown,
  label: 'email confirmation' | 'password reset' | 'invitation',
): AuthFlowError {
  if (errorCode(error) === 'otp_expired') {
    return new AuthFlowError(
      'expired_email_link',
      `This ${label} link has expired. Request a new link and try again.`,
    );
  }
  return new AuthFlowError(
    'invalid_email_link',
    `This ${label} link is invalid or has already been used.`,
  );
}

function callbackUrlError(
  url: URL,
  label: 'email confirmation' | 'password reset' | 'invitation',
): AuthFlowError | null {
  const error = callbackParameter(url, 'error');
  const description = callbackParameter(url, 'error_description');
  if (!error && !description) return null;
  return callbackLinkError(
    { code: callbackParameter(url, 'error_code') ?? error ?? '' },
    label,
  );
}

async function verifyTokenHash(
  client: SupabaseClient<Database>,
  url: URL,
  allowedTypes: readonly SupportedTokenHashType[],
): Promise<{ type: SupportedTokenHashType; user: User } | null> {
  const tokenHashes = url.searchParams.getAll('token_hash');
  const rawTypes = url.searchParams.getAll('type');
  if (tokenHashes.length === 0 && rawTypes.length === 0) return null;
  if (
    tokenHashes.length !== 1 ||
    rawTypes.length !== 1 ||
    tokenHashes[0].length === 0
  ) {
    throw callbackLinkError({}, 'email confirmation');
  }
  const type = supportedTokenHashType(rawTypes[0]);
  if (!type || !allowedTypes.includes(type)) {
    throw new AuthFlowError(
      'invalid_email_link',
      'This email link is not supported on this page.',
    );
  }
  const label =
    type === 'recovery'
      ? 'password reset'
      : type === 'invite'
        ? 'invitation'
        : 'email confirmation';
  const { data, error } = await client.auth.verifyOtp({
    token_hash: tokenHashes[0],
    type,
  });
  if (error || !data.user) throw callbackLinkError(error, label);
  return { type, user: data.user };
}

function callbackFailure(message: string): AuthFlowError {
  return new AuthFlowError('callback_failed', message);
}

function callbackDiscordError(
  url: URL,
  intent: DiscordAuthIntent,
): AuthFlowError {
  const errorCode = url.searchParams.get('error_code') ?? '';
  const description =
    url.searchParams.get('error_description') ??
    url.searchParams.get('error') ??
    '';
  if (isIdentityConflict({ code: errorCode, message: description })) {
    return discordAuthError({ code: errorCode, message: description });
  }
  if (
    errorCode === 'access_denied' ||
    /access_denied|cancelled|canceled|denied/iu.test(description)
  ) {
    return new AuthFlowError(
      'oauth_cancelled',
      'Discord authorization was cancelled. Your Fustify account was not changed.',
    );
  }
  if (isDiscordProviderUnavailable({ code: errorCode, message: description })) {
    return discordAuthError({ code: errorCode, message: description });
  }
  return new AuthFlowError(
    'callback_failed',
    intent.intent === 'discord-sign-in'
      ? 'Discord sign-in could not be completed. Please try again.'
      : 'Discord could not be connected. Your Fustify account was not changed.',
  );
}

function discordPresentationMetadata(user: User): Record<string, unknown>[] {
  const discordIdentity = user.identities?.find(
    (identity) => identity.provider === 'discord',
  );
  return [
    ...(discordIdentity?.identity_data ? [discordIdentity.identity_data] : []),
    user.user_metadata,
  ];
}

function discordMetadataDisplayName(user: User): string | null {
  for (const metadata of discordPresentationMetadata(user)) {
    for (const key of [
      'display_name',
      'global_name',
      'full_name',
      'name',
      'username',
      'user_name',
      'preferred_username',
    ]) {
      const value = metadata[key];
      if (typeof value !== 'string') continue;
      const parsed = profileDisplayNameSchema.safeParse(value);
      if (parsed.success) return parsed.data;
    }
  }
  return null;
}

function discordMetadataAvatarUrl(user: User): string | null {
  for (const metadata of discordPresentationMetadata(user)) {
    for (const key of ['avatar_url', 'picture']) {
      const value = metadata[key];
      if (typeof value !== 'string') continue;
      const parsed = profileAvatarUrlSchema.safeParse(value);
      if (parsed.success) return parsed.data;
    }
  }
  return null;
}

async function enrichLegacyDiscordProfile(
  client: SupabaseClient<Database>,
  user: User,
  profile: UserProfile,
): Promise<UserProfile> {
  const displayName = isGeneratedGuestDisplayName(profile.displayName)
    ? (discordMetadataDisplayName(user) ?? profile.displayName)
    : profile.displayName;
  const avatarUrl =
    profile.avatarUrl ?? discordMetadataAvatarUrl(user) ?? profile.avatarUrl;
  if (displayName === profile.displayName && avatarUrl === profile.avatarUrl) {
    return profile;
  }
  try {
    return await updateCurrentProfile(client, { displayName, avatarUrl });
  } catch {
    return profile;
  }
}

export async function completeAuthCallback(
  client: SupabaseClient<Database>,
  href: string,
): Promise<AuthCallbackResult> {
  const url = new URL(href);
  const storedDiscordIntent = readDiscordAuthIntent();
  const urlError = callbackUrlError(url, 'email confirmation');
  if (urlError) {
    if (storedDiscordIntent) {
      clearDiscordAuthIntent();
      throw callbackDiscordError(url, storedDiscordIntent);
    }
    throw urlError;
  }
  assertSingleCallbackMechanism(url);
  const tokenVerification = await verifyTokenHash(client, url, [
    'signup',
    'invite',
  ]);
  const discordIntent = tokenVerification ? null : storedDiscordIntent;
  const isGuestUpgradeCallback =
    url.searchParams.get('intent') === 'guest-email-upgrade';

  const code = url.searchParams.get('code');
  if (code) {
    let error: unknown;
    try {
      ({ error } = await client.auth.exchangeCodeForSession(code));
    } catch (requestError) {
      if (discordIntent) {
        clearDiscordAuthIntent();
        throw new AuthFlowError(
          'request_failed',
          'The Discord callback could not reach the account service. Check your connection and try again.',
        );
      }
      throw requestError;
    }
    if (error) {
      if (discordIntent) {
        clearDiscordAuthIntent();
        throw new AuthFlowError(
          'oauth_callback_expired',
          'The Discord callback is invalid or expired. Please start again.',
        );
      }
      throw isGuestUpgradeCallback
        ? new AuthFlowError(
            'original_browser_required',
            'Complete this upgrade in the original browser where the guest account was created.',
          )
        : callbackFailure('The email link is invalid or expired.');
    }
  }

  let verified: Awaited<ReturnType<typeof client.auth.getUser>>;
  try {
    verified = await client.auth.getUser();
  } catch (requestError) {
    if (discordIntent) {
      clearDiscordAuthIntent();
      throw new AuthFlowError(
        'request_failed',
        'The Discord account could not be verified. Check your connection and try again.',
      );
    }
    throw requestError;
  }
  const intent = tokenVerification ? null : readGuestUpgradeIntent();
  if (verified.error || !verified.data.user) {
    if (discordIntent) {
      clearDiscordAuthIntent();
      throw new AuthFlowError(
        'session_refresh_failed',
        'The Discord account session could not be verified. Please start again.',
      );
    }
    throw new AuthFlowError(
      intent ? 'original_browser_required' : 'callback_failed',
      intent
        ? 'Complete this upgrade in the original browser where the guest account was created.'
        : 'The confirmed account session is unavailable. Please sign in.',
    );
  }

  const user = verified.data.user;
  if (tokenVerification) {
    clearDiscordAuthIntent();
    clearGuestUpgradeIntent();
  }
  if (tokenVerification?.type === 'invite') {
    return {
      kind: 'invitation',
      user,
      returnPath: validatedReturnPath(url.searchParams.get('returnPath')),
    };
  }
  if (discordIntent) {
    if (
      'expectedUserId' in discordIntent &&
      user.id !== discordIntent.expectedUserId
    ) {
      clearDiscordAuthIntent();
      throw new AuthFlowError(
        'identity_changed',
        'The returned account did not match the current Fustify account. Discord was not connected.',
      );
    }
    if (!hasDiscordIdentity(user)) {
      clearDiscordAuthIntent();
      throw new AuthFlowError(
        'discord_identity_missing',
        'Discord did not finish connecting. Your Fustify account was not changed.',
      );
    }
    if (discordIntent.intent === 'discord-link' && !hasEmailIdentity(user)) {
      clearDiscordAuthIntent();
      throw new AuthFlowError(
        'identity_changed',
        'The original email sign-in identity is unavailable. Discord was not connected.',
      );
    }

    const prepared = await ensureRegisteredSessionReady(client, {
      forceRefresh: discordIntent.intent !== 'discord-sign-in',
      expectedUserId:
        'expectedUserId' in discordIntent
          ? discordIntent.expectedUserId
          : user.id,
    });
    if (
      prepared.status !== 'registered-ready' ||
      prepared.user.id !== user.id
    ) {
      clearDiscordAuthIntent();
      throw new AuthFlowError(
        discordIntent.intent === 'legacy-discord-upgrade'
          ? 'legacy_conversion_failed'
          : 'session_refresh_failed',
        discordIntent.intent === 'legacy-discord-upgrade'
          ? 'Discord connected, but the legacy account session is not permanent yet. Gameplay remains blocked; please try again.'
          : 'Discord connected, but the account session could not be refreshed. Please try again.',
      );
    }

    let profile: UserProfile;
    try {
      profile = await fetchOwnProfileForVerifiedUser(client, user.id);
    } catch {
      clearDiscordAuthIntent();
      throw new AuthFlowError(
        'profile_unavailable',
        'Discord connected, but your Fustify profile is temporarily unavailable. Please try again.',
      );
    }
    if (discordIntent.intent === 'legacy-discord-upgrade') {
      profile = await enrichLegacyDiscordProfile(
        client,
        prepared.user,
        profile,
      );
    }
    clearDiscordAuthIntent();
    return {
      kind: 'discord-completion',
      user: prepared.user,
      intent: discordIntent,
      profile,
    };
  }
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

  const prepared = await ensureRegisteredSessionReady(client, {
    forceRefresh: true,
    expectedUserId: input.expectedUserId,
  });
  if (
    prepared.status !== 'registered-ready' ||
    prepared.user.id !== input.expectedUserId
  ) {
    throw new AuthFlowError(
      prepared.status === 'error' && prepared.reason === 'identity-changed'
        ? 'identity_changed'
        : 'request_failed',
      prepared.status === 'error'
        ? prepared.message
        : 'Your account session could not be refreshed. Please try again.',
    );
  }

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
  const urlError = callbackUrlError(url, 'password reset');
  if (urlError) {
    clearRecoveryState();
    throw urlError;
  }
  let tokenVerification: Awaited<ReturnType<typeof verifyTokenHash>>;
  try {
    assertSingleCallbackMechanism(url);
    tokenVerification = await verifyTokenHash(client, url, ['recovery']);
  } catch (error) {
    clearRecoveryState();
    throw error;
  }
  if (tokenVerification) {
    window.sessionStorage.setItem(RECOVERY_SESSION_KEY, 'ready');
  }
  const code = url.searchParams.get('code');
  if (code && !tokenVerification) {
    clearRecoveryState();
    let exchange: Awaited<
      ReturnType<typeof client.auth.exchangeCodeForSession>
    >;
    try {
      exchange = await client.auth.exchangeCodeForSession(code);
    } catch (error) {
      throw callbackLinkError(error, 'password reset');
    }
    const { data, error } = exchange;
    if (error) {
      throw callbackLinkError(error, 'password reset');
    }
    const redirectType = (
      data as (typeof data & { redirectType?: string | null }) | null
    )?.redirectType;
    if (redirectType !== 'recovery') {
      clearRecoveryState();
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

export async function completeInvitationPassword(
  client: SupabaseClient<Database>,
  input: {
    expectedUserId: string;
    password: string;
    confirmation: string;
  },
): Promise<User> {
  const password = validatePasswordPair(input.password, input.confirmation);
  const before = await client.auth.getUser();
  if (
    before.error ||
    !before.data.user ||
    before.data.user.id !== input.expectedUserId ||
    before.data.user.is_anonymous !== false
  ) {
    throw new AuthFlowError(
      'recovery_session_required',
      'The invitation session is unavailable or expired.',
    );
  }
  const { error } = await client.auth.updateUser({ password });
  if (error) throw authFlowError(error);
  const prepared = await ensureRegisteredSessionReady(client, {
    forceRefresh: true,
    expectedUserId: input.expectedUserId,
  });
  if (
    prepared.status !== 'registered-ready' ||
    prepared.user.id !== input.expectedUserId
  ) {
    throw new AuthFlowError(
      'session_refresh_failed',
      'Your password was set, but the account session could not be refreshed. Please sign in.',
    );
  }
  return prepared.user;
}

export async function signOutRegisteredAccount(
  client: SupabaseClient<Database>,
): Promise<void> {
  clearDiscordAuthIntent();
  clearGuestUpgradeIntent();
  clearRecoveryState();
  invalidateRegisteredSessionPreparation(client);
  const { error } = await client.auth.signOut();
  if (error) throw authFlowError(error);
}
