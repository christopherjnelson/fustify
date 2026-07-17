import { create } from 'zustand';
import { createMatch } from '../core/game/createMatch';
import { gameReducer } from '../core/game/gameReducer';
import type { GameAction, GameError, MatchState } from '../core/game/types';
import { generatePlanet } from '../core/generation/generatePlanet';
import type { PlanetDefinition } from '../core/types/planet';

const INITIAL_SEED = 'atlas-prime';
const initialPlanet = generatePlanet(INITIAL_SEED);

export type PlanetViewMode = 'ownership' | 'continents' | 'terrain';

interface GameState {
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
  regenerate: () => void;
  randomizeSeed: () => void;
  resetMatch: () => void;
  dispatchGameAction: (action: GameAction) => void;
  setHoveredTerritory: (id: string | null) => void;
  selectTerritory: (id: string | null) => void;
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
  seedInput: INITIAL_SEED,
  planet: initialPlanet,
  match: createMatch(initialPlanet),
  hoveredTerritoryId: null,
  debugView: false,
  viewMode: 'ownership',
  eventLogOpen: false,
  lastActionError: null,
  focusTargetTerritoryId: null,
  focusSequence: 0,
  setSeedInput: (seedInput) => set({ seedInput }),
  regenerate: () => {
    const planet = generatePlanet(get().seedInput);
    set({
      planet,
      match: createMatch(planet),
      seedInput: planet.seed,
      hoveredTerritoryId: null,
      focusTargetTerritoryId: null,
      lastActionError: null,
    });
  },
  randomizeSeed: () => {
    const seedInput = makeRandomSeed();
    const planet = generatePlanet(seedInput);
    set({
      seedInput,
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
    get().dispatchGameAction({ type: 'SELECT_TERRITORY', territoryId }),
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
