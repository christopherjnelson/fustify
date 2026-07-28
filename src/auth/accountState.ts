import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
  User,
} from '@supabase/supabase-js';
import type { Database } from '../multiplayer/database.types';
import { fetchOwnProfileForVerifiedUser, profileApiError } from './profileApi';
import type { UserProfile } from './profileModel';
import {
  ensureRegisteredSessionReady,
  invalidateRegisteredSessionPreparation,
} from './registeredSession';

export interface RegisteredAccount {
  user: User;
  userId: string;
  email: string | null;
  profile: UserProfile;
}

export type ProtectedAccountState =
  | { status: 'checking' }
  | { status: 'signed-out' }
  | {
      status: 'legacy-anonymous';
      user: User;
      profile: UserProfile;
    }
  | {
      status: 'onboarding-required';
      account: RegisteredAccount;
    }
  | { status: 'registered-ready'; account: RegisteredAccount }
  | { status: 'error'; message: string };

export type AccountState = ProtectedAccountState;

const UNKNOWN_ACCOUNT_STATE_MESSAGE =
  'Your account state could not be verified. Please try again.';
export const PROFILE_UNAVAILABLE_MESSAGE =
  'Your player profile could not be loaded. Please try again.';
export const BACKEND_ACCOUNT_REQUIRED_MESSAGE =
  'The server no longer accepts this account session. Please retry verification.';

type Client = SupabaseClient<Database>;
type Listener = (state: ProtectedAccountState) => void;

function stateUserId(state: ProtectedAccountState): string | null {
  if (state.status === 'registered-ready') return state.account.userId;
  if (state.status === 'onboarding-required') return state.account.userId;
  if (state.status === 'legacy-anonymous') return state.user.id;
  return null;
}

function sameProfile(left: UserProfile, right: UserProfile): boolean {
  return (
    left.userId === right.userId &&
    left.displayName === right.displayName &&
    left.avatarUrl === right.avatarUrl &&
    left.onboardingCompleted === right.onboardingCompleted &&
    left.updatedAt === right.updatedAt
  );
}

export function safeProtectedAccountState(
  value: unknown,
): ProtectedAccountState {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('status' in value) ||
    typeof value.status !== 'string'
  ) {
    return { status: 'error', message: UNKNOWN_ACCOUNT_STATE_MESSAGE };
  }
  switch (value.status) {
    case 'checking':
    case 'signed-out':
      return value as ProtectedAccountState;
    case 'legacy-anonymous':
      return 'user' in value && 'profile' in value
        ? (value as ProtectedAccountState)
        : { status: 'error', message: UNKNOWN_ACCOUNT_STATE_MESSAGE };
    case 'registered-ready':
    case 'onboarding-required':
      return 'account' in value
        ? (value as ProtectedAccountState)
        : { status: 'error', message: UNKNOWN_ACCOUNT_STATE_MESSAGE };
    case 'error':
      return 'message' in value && typeof value.message === 'string'
        ? (value as ProtectedAccountState)
        : { status: 'error', message: UNKNOWN_ACCOUNT_STATE_MESSAGE };
    default:
      return { status: 'error', message: UNKNOWN_ACCOUNT_STATE_MESSAGE };
  }
}

async function loadProfile(
  client: Client,
  userId: string,
): Promise<UserProfile> {
  try {
    return await fetchOwnProfileForVerifiedUser(client, userId);
  } catch (error) {
    const safe = profileApiError(error);
    throw new Error(
      safe.message === 'Profile request failed.'
        ? PROFILE_UNAVAILABLE_MESSAGE
        : safe.message,
    );
  }
}

export async function deriveAccountState(
  client: Client,
  options: { forceRefresh?: boolean; expectedUserId?: string } = {},
): Promise<ProtectedAccountState> {
  const prepared = await ensureRegisteredSessionReady(client, options);
  if (prepared.status === 'signed-out') return { status: 'signed-out' };
  if (prepared.status === 'error') {
    return { status: 'error', message: prepared.message };
  }

  try {
    const profile = await loadProfile(client, prepared.user.id);
    if (prepared.status === 'legacy-anonymous') {
      return { status: 'legacy-anonymous', user: prepared.user, profile };
    }
    const account = {
      user: prepared.user,
      userId: prepared.user.id,
      email: prepared.user.email ?? null,
      profile,
    };
    return profile.onboardingCompleted
      ? { status: 'registered-ready', account }
      : { status: 'onboarding-required', account };
  } catch (profileError) {
    return {
      status: 'error',
      message:
        profileError instanceof Error
          ? profileError.message
          : PROFILE_UNAVAILABLE_MESSAGE,
    };
  }
}

export class AccountController {
  private state: ProtectedAccountState = { status: 'checking' };
  private readonly listeners = new Set<Listener>();
  private authSubscription: { unsubscribe: () => void } | null = null;
  private pending: Promise<ProtectedAccountState> | null = null;
  private verificationVersion = 0;

  constructor(readonly client: Client) {}

  getState(): ProtectedAccountState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  async retry(): Promise<ProtectedAccountState> {
    return this.verify({ preserveRegistered: false });
  }

