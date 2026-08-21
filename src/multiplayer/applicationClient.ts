export interface RealtimeSubscription {
  unsubscribe(): Promise<unknown> | unknown;
}

export interface ApplicationClient {
  removeChannel(channel: RealtimeSubscription): Promise<unknown>;
}
