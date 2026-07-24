import type { PlanetViewMode } from '../state/useGameStore';

export type PlayerViewMode = Exclude<PlanetViewMode, 'terrain'>;

export const PLAYER_VIEW_MODES: readonly {
  id: PlayerViewMode;
  label: string;
}[] = [
  { id: 'ownership', label: 'Ownership' },
  { id: 'continents', label: 'Continents' },
];

export function playerViewMode(viewMode: PlanetViewMode): PlayerViewMode {
  return viewMode === 'terrain' ? 'ownership' : viewMode;
}
