import { create } from 'zustand';
import {
  deleteLocalMatchSave,
  readLocalMatchSave,
  writeLocalMatchSave,
} from '../browser/localSave';
import {
  readSetupFromLocation,
  writeSetupToLocation,
} from '../browser/setupUrl';
import { isMultiplayerRoute } from '../browser/routes';
import type { ApplicationMode, HandoffSummary } from '../core/appFlow';
import { createMatch } from '../core/game/createMatch';
import { gameReducer } from '../core/game/gameReducer';
import { formatMatchEvent } from '../core/game/eventFormatter';
import type { GameAction, GameError, MatchState } from '../core/game/types';
import {
  CURRENT_GENERATOR_VERSION,
  NORMALIZED_GENERATOR_VERSION,
} from '../core/generation/constants';
import { generatePlanet } from '../core/generation/generatePlanet';
import { generateReadableWorldSeed } from '../core/generation/readableWorldSeed';
import { createTerritorySelectionAction } from '../core/navigation/territoryNavigator';
import {
  SAVE_SCHEMA_VERSION,
  type LocalMatchSave,
} from '../core/persistence/saveGame';
import {
  createDefaultPlayerConfigs,
  normalizePlayerName,
  validatePlayerConfigs,
  type LocalPlayerConfig,
} from '../core/setup/playerConfig';
import {
  createNeutralMatchSetup,
  generateStartingPosition,
  type MatchSetup,
  type TerritoryAssignmentMode,
} from '../core/setup/startingPositions';
import {
  beginTerritoryAssignment,
  cancelTerritoryAssignment,
  pickDraftTerritory as applyDraftPick,
  restartPlayerDraft,
} from '../core/setup/territoryAssignment';
import {
  DEFAULT_WORLD_SETUP,
  normalizeNewWorldSetup,
  type WorldSetup,
  worldSetupsEqual,
} from '../core/setup/worldSetup';
import type { PlanetDefinition } from '../core/types/planet';
import type { GeographicPoint } from '../core/minimap/projection';
import type {
  CommandFingerprint,
  GameCommand,
} from '../core/controllers/types';
import {
  commandFingerprint,
  fingerprintsEqual,
} from '../core/controllers/observation';
import { multiplayerInteractionCapabilities } from '../multiplayer/interactionCapabilities';

function initializeSetupFromLocation() {
  if (typeof window === 'undefined') {
    return { setup: { ...DEFAULT_WORLD_SETUP }, warning: null };
  }
  if (isMultiplayerRoute(window.location.pathname)) {
    return { setup: { ...DEFAULT_WORLD_SETUP }, warning: null };
  }
  const params = new URLSearchParams(window.location.search);
  const hasSharedSetup = [
    'v',
    'generator',
    'seed',
    'territories',
    'continents',
    'players',
    'assignment',
  ].some((key) => params.has(key));
  const deterministicFixture = params.get('visual-review') === '1';
  if (!hasSharedSetup && !deterministicFixture) {
    const setup = normalizeNewWorldSetup({
      ...DEFAULT_WORLD_SETUP,
      seed: generateReadableWorldSeed(),
    });
    writeSetupToLocation(setup, 'replace');
    return { setup, warning: 'A new neutral world is ready to explore.' };
  }
  return readSetupFromLocation();
}

const initialParsedSetup = initializeSetupFromLocation();

function generateSetupPlanet(setup: WorldSetup): PlanetDefinition {
  return generatePlanet(setup.seed, {
    territoryCount: setup.territoryCount,
    continentCount: setup.continentCount,
    playerCount: setup.playerCount,
    generatorVersion: setup.generatorVersion,
  });
}

let initialSetup = initialParsedSetup.setup;
let initialWarning = initialParsedSetup.warning;
let initialPlanet: PlanetDefinition;
try {
  initialPlanet = generateSetupPlanet(initialSetup);
} catch {
  initialSetup = { ...DEFAULT_WORLD_SETUP };
  initialWarning =
    'The requested setup could not be generated; defaults were loaded.';
  initialPlanet = generateSetupPlanet(initialSetup);
}
const initialPlayers = createDefaultPlayerConfigs(initialSetup.playerCount);
const initialMatchSetup = createNeutralMatchSetup(
  initialPlayers,
  initialSetup.assignmentMode,
);

function initialSaveStatus(): Pick<
  GameState,
  'savedMatchAvailable' | 'saveError' | 'savedAt'
> {
  if (typeof window === 'undefined') {
    return { savedMatchAvailable: false, saveError: null, savedAt: null };
  }
  try {
    const result = readLocalMatchSave();
    if (result === null) {
      return { savedMatchAvailable: false, saveError: null, savedAt: null };
    }
    return result.ok
      ? {
          savedMatchAvailable: true,
          saveError: result.migrated
            ? 'An older local save is ready to resume and will be upgraded.'
            : null,
          savedAt: result.save.savedAt,
        }
      : { savedMatchAvailable: true, saveError: result.error, savedAt: null };
  } catch {
    return {
      savedMatchAvailable: false,
      saveError: 'Local storage is unavailable in this browser.',
      savedAt: null,
    };
  }
}

