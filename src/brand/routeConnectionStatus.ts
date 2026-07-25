export const ROUTE_CONNECTION_EVENT = 'fustify:route-connection';
let currentConnection: string | null = null;

export function publishRouteConnection(status: string | null) {
  currentConnection = status;
  window.dispatchEvent(
    new CustomEvent<string | null>(ROUTE_CONNECTION_EVENT, { detail: status }),
  );
}

export function currentRouteConnection() {
  return currentConnection;
}

export function connectionStatusLabel(status: string) {
  if (status === 'SUBSCRIBED') return 'Live';
  if (status === 'CONNECTING') return 'Connecting…';
  if (status === 'CLOSED') return 'Offline';
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') return 'Error';
  return 'Reconnecting…';
}
