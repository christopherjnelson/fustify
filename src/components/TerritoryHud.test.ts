import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../state/useGameStore';
import {
  BotPlaybackMenuAction,
  HudUtilityRow,
  MultiplayerWaitingPanel,
  PausedBotStatus,
  PlayerViewModeSelector,
  ReinforcementPlacementControls,
} from './TerritoryHud';
import { PLAYER_VIEW_MODES, playerViewMode } from './playerViewModes';
import { submitReinforcementPlacement } from './reinforcementPlacement';
import { multiplayerHudMode } from '../multiplayer/interactionCapabilities';
import { BotPacingSelector } from './BotPacingSelector';
import { isBotPlaybackControlVisible } from '../browser/botPacingVisibility';

const initialState = useGameStore.getState();

afterEach(() => {
  useGameStore.setState(initialState, true);
});

describe('active-match HUD utilities', () => {
  it('uses explicit bot playback labels and a compact paused status', () => {
    const running = renderToStaticMarkup(
      createElement(BotPlaybackMenuAction, {
        paused: false,
        onPause: () => undefined,
        onResume: () => undefined,
      }),
    );
    const paused = renderToStaticMarkup(
      createElement(BotPlaybackMenuAction, {
        paused: true,
        onPause: () => undefined,
        onResume: () => undefined,
      }),
    );
    const status = renderToStaticMarkup(
      createElement(PausedBotStatus, {
        activePlayerName: 'Azure Pact',
        onResume: () => undefined,
      }),
    );

    expect(running).toContain('>Pause Bots</button>');
    expect(paused).toContain('>Resume Bots</button>');
    expect(status).toContain('Azure Pact is paused.');
    expect(status).toContain('Resume bot playback to continue.');
    expect(status).toContain('>Resume Bots</button>');
  });

  it('shows bot playback control only for an active local bot turn', () => {
    const visible = {
      multiplayer: false,
      hasLocalBots: true,
      botControlled: true,
      phase: 'attack',
    } as const;

    expect(isBotPlaybackControlVisible(visible)).toBe(true);
    expect(
      isBotPlaybackControlVisible({ ...visible, botControlled: false }),
    ).toBe(false);
    expect(
      isBotPlaybackControlVisible({ ...visible, hasLocalBots: false }),
    ).toBe(false);
    expect(isBotPlaybackControlVisible({ ...visible, multiplayer: true })).toBe(
      false,
    );
    expect(
      isBotPlaybackControlVisible({ ...visible, phase: 'game-over' }),
    ).toBe(false);
  });

  it('offers the same accessible bot pacing preference in the Game menu', () => {
    const markup = renderToStaticMarkup(
      createElement(BotPacingSelector, { context: 'game-menu' }),
    );

    expect(markup).toContain('<legend>Bot pacing</legend>');
    expect(markup).toContain('Instant');
    expect(markup).toContain('Fast · 1 second');
    expect(markup).toContain('Deliberate · 5 seconds');
    expect(markup).toMatch(
      /name="bot-pacing-game-menu"[^>]*checked=""[^>]*value="fast"/,
    );
  });

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

describe('player globe view modes', () => {
  it.each(['local', 'authoritative multiplayer'])(
    'offers only Ownership and Continents in the %s HUD',
    () => {
      const markup = renderToStaticMarkup(
        createElement(PlayerViewModeSelector, {
          viewMode: 'ownership',
          onViewModeChange: () => undefined,
        }),
      );

      expect(PLAYER_VIEW_MODES.map((mode) => mode.id)).toEqual([
        'ownership',
        'continents',
      ]);
      expect(markup).toContain('>Ownership</button>');
      expect(markup).toContain('>Continents</button>');
      expect(markup).not.toContain('Terrain');
      expect(markup.match(/<button/g)).toHaveLength(2);
    },
  );

  it('retains selection behavior for both player-facing modes', () => {
    const ownershipMarkup = renderToStaticMarkup(
      createElement(PlayerViewModeSelector, {
        viewMode: 'ownership',
        onViewModeChange: () => undefined,
      }),
    );
    const continentsMarkup = renderToStaticMarkup(
      createElement(PlayerViewModeSelector, {
        viewMode: 'continents',
        onViewModeChange: () => undefined,
      }),
    );

    expect(ownershipMarkup).toContain(
      'class="active" aria-pressed="true">Ownership',
    );
    expect(continentsMarkup).toContain(
      'class="active" aria-pressed="true">Continents',
    );
  });

  it('normalizes an existing Terrain selection to Ownership', () => {
    expect(playerViewMode('terrain')).toBe('ownership');

    const markup = renderToStaticMarkup(
      createElement(PlayerViewModeSelector, {
        viewMode: 'terrain',
        onViewModeChange: () => undefined,
      }),
    );

    expect(markup).not.toContain('Terrain');
    expect(markup).toContain('class="active" aria-pressed="true">Ownership');
  });

  it('preserves direct internal access to Terrain rendering mode', () => {
    useGameStore.getState().setViewMode('terrain');
    expect(useGameStore.getState().viewMode).toBe('terrain');
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

async function prepareMultiplayerHud(ownPlayerId: 'active' | null) {
  await useGameStore.getState().beginAssignment();
  await useGameStore.getState().startMatch();
  useGameStore.getState().beginTurn();
  const state = useGameStore.getState();
  useGameStore.setState({
    multiplayerSession: {
      ownPlayerId:
        ownPlayerId === 'active' ? state.match!.activePlayerId : ownPlayerId,
      revision: 7,
      stateFingerprint: 'waiting-hud-fixture',
      connection: 'SUBSCRIBED',
      pending: false,
      dispatch: async () => undefined,
    },
  });
  return state;
}

describe('authoritative multiplayer turn presentation', () => {
  it('preserves interactive phase controls for the claimed active player', async () => {
    const state = await prepareMultiplayerHud('active');
    const controls = renderReinforcementControls({
      remainingReinforcements: state.match!.remainingReinforcements,
    });

    expect(state.match?.phase).toBe('reinforce');
    expect(
      multiplayerHudMode(
        state.match!,
        useGameStore.getState().multiplayerSession,
      ),
    ).toBe('interactive');
    expect(controls).toContain('Place');
  });

  it('renders stable waiting identity, phase, and canonical own-player totals without action controls', async () => {
    const state = await prepareMultiplayerHud(null);
    const match = state.match!;
    const ownPlayer = state.matchSetup.players[0]!;
    const activePlayer = state.matchSetup.players[1]!;
    const waitingMatch = {
      ...match,
      activePlayerId: activePlayer.id,
      phase: 'attack' as const,
      selectedSourceTerritoryId: null,
      selectedTargetTerritoryId: null,
    };
    const session = {
      ...useGameStore.getState().multiplayerSession!,
      ownPlayerId: ownPlayer.id,
    };
    const expectedTerritories = Object.values(waitingMatch.territories).filter(
      (territory) => territory.ownerId === ownPlayer.id,
    );
    const expectedArmies = expectedTerritories.reduce(
      (total, territory) => total + territory.armyCount,
      0,
    );

    const markup = renderToStaticMarkup(
      createElement(MultiplayerWaitingPanel, {
        match: waitingMatch,
        activePlayer,
        ownPlayer,
      }),
    );

    expect(multiplayerHudMode(waitingMatch, session)).toBe('waiting');
    expect(markup).toContain('multiplayer-waiting-panel');
    expect(markup).toContain(`Waiting for</span><h2>${activePlayer.name}`);
    expect(markup).toContain('Attacking');
    expect(markup).toContain(ownPlayer.name);
    expect(markup).toContain(`Seat ${ownPlayer.seatIndex + 1}`);
    expect(markup).toContain(
      `<dt>Territories</dt><dd>${expectedTerritories.length}</dd>`,
    );
    expect(markup).toContain(`<dt>Armies</dt><dd>${expectedArmies}</dd>`);
    expect(markup).not.toContain('Attack phase actions');
    expect(markup).not.toContain('End attack phase');
  });

  it('does not replace completed-match presentation with the waiting panel', async () => {
    const state = await prepareMultiplayerHud(null);
    const activePlayer = state.matchSetup.players[1]!;
    const completed = {
      ...state.match!,
      activePlayerId: activePlayer.id,
      phase: 'game-over' as const,
      winnerId: activePlayer.id,
    };

    expect(
      multiplayerHudMode(completed, useGameStore.getState().multiplayerSession),
    ).toBe('completed');
  });

  it('keeps unresolved claimed-player identity read-only', async () => {
    const state = await prepareMultiplayerHud(null);
    const activePlayer = state.matchSetup.players.find(
      (player) => player.id === state.match?.activePlayerId,
    )!;

    const markup = renderToStaticMarkup(
      createElement(MultiplayerWaitingPanel, {
        match: state.match!,
        activePlayer,
        ownPlayer: null,
      }),
    );

    expect(
      multiplayerHudMode(state.match!, {
        ...useGameStore.getState().multiplayerSession!,
        ownPlayerId: null,
      }),
    ).toBe('waiting');
    expect(markup).toContain('Confirming your claimed seat');
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('<input');
  });
});
