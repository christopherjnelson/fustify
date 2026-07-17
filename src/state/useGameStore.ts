import { create } from 'zustand';
import { generatePlanet } from '../core/generation/generatePlanet';
import type { PlanetDefinition } from '../core/types/planet';

const INITIAL_SEED = 'atlas-prime';

interface GameState {
  seedInput: string;
  planet: PlanetDefinition;
  hoveredTerritoryId: string | null;
  selectedTerritoryId: string | null;
  debugView: boolean;
  setSeedInput: (seed: string) => void;
  regenerate: () => void;
  randomizeSeed: () => void;
  setHoveredTerritory: (id: string | null) => void;
  selectTerritory: (id: string | null) => void;
  toggleDebugView: () => void;
}

function makeRandomSeed(): string {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return `world-${values[0]!.toString(36)}-${values[1]!.toString(36)}`;
}

export const useGameStore = create<GameState>((set, get) => ({
  seedInput: INITIAL_SEED,
  planet: generatePlanet(INITIAL_SEED),
  hoveredTerritoryId: null,
  selectedTerritoryId: null,
  debugView: false,
  setSeedInput: (seedInput) => set({ seedInput }),
  regenerate: () => {
    const planet = generatePlanet(get().seedInput);
    set({
      planet,
      seedInput: planet.seed,
      hoveredTerritoryId: null,
      selectedTerritoryId: null,
    });
  },
  randomizeSeed: () => {
    const seedInput = makeRandomSeed();
    set({
      seedInput,
      planet: generatePlanet(seedInput),
      hoveredTerritoryId: null,
      selectedTerritoryId: null,
    });
  },
  setHoveredTerritory: (hoveredTerritoryId) =>
    set((state) =>
      state.hoveredTerritoryId === hoveredTerritoryId
        ? state
        : { hoveredTerritoryId },
    ),
  selectTerritory: (selectedTerritoryId) => set({ selectedTerritoryId }),
  toggleDebugView: () => set((state) => ({ debugView: !state.debugView })),
}));
