import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from './useGameStore';
import { commandFingerprint } from '../core/controllers/observation';
import { getLegalGameCommands } from '../core/controllers/legalCommands';

const initialState = useGameStore.getState();

async function beginRandomAssignment() {
  await useGameStore.getState().beginAssignment();
  const state = useGameStore.getState();
  expect(state.matchSetup.setupPhase).toBe('ready');
  return state;
}

async function startRandomMatch() {
  await beginRandomAssignment();
  await useGameStore.getState().startMatch();
  return useGameStore.getState();
}

afterEach(() => {
  vi.unstubAllGlobals();
  useGameStore.setState(initialState, true);
});

describe('setup and match store integration', () => {
  it('random seed replaces geography but preserves neutral setup choices and profiles', async () => {
    useGameStore.getState().setAssignmentMode('player-draft');
    useGameStore.getState().updatePlayer('player-01', { name: 'North Star' });
    const previousPlanet = useGameStore.getState().planet;
    await useGameStore.getState().generateWorld();
    const state = useGameStore.getState();
    expect(state.planet).not.toBe(previousPlanet);
    expect(state.setup.assignmentMode).toBe('player-draft');
    expect(state.matchSetup.assignmentMode).toBe('player-draft');
    expect(state.matchSetup.players[0]!.name).toBe('North Star');
    expect(state.matchSetup.setupPhase).toBe('neutral-preview');
    expect(state.match).toBeNull();
    expect(
      state.planet.territories.every(
        (territory) => territory.ownerId === null && territory.armyCount === 0,
      ),
    ).toBe(true);
  });

  it('generation clears ready ownership analysis and remains deterministic for an explicit seed', async () => {
    await beginRandomAssignment();
    useGameStore.getState().setSeedInput('explicit-preview-seed');
    await useGameStore.getState().applySeed();
    const first = useGameStore.getState();
    expect(first.matchSetup.setupPhase).toBe('neutral-preview');
    expect(first.matchSetup.startingPosition).toBeNull();
    expect(first.matchSetup.draft).toBeNull();
    const topology = first.planet.territories.map((territory) => ({
      id: territory.id,
      center: territory.center,
      adjacentTerritoryIds: territory.adjacentTerritoryIds,
    }));
    await useGameStore.getState().applySeed();
    expect(
      useGameStore.getState().planet.territories.map((territory) => ({
        id: territory.id,
        center: territory.center,
        adjacentTerritoryIds: territory.adjacentTerritoryIds,
      })),
    ).toEqual(topology);
  });

  it('paints a busy lock before generation and ignores duplicate activation', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint32Array) => {
        values[0] = 0;
        return values;
      },
    });
    const first = useGameStore.getState().generateWorld();
    expect(useGameStore.getState().setupOperation).toBe('generate-world');
    const seedBeforeWork = useGameStore.getState().setup.seed;
    const duplicate = useGameStore.getState().generateWorld();
    await duplicate;
    expect(useGameStore.getState().setup.seed).toBe(seedBeforeWork);
    await first;
    expect(useGameStore.getState().setupOperation).toBeNull();
    expect(useGameStore.getState().setup.seed).not.toBe(seedBeforeWork);
  });

  it('clears the busy lock and exposes an error when random generation fails', async () => {
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: () => {
        throw new Error('Random source unavailable');
      },
    });
    await useGameStore.getState().generateWorld();
    expect(useGameStore.getState().setupOperation).toBeNull();
    expect(useGameStore.getState().setupError).toMatch(
      /could not be generated/i,
    );
    vi.stubGlobal('crypto', originalCrypto);
  });

  it('generation creates neutral geography without creating match ownership', async () => {
    useGameStore.getState().setSeedInput('store-integration-world');
    await useGameStore.getState().applySeed();
    const generated = useGameStore.getState();
    expect(generated.setup.seed).toBe('store-integration-world');
    expect(generated.applicationMode).toBe('world-setup');
    expect(generated.match).toBeNull();
    expect(generated.matchSetup.setupPhase).toBe('neutral-preview');
    expect(
      generated.planet.territories.every(
        (territory) => territory.ownerId === null && territory.armyCount === 0,
      ),
    ).toBe(true);
  });

  it('advances only through the explicit match setup action', async () => {
    await useGameStore.getState().generateWorld();
    expect(useGameStore.getState().applicationMode).toBe('world-setup');
    expect(useGameStore.getState().matchSetup.setupPhase).toBe(
      'neutral-preview',
    );
    useGameStore.getState().continueToMatchSetup();
    expect(useGameStore.getState().applicationMode).toBe('pregame');
    expect(useGameStore.getState().match).toBeNull();
  });

  it('keeps local player edits, seat-count limits, and assignment on the existing setup state', () => {
    useGameStore.getState().continueToMatchSetup();
    const state = useGameStore.getState();

    state.updatePlayer('player-01', {
      name: 'North Star',
      colorId: 'color-5',
      controllerType: 'heuristic-bot',
    });
    state.setPlayerCount(5);
    let setup = useGameStore.getState();
    expect(setup.matchSetup.players).toHaveLength(5);
    expect(setup.matchSetup.players[0]).toMatchObject({
      name: 'North Star',
      colorId: 'color-5',
      controllerType: 'heuristic-bot',
    });
    expect(setup.matchSetup.players[4]?.name).toBe('Violet Assembly');

    setup.setPlayerCount(9);
    expect(useGameStore.getState().matchSetup.players).toHaveLength(5);
    useGameStore.getState().setPlayerCount(2);
    setup = useGameStore.getState();
    expect(setup.matchSetup.players).toHaveLength(2);
    expect(setup.matchSetup.players[0]?.name).toBe('North Star');

    setup.setAssignmentMode('player-draft');
    expect(useGameStore.getState().setup.assignmentMode).toBe('player-draft');
    expect(useGameStore.getState().matchSetup.assignmentMode).toBe(
      'player-draft',
    );
  });

  it('random assignment is explicit and enters first-turn handoff only after start', async () => {
    useGameStore.getState().setSeedInput('pregame-flow');
    await useGameStore.getState().applySeed();
    expect(useGameStore.getState().matchSetup.setupPhase).toBe(
      'neutral-preview',
    );
    await beginRandomAssignment();
    expect(useGameStore.getState().match).toBeNull();
    await useGameStore.getState().startMatch();
    expect(useGameStore.getState().applicationMode).toBe('handoff');
    expect(useGameStore.getState().match).not.toBeNull();
  });

  it('list selection dispatches selection and repeatable focus requests in play', async () => {
    const started = await startRandomMatch();
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

  it('cancels a territory focus for manual camera control and allows refocusing', async () => {
    const started = await startRandomMatch();
    started.beginTurn();
    const state = useGameStore.getState();
    const territory = state.planet.territories.find(
      (item) =>
        state.match!.territories[item.id]?.ownerId ===
        state.match!.activePlayerId,
    )!;
    const initialSequence = state.focusSequence;

    state.selectAndFocusTerritory(territory.id);
    expect(useGameStore.getState().focusTargetTerritoryId).toBe(territory.id);

    useGameStore.getState().cancelTerritoryFocus();
    expect(useGameStore.getState().focusTargetTerritoryId).toBeNull();
    expect(useGameStore.getState().focusSequence).toBe(initialSequence + 1);

    useGameStore.getState().focusSelectedTerritory();
    expect(useGameStore.getState().focusTargetTerritoryId).toBe(territory.id);
    expect(useGameStore.getState().focusSequence).toBe(initialSequence + 2);
  });

  it('requests camera focus without changing gameplay selection', async () => {
    const started = await startRandomMatch();
    started.beginTurn();
    const state = useGameStore.getState();
    const territory = state.planet.territories[0]!;
    const matchBefore = state.match;
    const initialSequence = state.focusSequence;

    state.requestTerritoryFocus(territory.id);

    expect(useGameStore.getState().focusTargetTerritoryId).toBe(territory.id);
    expect(useGameStore.getState().focusSequence).toBe(initialSequence + 1);
    expect(useGameStore.getState().match).toBe(matchBefore);

    useGameStore.getState().requestTerritoryFocus('stale-territory');
    expect(useGameStore.getState().focusSequence).toBe(initialSequence + 1);
    expect(useGameStore.getState().match).toBe(matchBefore);
  });

  it('keeps multiplayer selection local and deduplicates confirmed commands', async () => {
    const started = await startRandomMatch();
    started.beginTurn();
    const playing = useGameStore.getState();
    const target = playing.planet.territories.find(
      (territory) =>
        playing.match!.territories[territory.id]?.ownerId ===
        playing.match!.activePlayerId,
    )!;
    let finishCommand!: () => void;
    const authoritativeDispatch = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCommand = resolve;
        }),
    );
    useGameStore.setState({
      multiplayerSession: {
        ownPlayerId: playing.match!.activePlayerId,
        revision: 4,
        stateFingerprint: 'test-fingerprint',
        connection: 'SUBSCRIBED',
        pending: false,
        dispatch: authoritativeDispatch,
      },
    });

    useGameStore.getState().selectTerritory(target.id);
    expect(useGameStore.getState().match?.selectedSourceTerritoryId).toBe(
      target.id,
    );
    expect(authoritativeDispatch).not.toHaveBeenCalled();

    const command = {
      type: 'PLACE_REINFORCEMENT' as const,
      territoryId: target.id,
      amount: 1,
    };
    useGameStore.getState().dispatchGameAction(command);
    useGameStore.getState().dispatchGameAction(command);
    expect(authoritativeDispatch).toHaveBeenCalledOnce();
    expect(useGameStore.getState().multiplayerSession?.pending).toBe(true);

    finishCommand();
    await vi.waitFor(() =>
      expect(useGameStore.getState().multiplayerSession?.pending).toBe(false),
    );
  });

  it('blocks actions during handoff and begins without recalculating reinforcements', async () => {
    const state = await startRandomMatch();
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

  it('locks human commands on bot seats and rejects stale bot work', async () => {
    useGameStore.getState().updatePlayer('player-01', {
      controllerType: 'heuristic-bot',
    });
    const started = await startRandomMatch();
    const match = started.match!;
    started.beginTurn();
    expect(useGameStore.getState().applicationMode).toBe('handoff');
    expect(started.beginBotTurn(match.matchId, match.activePlayerId)).toBe(
      true,
    );
    const playing = useGameStore.getState();
    const fingerprint = commandFingerprint(playing.match!);
    const command = getLegalGameCommands(playing.planet, playing.match!)[0]!;
    playing.dispatchGameAction(command);
    expect(useGameStore.getState().lastActionError?.code).toBe(
      'CONTROLLER_LOCKED',
    );
    playing.resetMatch();
    const reset = useGameStore.getState();
    expect(
      reset.beginBotTurn(reset.match!.matchId, reset.match!.activePlayerId),
    ).toBe(true);
    expect(
      useGameStore
        .getState()
        .dispatchControllerAction(
          command,
          fingerprint,
          playing.controllerEpoch,
        ),
    ).toBe(false);
    const restarted = useGameStore.getState();
    const restartedFingerprint = commandFingerprint(restarted.match!);
    const restartedCommand = getLegalGameCommands(
      restarted.planet,
      restarted.match!,
    )[0]!;
    expect(
      useGameStore
        .getState()
        .dispatchControllerAction(
          restartedCommand,
          restartedFingerprint,
          restarted.controllerEpoch,
        ),
    ).toBe(true);
  });

  it('rerolls random ownership without regenerating geography', async () => {
    const state = await beginRandomAssignment();
    const planet = state.planet;
    if (state.matchSetup.setupPhase !== 'ready') return;
    const previous = state.matchSetup.startingPosition.territories;
    await state.rerollOwnership();
    const next = useGameStore.getState();
    expect(next.planet).toBe(planet);
    expect(next.matchSetup.setupPhase).toBe('ready');
    if (next.matchSetup.setupPhase === 'ready') {
      expect(next.matchSetup.startingPosition.territories).not.toEqual(
        previous,
      );
    }
  });

  it('progresses a round-robin player draft and rejects duplicate picks', async () => {
    const state = useGameStore.getState();
    state.setAssignmentMode('player-draft');
    await state.beginAssignment();
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

  it('handles uneven draft totals, restart, cancel, and completion', async () => {
    useGameStore.getState().setSetupDraft({
      territoryCount: 13,
      continentCount: 3,
      playerCount: 3,
      assignmentMode: 'player-draft',
    });
    useGameStore.getState().setSeedInput('uneven-draft');
    await useGameStore.getState().applySeed();
    await useGameStore.getState().beginAssignment();
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
    await useGameStore.getState().startMatch();
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

  it('blocks hard-invalid ready layouts with their specific reasons', async () => {
    const state = await beginRandomAssignment();
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
    await useGameStore.getState().startMatch();
    expect(useGameStore.getState().applicationMode).toBe('pregame');
    expect(useGameStore.getState().playerSetupErrors).toContain(
      'Crimson League begins with all of Golden March.',
    );
  });

  it('requires confirmation only for Poor random layouts', async () => {
    const confirm = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    vi.stubGlobal('window', { confirm });
    const state = await beginRandomAssignment();
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
    await useGameStore.getState().startMatch();
    expect(useGameStore.getState().applicationMode).toBe('pregame');
    await useGameStore.getState().startMatch();
    expect(useGameStore.getState().applicationMode).toBe('handoff');
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
