import { z } from 'zod';
import type { AppAuthClient, AppUser } from './authClientTypes';
import { fetchOwnProfileForVerifiedUser } from './profileHttpApi';
import { profileDisplayNameSchema, type UserProfile } from './profileModel';

const emailSchema = z.string().trim().min(3).max(254).email();
const passwordSchema = z.string().min(8).max(1024);

export class AuthFlowError extends Error {
  constructor(
    public readonly code:
      | 'invalid_form'
      | 'invalid_credentials'
      | 'email_conflict'
      | 'account_required'
      | 'profile_unavailable'
      | 'username_unavailable'
      | 'request_failed',
    message: string,
  ) {
    super(message);
    this.name = 'AuthFlowError';
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String(error.message);
  }
  return '';
}

export function authFlowError(error: unknown): AuthFlowError {
  if (error instanceof AuthFlowError) return error;
  const text = errorText(error).toLowerCase();
  if (text.includes('username_unavailable')) {
    return new AuthFlowError(
      'username_unavailable',
      'That username is already taken.',
    );
  }
  if (text.includes('already') || text.includes('exist')) {
    return new AuthFlowError(
      'email_conflict',
      'An account already uses that email address.',
    );
  }
  if (text.includes('credential') || text.includes('password')) {
    return new AuthFlowError(
      'invalid_credentials',
      'The email or password is incorrect.',
    );
  }
  return new AuthFlowError(
    'request_failed',
    'The account request could not be completed. Please try again.',
  );
}

export async function registerWithEmail(
  client: AppAuthClient,
  input: {
    displayName: string;
    email: string;
    password: string;
    confirmPassword: string;
    returnPath?: string;
  },
): Promise<{ email: string; confirmationRequired: false }> {
  const displayName = profileDisplayNameSchema.safeParse(input.displayName);
  const email = emailSchema.safeParse(input.email);
  const password = passwordSchema.safeParse(input.password);
  if (!displayName.success || !email.success || !password.success) {
    throw new AuthFlowError(
      'invalid_form',
      'Enter a valid username, email, and password of at least 8 characters.',
    );
  }
  if (input.password !== input.confirmPassword) {
    throw new AuthFlowError('invalid_form', 'Passwords do not match.');
  }
  const result = await client.auth.signUp({
    email: email.data,
    password: password.data,
    options: { data: { display_name: displayName.data } },
  });
  if (result.error) throw authFlowError(result.error);
  if (!result.data.user || !result.data.session) {
    throw new AuthFlowError(
      'request_failed',
      'The account was created but no session was returned. Please sign in.',
    );
  }
  return { email: email.data, confirmationRequired: false };
}

export async function signInWithEmail(
  client: AppAuthClient,
  input: { email: string; password: string },
): Promise<{ user: AppUser; profile: UserProfile }> {
  const email = emailSchema.safeParse(input.email);
  const password = passwordSchema.safeParse(input.password);
  if (!email.success || !password.success) {
    throw new AuthFlowError(
      'invalid_credentials',
      'The email or password is incorrect.',
    );
  }
  const signedIn = await client.auth.signInWithPassword({
    email: email.data,
    password: password.data,
  });
  if (signedIn.error) throw authFlowError(signedIn.error);
  const verified = await client.auth.getUser();
  if (verified.error || !verified.data.user) {
    throw new AuthFlowError(
      'request_failed',
      'The signed-in account could not be verified.',
    );
  }
  try {
    const profile = await fetchOwnProfileForVerifiedUser(
      client,
      verified.data.user.id,
    );
    return { user: verified.data.user, profile };
  } catch {
    throw new AuthFlowError(
      'profile_unavailable',
      'Your player profile could not be loaded. Please try again.',
    );
  }
}

export async function signOutRegisteredAccount(
  client: AppAuthClient,
): Promise<void> {
  const result = await client.auth.signOut();
  if (result.error) throw authFlowError(result.error);
}
