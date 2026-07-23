import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { generatePlanet } from '../core/generation/generatePlanet';
import { ReadonlyMinimap } from '../multiplayer/ReadonlyWorld';
import { InteractiveTerritoryPath } from './Minimap';

function interactivePath(onActivate = vi.fn()) {
  return InteractiveTerritoryPath({
    territoryId: 'territory-20',
    territoryName: 'Verdant Reach',
    path: 'M 0 0 L 2 0 L 1 1 Z M 358 0 L 360 0 L 359 1 Z',
    fill: '#4f8c62',
    continentId: 'continent-2',
    ownerId: 'player-1',
    fragmentCount: 2,
    active: false,
    onActivate,
  }) as ReactElement<{
    onClick: () => void;
    onKeyDown: (event: { key: string; preventDefault: () => void }) => void;
  }>;
}

describe('interactive minimap territory', () => {
  it('uses one accessible control for all projected fragments and activates its territory', () => {
    const onActivate = vi.fn();
    const path = interactivePath(onActivate);
    const markup = renderToStaticMarkup(
      createElement(InteractiveTerritoryPath, {
        territoryId: 'territory-20',
        territoryName: 'Verdant Reach',
        path: 'M 0 0 L 2 0 L 1 1 Z M 358 0 L 360 0 L 359 1 Z',
        fill: '#4f8c62',
        continentId: 'continent-2',
        ownerId: 'player-1',
        fragmentCount: 2,
        active: false,
        onActivate,
      }),
    );

    expect(markup.match(/role="button"/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="Focus Verdant Reach"');
    expect(markup).toContain('data-fragment-count="2"');
    path.props.onClick();
    expect(onActivate).toHaveBeenCalledWith('territory-20');
  });

  it('activates with Enter and Space without allowing Space to scroll', () => {
    const onActivate = vi.fn();

    for (const key of ['Enter', ' ']) {
      const preventDefault = vi.fn();
      interactivePath(onActivate).props.onKeyDown({ key, preventDefault });
      expect(preventDefault).toHaveBeenCalledOnce();
    }

    expect(onActivate).toHaveBeenNthCalledWith(1, 'territory-20');
    expect(onActivate).toHaveBeenNthCalledWith(2, 'territory-20');
  });

  it('keeps the multiplayer lobby minimap read-only', () => {
    const markup = renderToStaticMarkup(
      createElement(ReadonlyMinimap, {
        planet: generatePlanet('readonly-minimap-test', {
          territoryCount: 12,
          continentCount: 3,
          playerCount: 2,
        }),
      }),
    );

    expect(markup).toContain('data-testid="multiplayer-minimap"');
    expect(markup).not.toContain('role="button"');
    expect(markup).not.toContain('tabindex=');
  });
});
