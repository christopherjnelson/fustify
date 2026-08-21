import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type MultiplayerClient = SupabaseClient<Database>;

const httpClient = {
  transport: 'fustify-http',
} as unknown as MultiplayerClient;

declare global {
  interface Window {
    __FUSTIFY_AUTH_TEST_CLIENT__?: MultiplayerClient;
  }
}

export function getMultiplayerClient(): MultiplayerClient {
  if (import.meta.env.DEV && window.__FUSTIFY_AUTH_TEST_CLIENT__) {
    return window.__FUSTIFY_AUTH_TEST_CLIENT__;
  }
  return httpClient;
}

export function isHttpMultiplayerClient(client: MultiplayerClient): boolean {
  return (
    (client as unknown as { transport?: string }).transport === 'fustify-http'
  );
}
