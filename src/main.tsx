import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import {
  hasLocalSetupParameters,
  isAuthRoute,
  isMultiplayerRoute,
} from './browser/routes';

const isAuth = isAuthRoute(window.location.pathname);
const isMultiplayer = isMultiplayerRoute(window.location.pathname);
const isLegacyLocalSetup =
  window.location.pathname === '/' &&
  (hasLocalSetupParameters(window.location.search) ||
    (import.meta.env.DEV &&
      new URLSearchParams(window.location.search).get('visual-review') ===
        '1'));
const isHome = window.location.pathname === '/' && !isLegacyLocalSetup;
const isMultiplayerMatch = window.location.pathname.startsWith(
  '/multiplayer/match/',
);
document.documentElement.classList.add(
  isAuth
    ? 'auth-route'
    : isMultiplayer
      ? 'multiplayer-route'
      : isHome
        ? 'home-route'
        : 'game-route',
);
if (isMultiplayerMatch) {
  document.documentElement.classList.add('multiplayer-match-route');
}

async function bootstrap() {
  const root = createRoot(document.getElementById('root')!);
  if (
    import.meta.env.DEV &&
    isMultiplayer &&
    isMultiplayerMatch &&
    new URLSearchParams(window.location.search).get('visual-review') === '1'
  ) {
    const { MultiplayerVisualApp } =
      await import('./testSupport/MultiplayerVisualApp');
    root.render(
      <StrictMode>
        <MultiplayerVisualApp />
      </StrictMode>,
    );
    return;
  }

  if (
    import.meta.env.DEV &&
    isMultiplayer &&
    !isMultiplayerMatch &&
    new URLSearchParams(window.location.search).get('visual-review') === '1'
  ) {
    const { MultiplayerBrowserVisualApp } =
      await import('./testSupport/MultiplayerBrowserVisualApp');
    root.render(
      <StrictMode>
        <MultiplayerBrowserVisualApp />
      </StrictMode>,
    );
    return;
  }

  if (
    import.meta.env.DEV &&
    !isHome &&
    new URLSearchParams(window.location.search).get('visual-review') === '1'
  ) {
    const { App } = await import('./app/App');
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    return;
  }

  const { BrowserApp } = await import('./browser/BrowserApp');
  root.render(
    <StrictMode>
      <BrowserApp />
    </StrictMode>,
  );
}

void bootstrap();

if (
  !isMultiplayer &&
  !isHome &&
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get('visual-review') === '1'
) {
  void import('./testSupport/visualScenarios');
}
