import type { ContinentDefinition } from './continent.ts';
import type { StrategicGraphAnalysis } from './analysis.ts';
import type { PlayerDefinition } from './player.ts';
import type { TerritoryDefinition } from './territory.ts';
import type {
  LandmassDefinition,
  SurfaceCellDefinition,
  TerritoryConnection,
} from './surface.ts';

export interface PlanetDefinition {
  seed: string;
  generatorVersion: number;
  territoryCount: number;
  continentCount: number;
  playerCount: number;
  players: PlayerDefinition[];
  territories: TerritoryDefinition[];
  continents: ContinentDefinition[];
  surfaceCells: SurfaceCellDefinition[];
  landmasses: LandmassDefinition[];
  connections: TerritoryConnection[];
  landCoverage: number;
  analysis: StrategicGraphAnalysis;
}

export interface PlanetGenerationOptions {
  territoryCount?: number;
  continentCount?: number;
  landCoverage?: number;
  playerCount?: number;
}
