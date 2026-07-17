import type { ContinentDefinition } from './continent';
import type { StrategicGraphAnalysis } from './analysis';
import type { PlayerDefinition } from './player';
import type { TerritoryDefinition } from './territory';
import type {
  LandmassDefinition,
  SurfaceCellDefinition,
  TerritoryConnection,
} from './surface';

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
