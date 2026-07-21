export function isAdminRoute(pathname: string): boolean {
  return pathname === '/admin' || pathname === '/admin/';
}
