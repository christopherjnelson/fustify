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
import type { ApplicationMode, HandoffSummary } from '../core/appFlow';
import { createMatch } from '../core/game/createMatch';
import { gameReducer } from '../core/game/gameReducer';
import type { GameAction, GameError, MatchState } from '../core/game/types';
import { GENERATOR_VERSION } from '../core/generation/constants';
import { generatePlanet } from '../core/generation/generatePlanet';
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
  normalizeWorldSetup,
  type WorldSetup,
  worldSetupsEqual,
} from '../core/setup/worldSetup';
import type { PlanetDefinition } from '../core/types/planet';
import type { GeographicPoint } from '../core/minimap/projection';

const initialParsedSetup =
  typeof window === 'undefined'
    ? { setup: { ...DEFAULT_WORLD_SETUP }, warning: null }
    : readSetupFromLocation();

function generateSetupPlanet(setup: WorldSetup): PlanetDefinition {
  return generatePlanet(setup.seed, {
    territoryCount: setup.territoryCount,
    continentCount: setup.continentCount,
    playerCount: setup.playerCount,
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
  debugView: boolean;
  viewMode: PlanetViewMode;
  eventLogOpen: boolean;
  lastActionError: GameError | null;
  focusTargetTerritoryId: string | null;
  focusSequence: number;
  globeFocus: GeographicPoint;
  setSeedInput: (seed: string) => void;
  setSetupDraft: (update: Partial<WorldSetup>) => void;
  regenerate: () => void;
  randomizeSeed: () => void;
  loadSetupFromUrl: () => void;
  updatePlayer: (
    id: string,
    update: Partial<Pick<LocalPlayerConfig, 'name' | 'colorId'>>,
  ) => void;
  setAssignmentMode: (mode: TerritoryAssignmentMode) => void;
  beginAssignment: () => void;
  cancelAssignment: () => void;
  restartDraft: () => void;
  pickDraftTerritory: (territoryId: string) => void;
  rerollOwnership: () => void;
  startMatch: () => void;
  backToWorldSetup: () => void;
  beginTurn: () => void;
  resetMatch: () => void;
  rematchNewOwnership: () => void;
  dispatchGameAction: (action: GameAction) => void;
  saveMatch: () => void;
  resumeSavedMatch: () => void;
  deleteSavedMatch: () => void;
  setHoveredTerritory: (id: string | null) => void;
  selectTerritory: (id: string | null) => void;
  selectAndFocusTerritory: (id: string) => void;
  toggleDebugView: () => void;
  setViewMode: (mode: PlanetViewMode) => void;
  toggleEventLog: () => void;
  focusSelectedTerritory: () => void;
  setGlobeFocus: (focus: GeographicPoint) => void;
}

function makeRandomSeed(): string {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return `world-${values[0]!.toString(36)}-${values[1]!.toString(36)}`;
}

function selectedTerritory(state: GameState): string | null {
  return (
    state.match?.selectedTargetTerritoryId ??
    state.match?.selectedSourceTerritoryId ??
    null
  );
}

function summaryForTurn(
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
      .map((event) => event.message),
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
    generatorVersion: state.planet.generatorVersion,
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
        ? { ...fallback, name: existing.name, colorId: existing.colorId }
        : fallback;
    });
    const matchSetup = createNeutralMatchSetup(players, setup.assignmentMode);
    set({
      applicationMode: 'pregame',
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
    debugView: false,
    viewMode: 'ownership',
    eventLogOpen: false,
    lastActionError: null,
    focusTargetTerritoryId: null,
    focusSequence: 0,
    globeFocus: { longitude: 90, latitude: 0 },
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
    regenerate: () => {
      if (
        get().savedMatchAvailable &&
        typeof window !== 'undefined' &&
        !window.confirm(
          'Start a new world setup? Your existing local save will remain available until you save this setup.',
        )
      )
        return;
      const requestedSetup = { ...get().setupDraft, seed: get().seedInput };
      const setup = normalizeWorldSetup(requestedSetup);
      const warning = worldSetupsEqual(setup, requestedSetup)
        ? null
        : 'Setup values were normalized to the supported ranges.';
      try {
        if (typeof window !== 'undefined') writeSetupToLocation(setup);
        applyGeneratedSetup(setup, warning);
      } catch (error) {
        set({
          setupError:
            error instanceof Error
              ? error.message
              : 'Could not generate world.',
        });
      }
    },
    randomizeSeed: () => {
      if (
        get().savedMatchAvailable &&
        typeof window !== 'undefined' &&
        !window.confirm(
          'Start a new random world setup? Your existing local save will remain available until you save this setup.',
        )
      )
        return;
      const seedInput = makeRandomSeed();
      const setup = normalizeWorldSetup({
        ...get().setupDraft,
        seed: seedInput,
      });
      try {
        if (typeof window !== 'undefined') writeSetupToLocation(setup);
        applyGeneratedSetup(setup, null);
      } catch {
        set({
          setupError: 'That random setup could not be generated. Try again.',
        });
      }
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
    beginAssignment: () => {
      const state = get();
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
      try {
        const matchSetup = beginTerritoryAssignment(state.planet, {
          ...state.matchSetup,
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
    rerollOwnership: () => {
      const state = get();
      if (
        state.matchSetup.setupPhase !== 'ready' ||
        state.matchSetup.assignmentMode !== 'random'
      )
        return;
      const ownershipVariant = state.matchSetup.ownershipVariant + 1;
      try {
        const startingPosition = generateStartingPosition(
          state.planet,
          state.matchSetup.players,
          ownershipVariant,
        );
        set({
          matchSetup: {
            ...state.matchSetup,
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
      }
    },
    startMatch: () => {
      const state = get();
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
      const match = createMatch(state.planet, state.matchSetup);
      set({
        applicationMode: 'handoff',
        match,
        handoffSummary: { previousTurn: null, messages: [] },
        playerSetupErrors: [],
        assignmentFeedback: null,
        lastActionError: null,
      });
      persist({ ...get(), match, applicationMode: 'handoff' }, 'handoff');
    },
    backToWorldSetup: () =>
      set({ applicationMode: 'world-setup', saveMessage: null }),
    beginTurn: () => {
      const state = get();
      if (!state.match) return;
      const match = {
        ...state.match,
        selectedSourceTerritoryId: null,
        selectedTargetTerritoryId: null,
      };
      set({ applicationMode: 'playing', match, lastActionError: null });
      persist({ ...get(), match, applicationMode: 'playing' }, 'playing');
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
        });
      } else {
        get().rerollOwnership();
        set({ applicationMode: 'pregame', match: null });
      }
    },
    dispatchGameAction: (action) => {
      const state = get();
      if (state.applicationMode !== 'playing' || !state.match) {
        set({
          lastActionError: {
            code: 'WRONG_PHASE',
            message: 'Begin the active player turn before taking game actions.',
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
        handoffSummary = summaryForTurn(result.state, state.match.turnNumber);
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
    saveMatch: () => persist(get()),
    resumeSavedMatch: () => {
      if (typeof window === 'undefined') return;
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
        if (save.generatorVersion !== GENERATOR_VERSION) {
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
        });
        if (parsed.migrated) persist(get(), applicationMode);
      } catch {
        set({ saveError: 'The local session could not be read safely.' });
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
        state.dispatchGameAction(createTerritorySelectionAction(territoryId));
      }
    },
    selectAndFocusTerritory: (territoryId) => {
      const state = get();
      if (state.applicationMode !== 'playing') return;
      state.dispatchGameAction(createTerritorySelectionAction(territoryId));
      set((current) => ({
        focusTargetTerritoryId: territoryId,
        focusSequence: current.focusSequence + 1,
      }));
    },
    toggleDebugView: () => set((state) => ({ debugView: !state.debugView })),
    setViewMode: (viewMode) => set({ viewMode }),
    toggleEventLog: () =>
      set((state) => ({ eventLogOpen: !state.eventLogOpen })),
    focusSelectedTerritory: () =>
      set((state) => {
        const territoryId = selectedTerritory(state);
        return territoryId === null
          ? state
          : {
              focusTargetTerritoryId: territoryId,
              focusSequence: state.focusSequence + 1,
            };
      }),
    setGlobeFocus: (globeFocus) =>
      set((state) =>
        Math.abs(state.globeFocus.longitude - globeFocus.longitude) < 0.01 &&
        Math.abs(state.globeFocus.latitude - globeFocus.latitude) < 0.01
          ? state
          : { globeFocus },
      ),
  };
});
