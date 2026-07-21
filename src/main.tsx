import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/globals.css';
import { AdminDashboard } from './admin/AdminDashboard';
import {
  fixtureAdminReportSource,
  localAdminReportSource,
} from './admin/reportSource';

const isAdmin =
  window.location.pathname === '/admin' ||
  window.location.pathname === '/admin/';
const fixtureName = new URLSearchParams(window.location.search).get(
  'admin-fixture',
);
const adminSource =
  import.meta.env.DEV && fixtureName
    ? fixtureAdminReportSource(fixtureName)
    : localAdminReportSource;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdmin ? (
      <AdminDashboard
        source={adminSource}
        dataAvailable={import.meta.env.DEV}
      />
    ) : (
      <App />
    )}
  </StrictMode>,
);

if (
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get('visual-review') === '1'
) {
  void import('./testSupport/visualScenarios');
}
