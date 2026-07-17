export type TerrainType = 'land' | 'ocean';

export interface SurfaceCellDefinition {
  id: number;
  terrainType: TerrainType;
  territoryId: string | null;
}

export interface LandmassDefinition {
  id: string;
  territoryIds: string[];
}

export type TerritoryConnectionType = 'land-border' | 'sea-route';

export interface TerritoryConnection {
  fromTerritoryId: string;
  toTerritoryId: string;
  type: TerritoryConnectionType;
}
