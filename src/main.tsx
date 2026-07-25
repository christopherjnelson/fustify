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
    let source = reportSources.localAdminReportSource;
    if (import.meta.env.DEV) {
      // Fixture sources are development-only. Rollup drops this whole branch,
      // and therefore the fixture chunk, from production builds.
      const fixtureName = new URLSearchParams(window.location.search).get(
        'admin-fixture',
      );
      if (fixtureName) {
        const { fixtureAdminReportSource } =
          await import('./admin/fixtureReportSource');
        source = fixtureAdminReportSource(fixtureName);
      }
    }
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
  !isAdmin &&
  !isMultiplayer &&
  !isHome &&
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get('visual-review') === '1'
) {
  void import('./testSupport/visualScenarios');
}
