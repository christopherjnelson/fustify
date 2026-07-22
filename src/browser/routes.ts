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
