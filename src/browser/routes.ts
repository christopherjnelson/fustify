export function isAdminRoute(pathname: string): boolean {
  return pathname === '/admin' || pathname === '/admin/';
}

export function isMultiplayerRoute(pathname: string): boolean {
  return (
    pathname === '/multiplayer' ||
    pathname === '/multiplayer/' ||
    pathname.startsWith('/multiplayer/room/') ||
    pathname.startsWith('/multiplayer/match/')
  );
}

export function isAuthRoute(pathname: string): boolean {
  return (
    pathname === '/auth/callback' ||
    pathname === '/auth/callback/' ||
    pathname === '/auth/reset-password' ||
    pathname === '/auth/reset-password/'
  );
}

const LOCAL_SETUP_QUERY_KEYS = [
  'v',
  'seed',
  'territories',
  'continents',
  'players',
  'assignment',
] as const;

export function hasLocalSetupParameters(search: string): boolean {
  const params = new URLSearchParams(search);
  return LOCAL_SETUP_QUERY_KEYS.some((key) => params.has(key));
}
