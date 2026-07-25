export type RouteContext = {
  backHref: string;
  backLabel: string;
  eyebrow: string;
  title: string;
  immersive: boolean;
};

export function protectedRouteContext(pathname: string): RouteContext {
  if (pathname.startsWith('/multiplayer/match/')) {
    return {
      backHref: '/multiplayer',
      backLabel: 'Multiplayer',
      eyebrow: 'Authoritative match',
      title: 'Match',
      immersive: true,
    };
  }
  if (pathname.startsWith('/multiplayer/room/')) {
    return {
      backHref: '/multiplayer',
      backLabel: 'Multiplayer',
      eyebrow: 'Private room',
      title: 'Lobby',
      immersive: false,
    };
  }
  if (pathname.startsWith('/multiplayer')) {
    return {
      backHref: '/',
      backLabel: 'Home',
      eyebrow: 'Online play',
      title: 'Multiplayer',
      immersive: false,
    };
  }
  return {
    backHref: '/',
    backLabel: 'Home',
    eyebrow: 'On this device',
    title: 'Local game',
    immersive: true,
  };
}
