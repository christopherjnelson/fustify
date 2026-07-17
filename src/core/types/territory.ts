export type Vector3Tuple = [number, number, number];

export interface TerritoryDefinition {
  id: string;
  name: string;
  center: Vector3Tuple;
  continentId: string;
  displayColor: string;
  adjacentTerritoryIds: string[];
  ownerId: string | null;
  armyCount: number;
  cellCount: number;
  landmassId: string;
}
