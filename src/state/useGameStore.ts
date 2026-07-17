import { create } from 'zustand';
import { createMatch } from '../core/game/createMatch';
import { gameReducer } from '../core/game/gameReducer';
import type { GameAction, GameError, MatchState } from '../core/game/types';
import { generatePlanet } from '../core/generation/generatePlanet';
import {
  DEFAULT_WORLD_SETUP,
  normalizeWorldSetup,
  type WorldSetup,
  worldSetupsEqual,
} from '../core/setup/worldSetup';
import type { PlanetDefinition } from '../core/types/planet';
import { createTerritorySelectionAction } from '../core/navigation/territoryNavigator';
import {
  readSetupFromLocation,
  writeSetupToLocation,
} from '../browser/setupUrl';

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

export type PlanetViewMode = 'ownership' | 'continents' | 'terrain';

interface GameState {
  setup: WorldSetup;
  setupDraft: WorldSetup;
  setupWarning: string | null;
  setupError: string | null;
  seedInput: string;
  planet: PlanetDefinition;
  match: MatchState;
  hoveredTerritoryId: string | null;
  debugView: boolean;
  viewMode: PlanetViewMode;
  eventLogOpen: boolean;
  lastActionError: GameError | null;
  focusTargetTerritoryId: string | null;
  focusSequence: number;
  setSeedInput: (seed: string) => void;
  setSetupDraft: (update: Partial<WorldSetup>) => void;
  regenerate: () => void;
  randomizeSeed: () => void;
  loadSetupFromUrl: () => void;
  resetMatch: () => void;
  dispatchGameAction: (action: GameAction) => void;
  setHoveredTerritory: (id: string | null) => void;
  selectTerritory: (id: string | null) => void;
  selectAndFocusTerritory: (id: string) => void;
  toggleDebugView: () => void;
  setViewMode: (mode: PlanetViewMode) => void;
  toggleEventLog: () => void;
  focusSelectedTerritory: () => void;
}

function makeRandomSeed(): string {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return `world-${values[0]!.toString(36)}-${values[1]!.toString(36)}`;
}

function selectedTerritory(state: GameState): string | null {
  return (
    state.match.selectedTargetTerritoryId ??
    state.match.selectedSourceTerritoryId
  );
}

export const useGameStore = create<GameState>((set, get) => ({
  setup: initialSetup,
  setupDraft: initialSetup,
  setupWarning: initialWarning,
  setupError: null,
  seedInput: initialSetup.seed,
  planet: initialPlanet,
  match: createMatch(initialPlanet),
  hoveredTerritoryId: null,
  debugView: false,
  viewMode: 'ownership',
  eventLogOpen: false,
  lastActionError: null,
  focusTargetTerritoryId: null,
  focusSequence: 0,
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
    const requestedSetup = {
      ...get().setupDraft,
      seed: get().seedInput,
    };
    const setup = normalizeWorldSetup(requestedSetup);
    const setupWarning = worldSetupsEqual(setup, requestedSetup)
      ? null
      : 'Setup values were normalized to the supported ranges.';
    try {
      const planet = generateSetupPlanet(setup);
      if (typeof window !== 'undefined') writeSetupToLocation(setup);
      set({
        setup,
        setupDraft: setup,
        setupWarning,
        setupError: null,
        planet,
        match: createMatch(planet),
        seedInput: planet.seed,
        hoveredTerritoryId: null,
        focusTargetTerritoryId: null,
        lastActionError: null,
      });
    } catch (error) {
      set({
        setupError:
          error instanceof Error ? error.message : 'Could not generate world.',
      });
    }
  },
  randomizeSeed: () => {
    const seedInput = makeRandomSeed();
    const setup = normalizeWorldSetup({ ...get().setupDraft, seed: seedInput });
    try {
      const planet = generateSetupPlanet(setup);
      if (typeof window !== 'undefined') writeSetupToLocation(setup);
      set({
        setup,
        setupDraft: setup,
        setupWarning: null,
        setupError: null,
        seedInput,
        planet,
        match: createMatch(planet),
        hoveredTerritoryId: null,
        focusTargetTerritoryId: null,
        lastActionError: null,
      });
    } catch {
      set({
        setupError: 'That random setup could not be generated. Try again.',
      });
    }
  },
  loadSetupFromUrl: () => {
    if (typeof window === 'undefined') return;
    const parsed = readSetupFromLocation();
    let setup = parsed.setup;
    let warning = parsed.warning;
    let planet: PlanetDefinition;
    try {
      planet = generateSetupPlanet(setup);
    } catch {
      setup = { ...DEFAULT_WORLD_SETUP };
      warning =
        'The requested setup could not be generated; defaults were loaded.';
      planet = generateSetupPlanet(setup);
    }
    set({
      setup,
      setupDraft: setup,
      setupWarning: warning,
      setupError: null,
      seedInput: setup.seed,
      planet,
      match: createMatch(planet),
      hoveredTerritoryId: null,
      focusTargetTerritoryId: null,
      lastActionError: null,
    });
  },
  resetMatch: () => {
    const result = gameReducer(get().planet, get().match, {
      type: 'RESET_MATCH',
    });
    set({ match: result.state, lastActionError: result.error });
  },
  dispatchGameAction: (action) => {
    const result = gameReducer(get().planet, get().match, action);
    set({ match: result.state, lastActionError: result.error });
  },
  setHoveredTerritory: (hoveredTerritoryId) =>
    set((state) =>
      state.hoveredTerritoryId === hoveredTerritoryId
        ? state
        : { hoveredTerritoryId },
    ),
  selectTerritory: (territoryId) =>
    get().dispatchGameAction(createTerritorySelectionAction(territoryId)),
  selectAndFocusTerritory: (territoryId) => {
    get().dispatchGameAction(createTerritorySelectionAction(territoryId));
    set((state) => ({
      focusTargetTerritoryId: territoryId,
      focusSequence: state.focusSequence + 1,
    }));
  },
  toggleDebugView: () => set((state) => ({ debugView: !state.debugView })),
  setViewMode: (viewMode) => set({ viewMode }),
  toggleEventLog: () => set((state) => ({ eventLogOpen: !state.eventLogOpen })),
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
}));