export type PlanetViewMode = 'ownership' | 'continents' | 'terrain';
export type SetupOperation =
  | 'apply-seed'
  | 'generate-world'
  | 'assign-territories'
  | 'reroll-territories'
  | 'start-game'
  | 'restore-game';

export type BotExecutionPhase =
  'idle' | 'thinking' | 'applying' | 'waiting' | 'error';

export interface BotExecutionState {
  phase: BotExecutionPhase;
  playerId: string | null;
  summary: string | null;
  error: string | null;
  sourceTerritoryId: string | null;
  targetTerritoryId: string | null;
}

const IDLE_BOT_EXECUTION: BotExecutionState = {
  phase: 'idle',
  playerId: null,
  summary: null,
  error: null,
  sourceTerritoryId: null,
  targetTerritoryId: null,
};

export interface GameState {
  applicationMode: ApplicationMode;
  setup: WorldSetup;
  setupDraft: WorldSetup;
  setupWarning: string | null;
  setupError: string | null;
  assignmentFeedback: string | null;
  seedInput: string;
  planet: PlanetDefinition;
  matchSetup: MatchSetup;
  playerSetupErrors: string[];
  match: MatchState | null;
  handoffSummary: HandoffSummary;
  savedMatchAvailable: boolean;
  savedAt: string | null;
  saveError: string | null;
  saveMessage: string | null;
  hoveredTerritoryId: string | null;
  inspectedTerritoryId: string | null;
  debugView: boolean;
  viewMode: PlanetViewMode;
  lastActionError: GameError | null;
  focusTargetTerritoryId: string | null;
  focusSequence: number;
  globeFocus: GeographicPoint;
  setupOperation: SetupOperation | null;
  botExecution: BotExecutionState;
  botPlaybackPaused: boolean;
  controllerEpoch: number;
  multiplayerSession: MultiplayerStoreSession | null;
  setSeedInput: (seed: string) => void;
  setSetupDraft: (update: Partial<WorldSetup>) => void;
  setPlayerCount: (playerCount: number) => void;
  applySeed: () => Promise<void>;
  generateWorld: () => Promise<void>;
  continueToMatchSetup: () => void;
  loadSetupFromUrl: () => void;
  updatePlayer: (
    id: string,
    update: Partial<
      Pick<LocalPlayerConfig, 'name' | 'colorId' | 'controllerType'>
    >,
  ) => void;
  setAssignmentMode: (mode: TerritoryAssignmentMode) => void;
  beginAssignment: () => Promise<void>;
  cancelAssignment: () => void;
  restartDraft: () => void;
  pickDraftTerritory: (territoryId: string) => void;
  rerollOwnership: () => Promise<void>;
  startMatch: () => Promise<void>;
  backToWorldSetup: () => void;
  beginTurn: () => void;
  beginBotTurn: (matchId: string, playerId: string) => boolean;
  resetMatch: () => void;
  rematchNewOwnership: () => void;
  dispatchGameAction: (action: GameAction) => void;
  dispatchControllerAction: (
    action: GameCommand,
    expected: CommandFingerprint,
    expectedEpoch: number,
  ) => boolean;
  pauseBotPlayback: () => boolean;
  resumeBotPlayback: () => boolean;
  clearBotPlaybackPause: () => void;
  setBotExecution: (execution: BotExecutionState) => void;
  saveMatch: () => void;
  resumeSavedMatch: () => Promise<void>;
  deleteSavedMatch: () => void;
  setHoveredTerritory: (id: string | null) => void;
  selectTerritory: (id: string | null) => void;
  selectAndFocusTerritory: (id: string) => void;
  toggleDebugView: () => void;
  setViewMode: (mode: PlanetViewMode) => void;
  requestTerritoryFocus: (territoryId: string) => void;
  focusSelectedTerritory: () => void;
  cancelTerritoryFocus: () => void;
  setGlobeFocus: (focus: GeographicPoint) => void;
}

export interface MultiplayerStoreSession {
  ownPlayerId: string | null;
  revision: number;
  stateFingerprint: string;
  connection: string;
  pending: boolean;
  dispatch: (action: GameAction) => Promise<void>;
}

export function reconcileMultiplayerSelection(
  planet: PlanetDefinition,
  canonical: MatchState,
  local: MatchState | null,
): MatchState {
  if (!['reinforce', 'attack', 'fortify'].includes(canonical.phase)) {
    return canonical;
  }
  const cleared: MatchState = {
    ...canonical,
    selectedSourceTerritoryId: null,
    selectedTargetTerritoryId: null,
  };
  if (
    !local ||
    local.matchId !== canonical.matchId ||
    local.phase !== canonical.phase ||
    local.activePlayerId !== canonical.activePlayerId ||
    local.winnerId !== canonical.winnerId
  ) {
    return cleared;
  }

  let reconciled = cleared;
  for (const territoryId of [
    local.selectedSourceTerritoryId,
    local.selectedTargetTerritoryId,
  ]) {
    if (!territoryId) continue;
    const transition = gameReducer(planet, reconciled, {
      type: 'SELECT_TERRITORY',
      territoryId,
    });
    if (transition.error) break;
    reconciled = transition.state;
  }
  return reconciled;
}

