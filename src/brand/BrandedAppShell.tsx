import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { FustifyMark } from './FustifyMark';
import { protectedRouteContext } from './protectedRouteContext';
import {
  connectionStatusLabel,
  currentRouteConnection,
  ROUTE_CONNECTION_EVENT,
} from './routeConnectionStatus';

export function BrandedAppShell({
  accountControl,
  children,
}: {
  accountControl: ReactNode;
  children?: ReactNode;
}) {
  const [pathname, setPathname] = useState(() =>
    typeof window === 'undefined' ? '/local' : window.location.pathname,
  );
  const [connection, setConnection] = useState(currentRouteConnection);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);

  const context = protectedRouteContext(pathname);
  useLayoutEffect(() => {
    const update = (event: Event) =>
      setConnection((event as CustomEvent<string | null>).detail);
    window.addEventListener(ROUTE_CONNECTION_EVENT, update);
    return () => window.removeEventListener(ROUTE_CONNECTION_EVENT, update);
  }, []);

  return (
    <div
      className={`protected-route-shell branded-app-shell${context.immersive ? ' branded-app-shell-immersive' : ''}`}
      data-route-context={context.title}
    >
      <header className="branded-app-header">
        <a className="branded-app-home" href="/" aria-label="Fustify home">
          <FustifyMark decorative className="branded-app-mark" />
        </a>
        <div className="branded-app-context">
          <span>{context.eyebrow}</span>
          <strong>{context.title}</strong>
        </div>
        <a className="branded-app-back" href={context.backHref}>
          <span aria-hidden="true">←</span>
          {context.backLabel}
        </a>
        {context.immersive && connection && (
          <span
            className={`multiplayer-connection${connection === 'SUBSCRIBED' ? ' connected' : ''} connection-${connection.toLowerCase().replace('_', '-')}`}
            role="status"
            aria-live="polite"
            aria-label={`Connection status: ${connectionStatusLabel(connection)}`}
            data-testid="connection-status"
          >
            {connectionStatusLabel(connection)}
          </span>
        )}
        {accountControl}
      </header>
      <div className="branded-app-content">{children}</div>
    </div>
  );
}
