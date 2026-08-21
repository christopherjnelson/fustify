export function isMultiplayerRoute(pathname: string): boolean {
  return (
    pathname === '/multiplayer' ||
    pathname === '/multiplayer/' ||
    pathname.startsWith('/multiplayer/room/') ||
    pathname.startsWith('/multiplayer/match/')
  );
}

export function isAuthRoute(_pathname: string): boolean {
  void _pathname;
  return false;
}

const LOCAL_SETUP_QUERY_KEYS = [
  'v',
  'generator',
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
