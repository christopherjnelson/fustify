import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get('visual-review') === '1'
) {
  void import('./testSupport/visualScenarios');
}
