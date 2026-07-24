import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import {
  hasLocalSetupParameters,
  isAdminRoute,
  isAuthRoute,
  isMultiplayerRoute,
} from './browser/routes';

const isAdmin = isAdminRoute(window.location.pathname);
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
  isAdmin
    ? 'admin-route'
    : isAuth
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
  if (isAdmin) {
    const [{ AdminDashboard }, reportSources] = await Promise.all([
      import('./admin/AdminDashboard'),
      import('./admin/reportSource'),
    ]);
    const fixtureName = new URLSearchParams(window.location.search).get(
      'admin-fixture',
    );
    const source =
      import.meta.env.DEV && fixtureName
        ? reportSources.fixtureAdminReportSource(fixtureName)
        : reportSources.localAdminReportSource;
    root.render(
      <StrictMode>
        <AdminDashboard source={source} dataAvailable={import.meta.env.DEV} />
      </StrictMode>,
    );
    return;
  }

  if (isAuth) {
    if (window.location.pathname.startsWith('/auth/reset-password')) {
      const { ResetPasswordPage } = await import('./auth/ResetPasswordPage');
      root.render(
        <StrictMode>
          <ResetPasswordPage />
        </StrictMode>,
      );
    } else {
      const { AuthCallbackPage } = await import('./auth/AuthCallbackPage');
      root.render(
        <StrictMode>
          <AuthCallbackPage />
        </StrictMode>,
      );
    }
    return;
  }

  if (isMultiplayer) {
    if (
      import.meta.env.DEV &&
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
    const { MultiplayerApp } = await import('./multiplayer/MultiplayerApp');
    root.render(
      <StrictMode>
        <MultiplayerApp />
      </StrictMode>,
    );
    return;
  }

  if (isHome) {
    const { Home } = await import('./home/Home');
    root.render(
      <StrictMode>
        <Home />
      </StrictMode>,
    );
    return;
  }

  const { App } = await import('./app/App');
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();

if (
  !isAdmin &&
  !isMultiplayer &&
  !isHome &&
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get('visual-review') === '1'
) {
  void import('./testSupport/visualScenarios');
}
