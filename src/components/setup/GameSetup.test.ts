import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  GameSetupShell,
  SetupActionBar,
  SetupRoster,
  SetupSeatRow,
  SetupSummary,
  SetupWorldPanel,
} from './GameSetup';

describe('shared game setup presentation', () => {
  it('composes summary, roster, world, and actions in keyboard order', () => {
    const markup = renderToStaticMarkup(
      createElement(GameSetupShell, {
        eyebrow: 'Mode',
        title: 'Setup',
        summary: createElement(SetupSummary, {
          label: 'Summary',
          children: 'Room summary',
        }),
        roster: createElement(SetupRoster, {
          title: 'Seats',
          children: createElement(SetupSeatRow, {
            seatNumber: 1,
            colorLabel: 'Crimson',
            colorValue: '#e24f4f',
            primaryLabel: 'Open',
            secondaryStatus: 'Available',
            controls: createElement('button', { type: 'button' }, 'Claim'),
          }),
        }),
        world: createElement(SetupWorldPanel, {
          title: 'World',
          controls: createElement('input', { 'aria-label': 'Seed' }),
          preview: createElement('div', null, 'Preview'),
        }),
        actions: createElement(SetupActionBar, {
          primary: createElement('button', { type: 'button' }, 'Start'),
          status: 'Waiting',
          secondary: createElement('button', { type: 'button' }, 'Leave'),
        }),
      }),
    );

    expect(markup.indexOf('Room summary')).toBeLessThan(
      markup.indexOf('Seat 1'),
    );
    expect(markup.indexOf('Seat 1')).toBeLessThan(
      markup.indexOf('aria-label="Seed"'),
    );
    expect(markup.indexOf('aria-label="Seed"')).toBeLessThan(
      markup.indexOf('>Start<'),
    );
    expect(markup).toContain('aria-label="Seat 1, Crimson, Open"');
    expect(markup).toContain('aria-label="Crimson player color"');
  });
});
