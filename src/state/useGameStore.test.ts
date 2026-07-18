import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from './useGameStore';

const initialState = useGameStore.getState();

function beginRandomAssignment() {
  useGameStore.getState().beginAssignment();
  const state = useGameStore.getState();
  expect(state.matchSetup.setupPhase).toBe('ready');
  return state;
}

function startRandomMatch() {
  beginRandomAssignment();
  useGameStore.getState().startMatch();
  return useGameStore.getState();
}

afterEach(() => {
  vi.unstubAllGlobals();
  useGameStore.setState(initialState, true);
});

describe('setup and match store integration', () => {
  it('generation creates neutral geography without creating match ownership', () => {
    useGameStore.getState().setSeedInput('store-integration-world');
    useGameStore.getState().regenerate();
    const generated = useGameStore.getState();
    expect(generated.setup.seed).toBe('store-integration-world');
    expect(generated.applicationMode).toBe('pregame');
    expect(generated.match).toBeNull();
    expect(generated.matchSetup.setupPhase).toBe('neutral-preview');
    expect(
      generated.planet.territories.every(
        (territory) => territory.ownerId === null && territory.armyCount === 0,
      ),
    ).toBe(true);
  });

  it('random assignment is explicit and enters first-turn handoff only after start', () => {
    useGameStore.getState().setSeedInput('pregame-flow');
    useGameStore.getState().regenerate();
    expect(useGameStore.getState().matchSetup.setupPhase).toBe(
      'neutral-preview',
    );
    beginRandomAssignment();
    expect(useGameStore.getState().match).toBeNull();
    useGameStore.getState().startMatch();
    expect(useGameStore.getState().applicationMode).toBe('handoff');
    expect(useGameStore.getState().match).not.toBeNull();
  });

  it('list selection dispatches selection and repeatable focus requests in play', () => {
    const started = startRandomMatch();
    started.beginTurn();
    const state = useGameStore.getState();
    const match = state.match!;
    const ownedTerritory = state.planet.territories.find(
      (territory) =>
        match.territories[territory.id]?.ownerId === match.activePlayerId,
    )!;
    const initialSequence = state.focusSequence;
    state.selectAndFocusTerritory(ownedTerritory.id);
    expect(useGameStore.getState().match?.selectedSourceTerritoryId).toBe(
      ownedTerritory.id,
    );
    useGameStore.getState().selectAndFocusTerritory(ownedTerritory.id);
    expect(useGameStore.getState().focusSequence).toBe(initialSequence + 2);
  });

  it('blocks actions during handoff and begins without recalculating reinforcements', () => {
    const state = startRandomMatch();
    const before = state.match!.remainingReinforcements;
    const target = Object.keys(state.match!.territories)[0]!;
    state.dispatchGameAction({
      type: 'PLACE_REINFORCEMENT',
      territoryId: target,
      amount: 1,
    });
    expect(useGameStore.getState().match?.remainingReinforcements).toBe(before);
    useGameStore.getState().beginTurn();
    expect(useGameStore.getState().applicationMode).toBe('playing');
    expect(useGameStore.getState().match?.remainingReinforcements).toBe(before);
  });

  it('rerolls random ownership without regenerating geography', () => {
    const state = beginRandomAssignment();
    const planet = state.planet;
    if (state.matchSetup.setupPhase !== 'ready') return;
    const previous = state.matchSetup.startingPosition.territories;
    state.rerollOwnership();
    const next = useGameStore.getState();
    expect(next.planet).toBe(planet);
    expect(next.matchSetup.setupPhase).toBe('ready');
    if (next.matchSetup.setupPhase === 'ready') {
      expect(next.matchSetup.startingPosition.territories).not.toEqual(
        previous,
      );
    }
  });

  it('progresses a round-robin player draft and rejects duplicate picks', () => {
    const state = useGameStore.getState();
    state.setAssignmentMode('player-draft');
    state.beginAssignment();
    const first = state.planet.territories[0]!.id;
    const second = state.planet.territories[1]!.id;
    useGameStore.getState().pickDraftTerritory(first);
    let draft = useGameStore.getState().matchSetup;
    expect(draft.setupPhase).toBe('assignment-in-progress');
    if (draft.setupPhase !== 'assignment-in-progress') return;
    expect(draft.draft.territoryOwners[first]).toBe(draft.players[0]!.id);
    useGameStore.getState().pickDraftTerritory(first);
    expect(useGameStore.getState().assignmentFeedback).toContain('already');
    useGameStore.getState().pickDraftTerritory(second);
    draft = useGameStore.getState().matchSetup;
    if (draft.setupPhase === 'assignment-in-progress') {
      expect(draft.draft.territoryOwners[second]).toBe(draft.players[1]!.id);
    }
  });

  it('handles uneven draft totals, restart, cancel, and completion', () => {
    useGameStore.getState().setSetupDraft({
      territoryCount: 13,
      continentCount: 3,
      playerCount: 3,
      assignmentMode: 'player-draft',
    });
    useGameStore.getState().setSeedInput('uneven-draft');
    useGameStore.getState().regenerate();
    useGameStore.getState().beginAssignment();
    useGameStore
      .getState()
      .pickDraftTerritory(useGameStore.getState().planet.territories[0]!.id);
    useGameStore.getState().restartDraft();
    let setup = useGameStore.getState().matchSetup;
    expect(setup.setupPhase).toBe('assignment-in-progress');
    if (setup.setupPhase === 'assignment-in-progress') {
      expect(setup.draft.pickIndex).toBe(0);
    }
    for (const territory of useGameStore.getState().planet.territories) {
      useGameStore.getState().pickDraftTerritory(territory.id);
    }
    setup = useGameStore.getState().matchSetup;
    expect(setup.setupPhase).toBe('ready');
    if (setup.setupPhase === 'ready') {
      expect(
        setup.startingPosition.analysis.players.map((p) => p.territoryCount),
      ).toEqual([5, 4, 4]);
      expect(setup.startingPosition.analysis.hardFailure).toBe(false);
    }
    useGameStore.getState().startMatch();
    expect(useGameStore.getState().applicationMode).toBe('handoff');
    useGameStore.getState().rematchNewOwnership();
    expect(useGameStore.getState().matchSetup.setupPhase).toBe(
      'assignment-in-progress',
    );
    useGameStore.getState().cancelAssignment();
    expect(useGameStore.getState().matchSetup.setupPhase).toBe(
      'neutral-preview',
    );
  });

  it('blocks hard-invalid ready layouts with their specific reasons', () => {
    const state = beginRandomAssignment();
    if (state.matchSetup.setupPhase !== 'ready') return;
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

  it('requires confirmation only for Poor random layouts', () => {
    const confirm = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    vi.stubGlobal('window', { confirm });
    const state = beginRandomAssignment();
    if (state.matchSetup.setupPhase !== 'ready') return;
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
});