function allowBusyStateToPaint(): Promise<void> {
  if (typeof window === 'undefined' || !window.requestAnimationFrame) {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  return new Promise((resolve) =>
    window.requestAnimationFrame(() => setTimeout(resolve, 250)),
  );
}

function selectedTerritory(state: GameState): string | null {
  return (
    state.match?.selectedTargetTerritoryId ??
    state.match?.selectedSourceTerritoryId ??
    null
  );
}

function summaryForTurn(
  planet: PlanetDefinition,
  players: readonly LocalPlayerConfig[],
  match: MatchState,
  previousTurn: number,
): HandoffSummary {
  const interesting = new Set([
    'territory-captured',
    'player-eliminated',
    'fortification-completed',
    'match-won',
  ]);
  return {
    previousTurn,
    messages: match.events
      .filter(
        (event) =>
          event.turnNumber === previousTurn && interesting.has(event.type),
      )
      .slice(-4)
      .map((event) => formatMatchEvent(event, { planet, players })),
  };
}

function saveSnapshot(
  state: GameState,
  mode = state.applicationMode,
): LocalMatchSave {
  const applicationMode = mode === 'world-setup' ? 'pregame' : mode;
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    generatorVersion: state.setup.generatorVersion,
    worldSetup: state.setup,
    matchSetup: state.matchSetup,
    matchState: applicationMode === 'pregame' ? null : state.match,
    applicationMode,
  };
}

