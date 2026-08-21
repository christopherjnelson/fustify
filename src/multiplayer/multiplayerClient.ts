import type { ApplicationClient } from './applicationClient';

export type MultiplayerClient = ApplicationClient;

const httpClient = {
  async removeChannel(
    channel: import('./applicationClient').RealtimeSubscription,
  ) {
    await channel.unsubscribe();
  },
} satisfies MultiplayerClient;

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
