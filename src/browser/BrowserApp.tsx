import { useCallback, useEffect, useState } from 'react';
import { AccountProvider } from '../auth/AccountProvider';
import { AccountRequiredGate } from '../auth/AccountControl';
import { hasLocalSetupParameters, isMultiplayerRoute } from './routes';
import { Home } from '../home/Home';
import { AdminAccessProvider } from '../admin/adminAccess';

const routeClasses = [
  'admin-route',
  'auth-route',
  'multiplayer-route',
  'multiplayer-match-route',
  'home-route',
  'game-route',
];

function currentLocation() {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  };
}

function navigate(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function BrowserApp() {
  const [location, setLocation] = useState(currentLocation);

  useEffect(() => {
    const update = () => setLocation(currentLocation());
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);

  const multiplayer = isMultiplayerRoute(location.pathname);
  const multiplayerMatch = location.pathname.startsWith('/multiplayer/match/');
  const legacyLocalSetup =
    location.pathname === '/' && hasLocalSetupParameters(location.search);
  const home = location.pathname === '/' && !legacyLocalSetup;

  useEffect(() => {
    document.documentElement.classList.remove(...routeClasses);
    document.documentElement.classList.add(
      multiplayer ? 'multiplayer-route' : home ? 'home-route' : 'game-route',
    );
    if (multiplayerMatch) {
      document.documentElement.classList.add('multiplayer-match-route');
    }
  }, [home, multiplayer, multiplayerMatch]);

  const loadMultiplayer = useCallback(async (account: { userId: string }) => {
    const { MultiplayerApp } = await import('../multiplayer/MultiplayerApp');
    return <MultiplayerApp userId={account.userId} />;
  }, []);

  const loadLocal = useCallback(async () => {
    const { App } = await import('../app/App');
    return <App />;
  }, []);

  const returnPath = `${location.pathname}${location.search}${location.hash}`;

  return (
    <AccountProvider>
      <AdminAccessProvider>
        {home ? (
          <Home onNavigate={navigate} />
        ) : (
          <AccountRequiredGate
            returnPath={returnPath}
            load={multiplayer ? loadMultiplayer : loadLocal}
          />
        )}
      </AdminAccessProvider>
    </AccountProvider>
  );
}
