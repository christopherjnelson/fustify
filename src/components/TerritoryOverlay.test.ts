import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  COASTLINE_COLOR,
  COASTLINE_OPACITY,
  CONTINENT_BORDER_COLOR,
  CONTINENT_BORDER_OPACITY,
  TerritoryOverlay,
} from './TerritoryOverlay';

describe('TerritoryOverlay', () => {
  it('uses grounded gold linework without changing dark territory borders', () => {
    const markup = renderToStaticMarkup(
      createElement(TerritoryOverlay, {
        sphere: { vertices: [], faces: [] },
        surfaceCells: [],
        territories: [],
        emphasized: false,
      }),
    );

    expect(markup).toContain('color="#09121d"');
    expect(markup).toContain(`color="${CONTINENT_BORDER_COLOR}"`);
    expect(markup).toContain(`opacity="${CONTINENT_BORDER_OPACITY}"`);
    expect(markup).toContain(`color="${COASTLINE_COLOR}"`);
    expect(markup).toContain(`opacity="${COASTLINE_OPACITY}"`);
    expect(markup).not.toContain('#67b5d4');
  });
});
