import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../state/useGameStore';
import { HudUtilityRow, ReinforcementPlacementControls } from './TerritoryHud';
import { submitReinforcementPlacement } from './reinforcementPlacement';

const initialState = useGameStore.getState();

afterEach(() => {
  useGameStore.setState(initialState, true);
});

describe('active-match HUD utilities', () => {
  it.each(['local', 'authoritative multiplayer'])(
    'omits debug access for %s play while retaining player utilities',
    () => {
      const markup = renderToStaticMarkup(
        createElement(
          HudUtilityRow,
          {
            navigatorOpen: false,
            navigatorTriggerRef: createRef<HTMLButtonElement>(),
            onOpenNavigator: () => undefined,
          },
          createElement(
            'details',
            { className: 'game-menu' },
            createElement('summary', null, 'Game'),
          ),
        ),
      );

      expect(markup).not.toMatch(/>\s*Debug\s*</);
      expect(markup).not.toContain('aria-pressed=');
      expect(markup).toContain('Territory list');
      expect(markup).toContain('<summary>Game</summary>');
    },
  );

  it('retains the underlying debug state and action for future authorized access', () => {
    expect(useGameStore.getState().debugView).toBe(false);
    useGameStore.getState().toggleDebugView();
    expect(useGameStore.getState().debugView).toBe(true);
  });
});

function renderReinforcementControls({
  remainingReinforcements,
  amount = 1,
  selectedTerritoryId = 'frost-coast',
  pending = false,
  onPlace = () => undefined,
}: {
  remainingReinforcements: number;
  amount?: number;
  selectedTerritoryId?: string | null;
  pending?: boolean;
  onPlace?: (territoryId: string, amount: number) => void;
}) {
  return renderToStaticMarkup(
    createElement(ReinforcementPlacementControls, {
      remainingReinforcements,
      amount,
      selectedTerritoryId,
      pending,
      onAmountChange: () => undefined,
      onPlace,
    }),
  );
}

describe('reinforcement placement controls', () => {
  it('retains the amount selector, current amount, Max, and plural action for multiple armies', () => {
    const markup = renderReinforcementControls({
      remainingReinforcements: 4,
      amount: 3,
    });

    expect(markup).toContain('type="range"');
    expect(markup).toContain('Armies to place');
    expect(markup).toContain('<strong aria-live="polite">3</strong>');
    expect(markup).toContain('aria-label="Max: 4 armies"');
    expect(markup).toContain('Place 3 armies');
  });

  it.each(['local', 'authoritative multiplayer'])(
    'shows only the singular placement action for one remaining army in %s play',
    () => {
      const markup = renderReinforcementControls({
        remainingReinforcements: 1,
        amount: 4,
      });

      expect(markup).not.toContain('type="range"');
      expect(markup).not.toContain('Armies to place');
      expect(markup).not.toContain('Max:');
      expect(markup).toContain('Place 1 army');
      expect(markup).not.toContain('Place 1 armies');
    },
  );

  it('keeps the singular action disabled and busy while multiplayer placement is pending', () => {
    const markup = renderReinforcementControls({
      remainingReinforcements: 1,
      pending: true,
    });

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Placing 1 army');
  });

  it('submits exactly one amount-1 placement through the existing callback', () => {
    const placements: { territoryId: string; amount: number }[] = [];

    submitReinforcementPlacement('frost-coast', 1, (territoryId, amount) => {
      placements.push({ territoryId, amount });
    });

    expect(placements).toEqual([{ territoryId: 'frost-coast', amount: 1 }]);
  });

  it('renders no placement controls after the reinforcement pool reaches zero', () => {
    expect(renderReinforcementControls({ remainingReinforcements: 0 })).toBe(
      '',
    );
  });
});