export const useGameStore = create<GameState>((set, get) => {
  const persist = (state: GameState, mode?: ApplicationMode) => {
    if (typeof window === 'undefined') return;
    try {
      const save = saveSnapshot(state, mode);
      writeLocalMatchSave(save);
      set({
        savedMatchAvailable: true,
        savedAt: save.savedAt,
        saveError: null,
        saveMessage:
          save.applicationMode === 'pregame'
            ? 'World setup saved locally.'
            : 'Match saved locally.',
      });
    } catch {
      set({
        saveError: 'The current session could not be saved locally.',
        saveMessage: null,
      });
    }
  };

  const applyGeneratedSetup = (setup: WorldSetup, warning: string | null) => {
    const planet = generateSetupPlanet(setup);
    const previousPlayers = get().matchSetup.players;
    const defaults = createDefaultPlayerConfigs(setup.playerCount);
    const players = defaults.map((fallback, index) => {
      const existing = previousPlayers[index];
      return existing
        ? {
            ...fallback,
            name: existing.name,
            colorId: existing.colorId,
            controllerType: existing.controllerType,
          }
        : fallback;
    });
    const matchSetup = createNeutralMatchSetup(players, setup.assignmentMode);
    set({
      applicationMode: 'world-setup',
      setup,
      setupDraft: setup,
      setupWarning: warning,
      setupError: null,
      assignmentFeedback: null,
      planet,
      matchSetup,
      playerSetupErrors: validatePlayerConfigs(players),
      match: null,
      seedInput: planet.seed,
      hoveredTerritoryId: null,
      focusTargetTerritoryId: null,
      lastActionError: null,
      saveMessage: null,
      botExecution: IDLE_BOT_EXECUTION,
      botPlaybackPaused: false,
      controllerEpoch: get().controllerEpoch + 1,
    });
  };

  return {
    applicationMode: 'world-setup',
    setup: initialSetup,
    setupDraft: initialSetup,
    setupWarning: initialWarning,
    setupError: null,
    assignmentFeedback: null,
    seedInput: initialSetup.seed,
    planet: initialPlanet,
    matchSetup: initialMatchSetup,
    playerSetupErrors: [],
    match: null,
    handoffSummary: { previousTurn: null, messages: [] },
    ...initialSaveStatus(),
    saveMessage: null,
    hoveredTerritoryId: null,
    inspectedTerritoryId: null,
    debugView: false,
    viewMode: 'ownership',
    lastActionError: null,
    focusTargetTerritoryId: null,
    focusSequence: 0,
    globeFocus: { longitude: 90, latitude: 0 },
    setupOperation: null,
    botExecution: IDLE_BOT_EXECUTION,
    botPlaybackPaused: false,
    controllerEpoch: 0,
    multiplayerSession: null,
    setSeedInput: (seedInput) =>
      set((state) => ({
        seedInput,
        setupDraft: { ...state.setupDraft, seed: seedInput },
        setupError: null,
      })),
    setSetupDraft: (update) =>
      set((state) => ({
        setupDraft: { ...state.setupDraft, ...update },
        setupError: null,
      })),
    setPlayerCount: (playerCount) => {
      const state = get();
      if (
        state.applicationMode !== 'pregame' ||
        state.matchSetup.setupPhase !== 'neutral-preview' ||
        state.setupOperation
      )
        return;
      const setup = normalizeNewWorldSetup({ ...state.setup, playerCount });
      const defaults = createDefaultPlayerConfigs(setup.playerCount);
      const players = defaults.map((fallback, index) => {
        const existing = state.matchSetup.players[index];
        return existing
          ? {
              ...fallback,
              name: existing.name,
              colorId: existing.colorId,
              controllerType: existing.controllerType,
            }
          : fallback;
      });
      set({
        setup,
        setupDraft: { ...state.setupDraft, playerCount: setup.playerCount },
        matchSetup: createNeutralMatchSetup(
          players,
          state.matchSetup.assignmentMode,
        ),
        playerSetupErrors: validatePlayerConfigs(players),
        assignmentFeedback: null,
      });
      if (typeof window !== 'undefined') writeSetupToLocation(setup, 'replace');
    },
    applySeed: async () => {
      if (get().setupOperation) return;
      if (
        get().savedMatchAvailable &&
        typeof window !== 'undefined' &&
        !window.confirm(
          'Start a new world setup? Your existing local save will remain available until you save this setup.',
        )
      )
        return;
      set({ setupOperation: 'apply-seed', setupError: null });
      await allowBusyStateToPaint();
      const requestedSetup = { ...get().setupDraft, seed: get().seedInput };
      const setup = normalizeNewWorldSetup(requestedSetup);
      const warning = worldSetupsEqual(setup, requestedSetup)
        ? null
        : 'Setup values were normalized to the supported ranges.';
      try {
        if (typeof window !== 'undefined') writeSetupToLocation(setup);
        applyGeneratedSetup(
          setup,
          warning ?? `Neutral world generated: ${setup.seed}.`,
        );
      } catch (error) {
        set({
          setupError:
            error instanceof Error
              ? error.message
              : 'Could not generate world.',
        });
      } finally {
        set({ setupOperation: null });
      }
    },
    generateWorld: async () => {
      if (get().setupOperation) return;
      if (
        get().savedMatchAvailable &&
        typeof window !== 'undefined' &&
        !window.confirm(
          'Generate a new world setup? Your existing local save will remain available until you save this setup.',
        )
      )
        return;
      set({ setupOperation: 'generate-world', setupError: null });
      await allowBusyStateToPaint();
      try {
        const seedInput = generateReadableWorldSeed();
        const setup = normalizeNewWorldSetup({
          ...get().setupDraft,
          seed: seedInput,
        });
        if (typeof window !== 'undefined')
          writeSetupToLocation(setup, 'replace');
        applyGeneratedSetup(
          setup,
          `New neutral world generated: ${setup.seed}.`,
        );
      } catch {
        set({
          setupError: 'That world could not be generated. Try again.',
        });
      } finally {
        set({ setupOperation: null });
      }
    },
    continueToMatchSetup: () => {
      const state = get();
      if (state.setupOperation) return;
      if (state.matchSetup.setupPhase !== 'neutral-preview' || state.match)
        return;
      set({
        applicationMode: 'pregame',
        setupError: null,
        assignmentFeedback: null,
      });
    },
    loadSetupFromUrl: () => {
      if (typeof window === 'undefined') return;
      if (
        ['handoff', 'playing', 'game-over'].includes(get().applicationMode) &&
        !window.confirm(
          'Use the world setup from browser history? The active match will remain in its local save.',
        )
      )
        return;
      const parsed = readSetupFromLocation();
      try {
        applyGeneratedSetup(parsed.setup, parsed.warning);
      } catch {
        applyGeneratedSetup(
          { ...DEFAULT_WORLD_SETUP },
          'The requested setup could not be generated; defaults were loaded.',
        );
      }
    },
    updatePlayer: (id, update) =>
      set((state) => {
        if (state.matchSetup.setupPhase !== 'neutral-preview') return state;
        const players = state.matchSetup.players.map((player) =>
          player.id === id
            ? {
                ...player,
                ...update,
                name: update.name === undefined ? player.name : update.name,
              }
            : player,
        );
        return {
          matchSetup: { ...state.matchSetup, players },
          playerSetupErrors: validatePlayerConfigs(players),
        };
      }),
    setAssignmentMode: (assignmentMode) => {
      const state = get();
      if (state.matchSetup.setupPhase !== 'neutral-preview') return;
      const setup = { ...state.setup, assignmentMode };
      set({
        setup,
        setupDraft: { ...state.setupDraft, assignmentMode },
        matchSetup: { ...state.matchSetup, assignmentMode },
        assignmentFeedback: null,
      });
      if (typeof window !== 'undefined') writeSetupToLocation(setup, 'replace');
    },
    beginAssignment: async () => {
      const state = get();
      if (state.setupOperation) return;
      if (state.matchSetup.setupPhase !== 'neutral-preview') return;
      const players = state.matchSetup.players.map((player) => ({
        ...player,
        name: normalizePlayerName(player.name),
      }));
      const errors = validatePlayerConfigs(players);
      if (errors.length) {
        set({ playerSetupErrors: errors });
        return;
      }
      set({ setupOperation: 'assign-territories', setupError: null });
      await allowBusyStateToPaint();
      try {
        const current = get();
        if (current.matchSetup.setupPhase !== 'neutral-preview') return;
        const matchSetup = beginTerritoryAssignment(current.planet, {
          ...current.matchSetup,
          players,
        });
        set({
          matchSetup,
          playerSetupErrors: [],
          assignmentFeedback:
            matchSetup.setupPhase === 'ready'
              ? 'Random assignment is ready to review.'
              : `${players[0]!.name} chooses first.`,
          match: null,
          lastActionError: null,
        });
      } catch (error) {
        set({
          setupError:
            error instanceof Error
              ? error.message
              : 'Territory assignment could not begin.',
        });
      } finally {
        set({ setupOperation: null });
      }
    },
    cancelAssignment: () => {
      const state = get();
      set({
        matchSetup: cancelTerritoryAssignment(state.matchSetup),
        assignmentFeedback:
          'Territory assignment canceled. Geography is unchanged.',
        match: null,
      });
    },
    restartDraft: () => {
      const state = get();
      if (state.matchSetup.assignmentMode !== 'player-draft') return;
      set({
        matchSetup: restartPlayerDraft(state.matchSetup),
        assignmentFeedback: `${state.matchSetup.players[0]!.name} chooses first.`,
        match: null,
      });
    },
    pickDraftTerritory: (territoryId) => {
      const state = get();
      if (state.matchSetup.setupPhase !== 'assignment-in-progress') {
        set({
          assignmentFeedback:
            'Begin a player draft before choosing territories.',
        });
        return;
      }
      const result = applyDraftPick(
        state.planet,
        state.matchSetup,
        territoryId,
      );
      if (!result.ok) {
        set({ assignmentFeedback: result.error });
        return;
      }
      const ownerId = result.setup.draft?.territoryOwners[territoryId];
      const owner = state.matchSetup.players.find(
        (player) => player.id === ownerId,
      );
      const feedback =
        result.setup.setupPhase === 'ready'
          ? `${owner?.name ?? 'The final player'} completed the draft. Review the layout before play.`
          : `${owner?.name ?? 'Player'} claimed ${state.planet.territories.find((territory) => territory.id === territoryId)?.name ?? territoryId}.`;
      set({
        matchSetup: result.setup,
        assignmentFeedback: feedback,
        hoveredTerritoryId: null,
      });
    },
    rerollOwnership: async () => {
      const state = get();
      if (state.setupOperation) return;
      if (
        state.matchSetup.setupPhase !== 'ready' ||
        state.matchSetup.assignmentMode !== 'random'
      )
        return;
      set({ setupOperation: 'reroll-territories', setupError: null });
      await allowBusyStateToPaint();
      const current = get();
      if (
        current.matchSetup.setupPhase !== 'ready' ||
        current.matchSetup.assignmentMode !== 'random'
      ) {
        set({ setupOperation: null });
        return;
      }
      const ownershipVariant = current.matchSetup.ownershipVariant + 1;
      try {
        const startingPosition = generateStartingPosition(
          current.planet,
          current.matchSetup.players,
          ownershipVariant,
        );
        set({
          matchSetup: {
            ...current.matchSetup,
            ownershipVariant,
            startingPosition,
          },
          match: null,
          assignmentFeedback: `Random assignment variant ${ownershipVariant} is ready.`,
        });
      } catch (error) {
        set({
          setupError:
            error instanceof Error
              ? error.message
              : 'A new balanced ownership layout could not be generated.',
        });
      } finally {
        set({ setupOperation: null });
      }
    },
    startMatch: async () => {
      const state = get();
      if (state.setupOperation) return;
      if (state.matchSetup.setupPhase !== 'ready') {
        set({
          playerSetupErrors: [
            'Complete territory assignment before starting play.',
          ],
        });
        return;
      }
      const errors = validatePlayerConfigs(state.matchSetup.players);
      if (state.matchSetup.startingPosition.analysis.hardFailure) {
        errors.push(
          ...state.matchSetup.startingPosition.analysis.hardFailureReasons,
        );
      }
      if (errors.length > 0) {
        set({ playerSetupErrors: errors });
        return;
      }
      if (
        state.matchSetup.assignmentMode === 'random' &&
        state.matchSetup.startingPosition.analysis.rating === 'poor' &&
        typeof window !== 'undefined' &&
        !window.confirm(
          `This random starting position is rated Poor. ${state.matchSetup.startingPosition.analysis.warnings.slice(0, 2).join(' ')} Start anyway?`,
        )
      )
        return;
      set({ setupOperation: 'start-game', setupError: null });
      await allowBusyStateToPaint();
      try {
        const current = get();
        if (current.matchSetup.setupPhase !== 'ready') return;
        const match = createMatch(current.planet, current.matchSetup);
        set({
          applicationMode: 'handoff',
          match,
          handoffSummary: { previousTurn: null, messages: [] },
          playerSetupErrors: [],
          assignmentFeedback: null,
          lastActionError: null,
          botPlaybackPaused: false,
          controllerEpoch: current.controllerEpoch + 1,
        });
        persist({ ...get(), match, applicationMode: 'handoff' }, 'handoff');
      } catch (error) {
        set({
          setupError:
            error instanceof Error
              ? error.message
              : 'The game could not start.',
        });
      } finally {
        set({ setupOperation: null });
      }
    },
    backToWorldSetup: () =>
      set({
        applicationMode: 'world-setup',
        saveMessage: null,
        botExecution: IDLE_BOT_EXECUTION,
        botPlaybackPaused: false,
        controllerEpoch: get().controllerEpoch + 1,
      }),
    beginTurn: () => {
      const state = get();
      if (!state.match) return;
      const controller = state.matchSetup.players.find(
        (player) => player.id === state.match?.activePlayerId,
      )?.controllerType;
      if (controller === 'heuristic-bot') return;
      const match = {
        ...state.match,
        selectedSourceTerritoryId: null,
        selectedTargetTerritoryId: null,
      };
      set({ applicationMode: 'playing', match, lastActionError: null });
      persist({ ...get(), match, applicationMode: 'playing' }, 'playing');
    },
    beginBotTurn: (matchId, playerId) => {
      const state = get();
      const active = state.matchSetup.players.find(
        (player) => player.id === state.match?.activePlayerId,
      );
      if (
        state.applicationMode !== 'handoff' ||
        !state.match ||
        state.match.matchId !== matchId ||
        state.match.activePlayerId !== playerId ||
        active?.controllerType !== 'heuristic-bot'
      )
        return false;
      const match = {
        ...state.match,
        selectedSourceTerritoryId: null,
        selectedTargetTerritoryId: null,
      };
      set({ applicationMode: 'playing', match, lastActionError: null });
      persist({ ...get(), match, applicationMode: 'playing' }, 'playing');
      return true;
    },
    resetMatch: () => {
      const state = get();
      if (state.matchSetup.setupPhase !== 'ready') return;
      const match = createMatch(state.planet, state.matchSetup);
      set({
        applicationMode: 'handoff',
        match,
        handoffSummary: { previousTurn: null, messages: [] },
        lastActionError: null,
        botExecution: IDLE_BOT_EXECUTION,
        botPlaybackPaused: false,
        controllerEpoch: state.controllerEpoch + 1,
      });
      persist({ ...get(), match, applicationMode: 'handoff' }, 'handoff');
    },
    rematchNewOwnership: () => {
      const state = get();
      if (state.matchSetup.assignmentMode === 'player-draft') {
        set({
          applicationMode: 'pregame',
          matchSetup: restartPlayerDraft(state.matchSetup),
          match: null,
          assignmentFeedback: `${state.matchSetup.players[0]!.name} chooses first.`,
          botPlaybackPaused: false,
          controllerEpoch: state.controllerEpoch + 1,
        });
      } else {
        get().rerollOwnership();
        set({
          applicationMode: 'pregame',
          match: null,
          botPlaybackPaused: false,
          controllerEpoch: get().controllerEpoch + 1,
        });
      }
    },
    dispatchGameAction: (action) => {
      const state = get();
      if (state.multiplayerSession) {
        if (!state.match) return;
        if (
          state.match.activePlayerId !== state.multiplayerSession.ownPlayerId
        ) {
          set({
            lastActionError: {
              code: 'CONTROLLER_LOCKED',
              message: 'It is another player’s turn.',
            },
          });
          return;
        }
        if (state.multiplayerSession.pending) return;
        if (action.type === 'SELECT_TERRITORY') {
          const transition = gameReducer(state.planet, state.match, action);
          set({
            match: transition.state,
            lastActionError: transition.error,
          });
          return;
        }
        const dispatch = state.multiplayerSession.dispatch;
        set({
          multiplayerSession: { ...state.multiplayerSession, pending: true },
          lastActionError: null,
        });
        void dispatch(action)
          .catch((error: unknown) => {
            set({
              lastActionError: {
                code: 'CONTROLLER_LOCKED',
                message:
                  error instanceof Error
                    ? error.message
                    : 'The authoritative command failed.',
              },
            });
          })
          .finally(() => {
            set((current) =>
              current.multiplayerSession
                ? {
                    multiplayerSession: {
                      ...current.multiplayerSession,
                      pending: false,
                    },
                  }
                : current,
            );
          });
        return;
      }
      if (state.applicationMode !== 'playing' || !state.match) {
        set({
          lastActionError: {
            code: 'WRONG_PHASE',
            message: 'Begin the active player turn before taking game actions.',
          },
        });
        return;
      }
      const controller = state.matchSetup.players.find(
        (player) => player.id === state.match?.activePlayerId,
      )?.controllerType;
      if (controller === 'heuristic-bot') {
        set({
          lastActionError: {
            code: 'CONTROLLER_LOCKED',
            message: 'Gameplay input is disabled while the bot is acting.',
          },
        });
        return;
      }
      const result = gameReducer(state.planet, state.match, action);
      if (result.error) {
        set({ lastActionError: result.error });
        return;
      }
      let applicationMode: ApplicationMode = state.applicationMode;
      let handoffSummary = state.handoffSummary;
      if (result.state.phase === 'game-over') applicationMode = 'game-over';
      else if (action.type === 'END_TURN') {
        applicationMode = 'handoff';
        handoffSummary = summaryForTurn(
          state.planet,
          state.matchSetup.players,
          result.state,
          state.match.turnNumber,
        );
      }
      set({
        match: result.state,
        lastActionError: null,
        applicationMode,
        handoffSummary,
      });
      if (action.type !== 'SELECT_TERRITORY') {
        persist(
          { ...get(), match: result.state, applicationMode },
          applicationMode,
        );
      }
    },
    dispatchControllerAction: (action, expected, expectedEpoch) => {
      const state = get();
      if (
        state.controllerEpoch !== expectedEpoch ||
        state.botPlaybackPaused ||
        state.applicationMode !== 'playing' ||
        !state.match ||
        !fingerprintsEqual(commandFingerprint(state.match), expected)
      )
        return false;
      const controller = state.matchSetup.players.find(
        (player) => player.id === state.match?.activePlayerId,
      )?.controllerType;
      if (controller !== 'heuristic-bot') return false;
      const result = gameReducer(state.planet, state.match, action);
      if (result.error) {
        set({
          lastActionError: result.error,
          botExecution: {
            ...state.botExecution,
            phase: 'error',
            error: `${result.error.code}: ${result.error.message}`,
          },
        });
        return false;
      }
      let applicationMode: ApplicationMode = state.applicationMode;
      let handoffSummary = state.handoffSummary;
      if (result.state.phase === 'game-over') applicationMode = 'game-over';
      else if (action.type === 'END_TURN') {
        applicationMode = 'handoff';
        handoffSummary = summaryForTurn(
          state.planet,
          state.matchSetup.players,
          result.state,
          state.match.turnNumber,
        );
      }
      set({
        match: result.state,
        lastActionError: null,
        applicationMode,
        handoffSummary,
        botPlaybackPaused: false,
      });
      persist(
        { ...get(), match: result.state, applicationMode },
        applicationMode,
      );
      return true;
    },
    pauseBotPlayback: () => {
      const state = get();
      const active = state.matchSetup.players.find(
        (player) => player.id === state.match?.activePlayerId,
      );
      if (
        state.botPlaybackPaused ||
        state.multiplayerSession ||
        state.applicationMode !== 'playing' ||
        !state.match ||
        state.match.phase === 'game-over' ||
        active?.controllerType !== 'heuristic-bot'
      )
        return false;
      set({
        botPlaybackPaused: true,
        controllerEpoch: state.controllerEpoch + 1,
      });
      return true;
    },
    resumeBotPlayback: () => {
      const state = get();
      const active = state.matchSetup.players.find(
        (player) => player.id === state.match?.activePlayerId,
      );
      if (
        !state.botPlaybackPaused ||
        state.multiplayerSession ||
        state.applicationMode !== 'playing' ||
        !state.match ||
        state.match.phase === 'game-over' ||
        active?.controllerType !== 'heuristic-bot'
      )
        return false;
      set({ botPlaybackPaused: false });
      return true;
    },
    clearBotPlaybackPause: () =>
      set((state) =>
        state.botPlaybackPaused
          ? {
              botPlaybackPaused: false,
              controllerEpoch: state.controllerEpoch + 1,
            }
          : state,
      ),
    setBotExecution: (botExecution) => set({ botExecution }),
    saveMatch: () => persist(get()),
    resumeSavedMatch: async () => {
      if (get().setupOperation) return;
      if (typeof window === 'undefined') return;
      set({ setupOperation: 'restore-game', saveError: null });
      await allowBusyStateToPaint();
      try {
        const parsed = readLocalMatchSave();
        if (!parsed || !parsed.ok) {
          set({
            saveError:
              parsed && !parsed.ok ? parsed.error : 'No local save was found.',
          });
          return;
        }
        const save = parsed.save;
        if (
          save.generatorVersion !== save.worldSetup.generatorVersion ||
          ![CURRENT_GENERATOR_VERSION, NORMALIZED_GENERATOR_VERSION].includes(
            save.generatorVersion,
          )
        ) {
          set({
            saveError: 'This save uses an unsupported world generator version.',
          });
          return;
        }
        const planet = generateSetupPlanet(save.worldSetup);
        const territoryIds = new Set(
          planet.territories.map((territory) => territory.id),
        );
        if (
          save.matchState &&
          (Object.keys(save.matchState.territories).length !==
            territoryIds.size ||
            Object.keys(save.matchState.territories).some(
              (id) => !territoryIds.has(id),
            ))
        ) {
          set({
            saveError:
              'The saved match does not match its reconstructed world.',
          });
          return;
        }
        const match = save.matchState
          ? {
              ...save.matchState,
              selectedSourceTerritoryId: null,
              selectedTargetTerritoryId: null,
            }
          : null;
        const applicationMode =
          save.applicationMode === 'pregame'
            ? 'pregame'
            : save.matchState?.phase === 'game-over'
              ? 'game-over'
              : 'handoff';
        set({
          applicationMode,
          setup: save.worldSetup,
          setupDraft: save.worldSetup,
          seedInput: save.worldSetup.seed,
          planet,
          matchSetup: save.matchSetup,
          playerSetupErrors: validatePlayerConfigs(save.matchSetup.players),
          match,
          handoffSummary: { previousTurn: null, messages: [] },
          saveError: null,
          saveMessage: parsed.migrated
            ? 'Local session resumed and upgraded.'
            : 'Local session resumed.',
          savedAt: save.savedAt,
          savedMatchAvailable: true,
          hoveredTerritoryId: null,
          assignmentFeedback: null,
          lastActionError: null,
          botExecution: IDLE_BOT_EXECUTION,
          botPlaybackPaused: false,
          controllerEpoch: get().controllerEpoch + 1,
        });
        if (parsed.migrated) persist(get(), applicationMode);
      } catch {
        set({ saveError: 'The local session could not be read safely.' });
      } finally {
        set({ setupOperation: null });
      }
    },
    deleteSavedMatch: () => {
      if (typeof window === 'undefined') return;
      try {
        deleteLocalMatchSave();
        set({
          savedMatchAvailable: false,
          savedAt: null,
          saveError: null,
          saveMessage: 'Local save deleted.',
        });
      } catch {
        set({ saveError: 'The local save could not be deleted.' });
      }
    },
    setHoveredTerritory: (hoveredTerritoryId) =>
      set((state) =>
        state.hoveredTerritoryId === hoveredTerritoryId
          ? state
          : { hoveredTerritoryId },
      ),
    selectTerritory: (territoryId) => {
      const state = get();
      if (
        territoryId &&
        state.applicationMode === 'pregame' &&
        state.matchSetup.setupPhase === 'assignment-in-progress'
      ) {
        state.pickDraftTerritory(territoryId);
        return;
      }
      if (state.applicationMode === 'playing') {
        const activeController = state.matchSetup.players.find(
          (player) => player.id === state.match?.activePlayerId,
        )?.controllerType;
        if (
          state.botPlaybackPaused &&
          !state.multiplayerSession &&
          activeController === 'heuristic-bot'
        ) {
          set({
            inspectedTerritoryId: territoryId,
            lastActionError: null,
          });
          return;
        }
        const capabilities = multiplayerInteractionCapabilities(
          state.match,
          state.multiplayerSession,
        );
        if (
          state.multiplayerSession &&
          capabilities.canInspectTerritories &&
          !capabilities.canIssueGameplayActions
        ) {
          set({
            inspectedTerritoryId: territoryId,
            lastActionError: null,
          });
          return;
        }
        set({ inspectedTerritoryId: null });
        state.dispatchGameAction(createTerritorySelectionAction(territoryId));
      }
    },
    selectAndFocusTerritory: (territoryId) => {
      const state = get();
      if (state.applicationMode !== 'playing') return;
      const activeController = state.matchSetup.players.find(
        (player) => player.id === state.match?.activePlayerId,
      )?.controllerType;
      if (
        state.botPlaybackPaused &&
        !state.multiplayerSession &&
        activeController === 'heuristic-bot'
      ) {
        set({
          inspectedTerritoryId: territoryId,
          lastActionError: null,
          focusTargetTerritoryId: territoryId,
          focusSequence: state.focusSequence + 1,
        });
        return;
      }
      const capabilities = multiplayerInteractionCapabilities(
        state.match,
        state.multiplayerSession,
      );
      if (
        state.multiplayerSession &&
        capabilities.canInspectTerritories &&
        !capabilities.canIssueGameplayActions
      ) {
        set({ inspectedTerritoryId: territoryId, lastActionError: null });
      } else {
        set({ inspectedTerritoryId: null });
        state.dispatchGameAction(createTerritorySelectionAction(territoryId));
      }
      set((current) => ({
        focusTargetTerritoryId: territoryId,
        focusSequence: current.focusSequence + 1,
      }));
    },
    toggleDebugView: () => set((state) => ({ debugView: !state.debugView })),
    setViewMode: (viewMode) => set({ viewMode }),
    requestTerritoryFocus: (territoryId) =>
      set((state) =>
        state.applicationMode !== 'playing' ||
        !state.planet.territories.some(
          (territory) => territory.id === territoryId,
        )
          ? state
          : {
              focusTargetTerritoryId: territoryId,
              focusSequence: state.focusSequence + 1,
            },
      ),
    focusSelectedTerritory: () => {
      const state = get();
      const territoryId =
        (state.botPlaybackPaused && !state.multiplayerSession) ||
        (state.multiplayerSession &&
          !multiplayerInteractionCapabilities(
            state.match,
            state.multiplayerSession,
          ).canIssueGameplayActions)
          ? state.inspectedTerritoryId
          : selectedTerritory(state);
      if (territoryId !== null) state.requestTerritoryFocus(territoryId);
    },
    cancelTerritoryFocus: () =>
      set((state) =>
        state.focusTargetTerritoryId === null
          ? state
          : { focusTargetTerritoryId: null },
      ),
    setGlobeFocus: (globeFocus) =>
      set((state) =>
        Math.abs(state.globeFocus.longitude - globeFocus.longitude) < 0.01 &&
        Math.abs(state.globeFocus.latitude - globeFocus.latitude) < 0.01
          ? state
          : { globeFocus },
      ),
  };
});
