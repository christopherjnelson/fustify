import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../state/useGameStore';
import { HudUtilityRow } from './TerritoryHud';

const initialState = useGameStore.getState();

afterEach(() => {
  useGameStore.setState(initialState, true);
});

describe('active-match HUD utilities', () => {
  it.each([
    ['local', true],
    ['authoritative multiplayer', false],
  ])(
    'omits debug access for %s play while retaining neighboring player controls',
    (_, showGameMenu) => {
      const markup = renderToStaticMarkup(
        createElement(
          HudUtilityRow,
          {
            navigatorOpen: false,
            navigatorTriggerRef: createRef<HTMLButtonElement>(),
            onOpenNavigator: () => undefined,
          },
          showGameMenu
            ? createElement(
                'details',
                { className: 'game-menu' },
                createElement('summary', null, 'Game'),
              )
            : undefined,
        ),
      );

      expect(markup).not.toMatch(/>\s*Debug\s*</);
      expect(markup).not.toContain('aria-pressed=');
      expect(markup).toContain('Territory list');
      expect(markup.includes('<summary>Game</summary>')).toBe(showGameMenu);
    },
  );

  it('retains the underlying debug state and action for future authorized access', () => {
    expect(useGameStore.getState().debugView).toBe(false);
    useGameStore.getState().toggleDebugView();
    expect(useGameStore.getState().debugView).toBe(true);
  });
});
