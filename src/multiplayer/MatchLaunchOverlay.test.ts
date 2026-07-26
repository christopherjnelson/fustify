import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { generatePlanet } from '../core/generation/generatePlanet';

vi.mock('./ReadonlyWorld', () => ({
  ReadonlyMinimap: ({ className }: { className: string }) =>
    createElement('div', {
      className,
      'data-testid': 'existing-lobby-preview',
    }),
}));

describe('match launch overlay', () => {
  it('announces indeterminate authoritative work and reuses the lobby preview', async () => {
    const { MatchLaunchOverlay } = await import('./MatchLaunchOverlay');
    const markup = renderToStaticMarkup(
      createElement(MatchLaunchOverlay, {
        planet: generatePlanet('launch-overlay-test', {
          territoryCount: 12,
          continentCount: 2,
          playerCount: 2,
        }),
        roomName: 'Atlas Prime',
      }),
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('Preparing Atlas Prime');
    expect(markup).toContain('existing-lobby-preview');
    expect(markup).not.toMatch(/\b\d+%/);
    expect(markup).not.toContain('progressbar');
  });
});
