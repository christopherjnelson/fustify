import { useEffect, useState, type ReactNode } from 'react';
import { FustifyLogo } from './FustifyLogo';
import { protectedRouteContext } from './protectedRouteContext';

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);

  const context = protectedRouteContext(pathname);

  return (
    <div
      className={`protected-route-shell branded-app-shell${context.immersive ? ' branded-app-shell-immersive' : ''}`}
      data-route-context={context.title}
    >
      <header className="branded-app-header">
        <a className="branded-app-home" href="/" aria-label="Fustify home">
          <FustifyLogo decorative size="compact" />
        </a>
        <div className="branded-app-context">
          <span>{context.eyebrow}</span>
          <strong>{context.title}</strong>
        </div>
        <a className="branded-app-back" href={context.backHref}>
          <span aria-hidden="true">←</span>
          {context.backLabel}
        </a>
        {accountControl}
      </header>
      <div className="branded-app-content">{children}</div>
    </div>
  );
}
