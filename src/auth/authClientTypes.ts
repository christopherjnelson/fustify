export interface AppUser {
  id: string;
  email?: string;
  user_metadata: {
    display_name?: string;
    avatar_url?: string | null;
  };
  created_at: string;
  updated_at: string;
  is_anonymous: false;
}

export interface AppSession {
  access_token: string;
  expires_at: number;
  user: AppUser;
}

export type AuthChangeEvent =
  'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED';

export interface AuthResult<T> {
  data: T;
  error: Error | null;
}

export interface AppAuthClient {
  auth: {
    signUp(input: {
      email: string;
      password: string;
      options?: { data?: { display_name?: string } };
    }): Promise<
      AuthResult<{ user: AppUser | null; session: AppSession | null }>
    >;
    signInWithPassword(input: {
      email: string;
      password: string;
    }): Promise<AuthResult<unknown>>;
    signOut(): Promise<{ error: Error | null }>;
    getSession(): Promise<AuthResult<{ session: AppSession | null }>>;
    getUser(
      accessToken?: string,
    ): Promise<AuthResult<{ user: AppUser | null }>>;
    getClaims(
      accessToken?: string,
    ): Promise<
      AuthResult<{ claims: { sub: string; is_anonymous: false } } | null>
    >;
    refreshSession(): Promise<
      AuthResult<{ session: AppSession | null; user: AppUser | null }>
    >;
    onAuthStateChange(
      callback: (event: AuthChangeEvent, session: AppSession | null) => void,
    ): { data: { subscription: { unsubscribe(): void } } };
  };
}
