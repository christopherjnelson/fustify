import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from './useGameStore';

const initialState = useGameStore.getState();

afterEach(() => {
  vi.unstubAllGlobals();
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
    useGameStore.setState({ applicationMode: 'playing' });
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

  it('generating enters pregame and starting enters first-turn handoff', () => {
    useGameStore.getState().setSeedInput('pregame-flow');
    useGameStore.getState().regenerate();
    expect(useGameStore.getState().applicationMode).toBe('pregame');
    useGameStore.getState().startMatch();
    expect(useGameStore.getState().applicationMode).toBe('handoff');
    expect(useGameStore.getState().handoffSummary.previousTurn).toBeNull();
  });

  it('blocks actions during handoff and begins without recalculating reinforcements', () => {
    useGameStore.setState({ applicationMode: 'handoff' });
    const before = useGameStore.getState().match.remainingReinforcements;
    const target = Object.keys(useGameStore.getState().match.territories)[0]!;
    useGameStore.getState().dispatchGameAction({
      type: 'PLACE_REINFORCEMENT',
      territoryId: target,
      amount: 1,
    });
    expect(useGameStore.getState().match.remainingReinforcements).toBe(before);
    useGameStore.getState().beginTurn();
    expect(useGameStore.getState().applicationMode).toBe('playing');
    expect(useGameStore.getState().match.remainingReinforcements).toBe(before);
  });

  it('rerolls ownership while preserving player profiles and planet', () => {
    const state = useGameStore.getState();
    const planet = state.planet;
    const players = state.matchSetup.players;
    const previous = state.matchSetup.startingPosition.territories;
    state.rerollOwnership();
    const next = useGameStore.getState();
    expect(next.planet).toBe(planet);
    expect(next.matchSetup.players).toEqual(players);
    expect(next.matchSetup.startingPosition.territories).not.toEqual(previous);
  });

  it('blocks hard-invalid layouts with their specific reasons', () => {
    const state = useGameStore.getState();
    useGameStore.setState({
      applicationMode: 'pregame',
      matchSetup: {
        ...state.matchSetup,
        startingPosition: {
          ...state.matchSetup.startingPosition,
          analysis: {
            ...state.matchSetup.startingPosition.analysis,
            hardFailure: true,
            hardFailureReasons: [
              'Crimson League begins with all of Golden March.',
            ],
          },
        },
      },
    });
    useGameStore.getState().startMatch();
    expect(useGameStore.getState().applicationMode).toBe('pregame');
    expect(useGameStore.getState().playerSetupErrors).toContain(
      'Crimson League begins with all of Golden March.',
    );
  });

  it('requires confirmation for Poor valid layouts', () => {
    const confirm = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    vi.stubGlobal('window', { confirm });
    const state = useGameStore.getState();
    useGameStore.setState({
      applicationMode: 'pregame',
      matchSetup: {
        ...state.matchSetup,
        startingPosition: {
          ...state.matchSetup.startingPosition,
          analysis: {
            ...state.matchSetup.startingPosition.analysis,
            overallScore: 40,
            rating: 'poor',
            hardFailure: false,
            hardFailureReasons: [],
            warnings: ['Azure Pact has one sea-route endpoint.'],
          },
        },
      },
    });
    useGameStore.getState().startMatch();
    expect(useGameStore.getState().applicationMode).toBe('pregame');
    useGameStore.getState().startMatch();
    expect(useGameStore.getState().applicationMode).toBe('handoff');
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('creates a rerolled rematch with the refined setup analysis', () => {
    const before = useGameStore.getState().matchSetup;
    useGameStore.getState().rematchNewOwnership();
    const after = useGameStore.getState();
    expect(after.applicationMode).toBe('pregame');
    expect(after.matchSetup.ownershipVariant).toBe(before.ownershipVariant + 1);
    expect(after.matchSetup.startingPosition.analysis.hardFailure).toBe(false);
    expect(after.matchSetup.startingPosition.analysis.breakdown).toHaveProperty(
      'connectivityDistribution',
    );
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
