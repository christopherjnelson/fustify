import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export interface MultiplayerConfiguration {
  url: string;
  publishableKey: string;
}

let client: SupabaseClient<Database> | null = null;

declare global {
  interface Window {
    __FUSTIFY_AUTH_TEST_CLIENT__?: SupabaseClient<Database>;
  }
}

export function readMultiplayerConfiguration(): MultiplayerConfiguration | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && publishableKey ? { url, publishableKey } : null;
}

export function getSupabaseClient(): SupabaseClient<Database> {
  if (import.meta.env.DEV && window.__FUSTIFY_AUTH_TEST_CLIENT__) {
    return window.__FUSTIFY_AUTH_TEST_CLIENT__;
  }
  const configuration = readMultiplayerConfiguration();
  if (!configuration) {
    throw new Error('multiplayer_configuration_unavailable');
  }
  client ??= createClient<Database>(
    configuration.url,
    configuration.publishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    },
  );
  return client;
}
