import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../state/useGameStore';
import { PregamePanel } from './PregamePanel';

const initialState = useGameStore.getState();

afterEach(() => {
  useGameStore.setState(initialState, true);
});

describe('local pregame presentation', () => {
  it('uses shared seat rows for the editable local player configuration', () => {
    useGameStore.getState().continueToMatchSetup();

    const markup = renderToStaticMarkup(createElement(PregamePanel));

    expect(markup.match(/class="setup-seat-row"/g)).toHaveLength(4);
    expect(markup).toContain('data-testid="local-seat-1"');
    expect(markup).toContain('aria-label="Seat 1, Crimson, Crimson League"');
    expect(markup).toContain('aria-label="Player 1 name"');
    expect(markup).toContain('aria-label="Crimson League color"');
    expect(markup).toContain('aria-label="Crimson League controller"');
    expect(markup).toContain('<option value="local-human" selected="">');
    expect(markup).not.toContain('no territories assigned');
    expect(markup).not.toContain('Add Seat');
  });

  it('keeps assignment choices as a compact real radio group', () => {
    const markup = renderToStaticMarkup(createElement(PregamePanel));

    expect(markup).toContain('name="assignment-mode"');
    expect(markup).toMatch(/name="assignment-mode" checked="" value="random"/);
    expect(markup).toContain('value="player-draft"');
    expect(markup).toContain('Deterministically distributes');
  });
});
