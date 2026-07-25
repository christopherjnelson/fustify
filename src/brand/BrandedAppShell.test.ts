import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BrandedAppShell } from './BrandedAppShell';
import { protectedRouteContext } from './protectedRouteContext';

describe('BrandedAppShell', () => {
  it('maps protected routes to compact route context and navigation', () => {
    expect(protectedRouteContext('/local')).toMatchObject({
      backHref: '/',
      title: 'Local game',
      immersive: true,
    });
    expect(protectedRouteContext('/multiplayer/room/room-id')).toMatchObject({
      backHref: '/multiplayer',
      title: 'Lobby',
      immersive: false,
    });
    expect(protectedRouteContext('/multiplayer/match/match-id')).toMatchObject({
      backHref: '/multiplayer',
      title: 'Match',
      immersive: true,
    });
  });

  it('renders the real logo, account region, and protected content', () => {
    const markup = renderToStaticMarkup(
      createElement(
        BrandedAppShell,
        {
          accountControl: createElement(
            'aside',
            { 'aria-label': 'Account' },
            'Test account',
          ),
        },
        createElement('main', null, 'Protected application'),
      ),
    );

    expect(markup).toContain('fustify-logo');
    expect(markup).toContain('aria-label="Fustify home"');
    expect(markup).toContain('aria-label="Account"');
    expect(markup).toContain('Protected application');
  });
});
