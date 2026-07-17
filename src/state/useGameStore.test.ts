import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from './useGameStore';

const initialState = useGameStore.getState();

afterEach(() => {
  useGameStore.setState(initialState, true);
});

describe('setup and match store integration', () => {
  it('regeneration creates a new match while reset preserves setup', () => {
    const previousMatchId = useGameStore.getState().match.matchId;
    useGameStore.getState().setSeedInput('store-integration-world');
    useGameStore.getState().regenerate();

    const generated = useGameStore.getState();
    expect(generated.setup.seed).toBe('store-integration-world');
    expect(generated.match.matchId).not.toBe(previousMatchId);
    expect(generated.match.seed).toBe(generated.planet.seed);

    const setupBeforeReset = generated.setup;
    generated.resetMatch();
    expect(useGameStore.getState().setup).toEqual(setupBeforeReset);
    expect(useGameStore.getState().match.seed).toBe(setupBeforeReset.seed);
  });

  it('list selection dispatches selection and emits repeatable focus requests', () => {
    const state = useGameStore.getState();
    const ownedTerritory = state.planet.territories.find(
      (territory) =>
        state.match.territories[territory.id]?.ownerId ===
        state.match.activePlayerId,
    )!;
    const initialSequence = state.focusSequence;
    state.selectAndFocusTerritory(ownedTerritory.id);
    expect(useGameStore.getState().match.selectedSourceTerritoryId).toBe(
      ownedTerritory.id,
    );
    expect(useGameStore.getState().focusTargetTerritoryId).toBe(
      ownedTerritory.id,
    );
    expect(useGameStore.getState().focusSequence).toBe(initialSequence + 1);

    useGameStore.getState().selectAndFocusTerritory(ownedTerritory.id);
    expect(useGameStore.getState().focusSequence).toBe(initialSequence + 2);
  });

  it('requests focus for a territory regardless of its hemisphere', () => {
    const state = useGameStore.getState();
    const backTerritory = [...state.planet.territories].sort(
      (a, b) => a.center[2] - b.center[2],
    )[0]!;
    state.selectAndFocusTerritory(backTerritory.id);
    expect(useGameStore.getState().focusTargetTerritoryId).toBe(
      backTerritory.id,
    );
    expect(typeof useGameStore.getState().focusSequence).toBe('number');
  });
});