  async requireRegisteredReady(): Promise<RegisteredAccount> {
    const verified = await this.verify({
      preserveRegistered: true,
      expectedUserId:
        this.state.status === 'registered-ready'
          ? this.state.account.userId
          : undefined,
    });
    if (verified.status === 'registered-ready') return verified.account;
    throw new Error(
      verified.status === 'error'
        ? verified.message
        : 'A registered account is required for multiplayer.',
    );
  }

  async handleBackendAccountRequired(): Promise<void> {
    const verified = await this.verify({
      preserveRegistered: true,
      expectedUserId:
        this.state.status === 'registered-ready'
          ? this.state.account.userId
          : undefined,
    });
    if (verified.status === 'registered-ready') {
      this.publish({
        status: 'error',
        message: BACKEND_ACCOUNT_REQUIRED_MESSAGE,
      });
    }
  }

  updateProfile(profile: UserProfile): void {
    if (this.state.status === 'registered-ready') {
      this.publish({
        status: 'registered-ready',
        account: { ...this.state.account, profile },
      });
    } else if (this.state.status === 'legacy-anonymous') {
      this.publish({ ...this.state, profile });
    } else if (this.state.status === 'onboarding-required') {
      this.publish(
        profile.onboardingCompleted
          ? {
              status: 'registered-ready',
              account: { ...this.state.account, profile },
            }
          : {
              status: 'onboarding-required',
              account: { ...this.state.account, profile },
            },
      );
    }
  }

  private publish(next: ProtectedAccountState): void {
    const safe = safeProtectedAccountState(next);
    if (
      this.state.status === 'registered-ready' &&
      safe.status === 'registered-ready' &&
      this.state.account.userId === safe.account.userId &&
      this.state.account.email === safe.account.email &&
      sameProfile(this.state.account.profile, safe.account.profile)
    ) {
      return;
    }
    if (
      this.state.status === 'onboarding-required' &&
      safe.status === 'onboarding-required' &&
      this.state.account.userId === safe.account.userId &&
      this.state.account.email === safe.account.email &&
      sameProfile(this.state.account.profile, safe.account.profile)
    ) {
      return;
    }
    if (
      this.state.status === 'legacy-anonymous' &&
      safe.status === 'legacy-anonymous' &&
      this.state.user.id === safe.user.id &&
      sameProfile(this.state.profile, safe.profile)
    ) {
      return;
    }
    this.state = safe;
    this.listeners.forEach((listener) => listener(this.state));
  }

  private start(): void {
    if (!this.authSubscription) {
      const { data } = this.client.auth.onAuthStateChange((event, session) =>
        this.handleAuthChange(event, session),
      );
      this.authSubscription = data.subscription;
    }
    void this.verify({
      preserveRegistered:
        this.state.status === 'registered-ready' ||
        this.state.status === 'onboarding-required',
    });
  }

  private stop(): void {
    this.authSubscription?.unsubscribe();
    this.authSubscription = null;
  }

  private handleAuthChange(
    event: AuthChangeEvent,
    session: Session | null,
  ): void {
    if (event === 'SIGNED_OUT') {
      invalidateRegisteredSessionPreparation(this.client);
      this.verificationVersion += 1;
      this.pending = null;
      this.publish({ status: 'signed-out' });
      return;
    }

    const currentUserId = stateUserId(this.state);
    const eventUserId = session?.user.id ?? null;
    if (
      event === 'INITIAL_SESSION' &&
      (this.pending || currentUserId === eventUserId)
    ) {
      return;
    }
    if (currentUserId && currentUserId !== eventUserId) {
      invalidateRegisteredSessionPreparation(this.client);
      this.verificationVersion += 1;
      this.pending = null;
    }
    void this.verify({
      preserveRegistered:
        (this.state.status === 'registered-ready' ||
          this.state.status === 'onboarding-required') &&
        currentUserId === eventUserId,
      expectedUserId:
        currentUserId === eventUserId
          ? (currentUserId ?? undefined)
          : undefined,
    });
  }

  private verify(options: {
    preserveRegistered: boolean;
    expectedUserId?: string;
  }): Promise<ProtectedAccountState> {
    if (this.pending) return this.pending;
    if (!options.preserveRegistered) this.publish({ status: 'checking' });

    const version = ++this.verificationVersion;
    const verification = deriveAccountState(this.client, {
      expectedUserId: options.expectedUserId,
    })
      .then((state) => {
        if (version === this.verificationVersion) this.publish(state);
        return state;
      })
      .catch(() => {
        const errorState: ProtectedAccountState = {
          status: 'error',
          message: UNKNOWN_ACCOUNT_STATE_MESSAGE,
        };
        if (version === this.verificationVersion) this.publish(errorState);
        return errorState;
      })
      .finally(() => {
        if (this.pending === verification) this.pending = null;
      });
    this.pending = verification;
    return verification;
  }
}

const controllers = new WeakMap<Client, AccountController>();

export function getAccountController(client: Client): AccountController {
  let controller = controllers.get(client);
  if (!controller) {
    controller = new AccountController(client);
    controllers.set(client, controller);
  }
  return controller;
}
