import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import { isAdminRoute, isMultiplayerRoute } from './browser/routes';

const isAdmin = isAdminRoute(window.location.pathname);
const isMultiplayer = isMultiplayerRoute(window.location.pathname);
const isMultiplayerMatch = window.location.pathname.startsWith(
  '/multiplayer/match/',
);
document.documentElement.classList.add(
  isAdmin ? 'admin-route' : isMultiplayer ? 'multiplayer-route' : 'game-route',
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
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get('visual-review') === '1'
) {
  void import('./testSupport/visualScenarios');
}
