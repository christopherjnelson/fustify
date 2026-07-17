import type { ContinentDefinition } from './continent';
import type { TerritoryDefinition } from './territory';

export interface PlanetDefinition {
  seed: string;
  generatorVersion: number;
  territoryCount: number;
  continentCount: number;
  territories: TerritoryDefinition[];
  continents: ContinentDefinition[];
}

export interface PlanetGenerationOptions {
  territoryCount?: number;
  continentCount?: number;
}
