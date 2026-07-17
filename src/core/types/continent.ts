export interface ContinentDefinition {
  id: string;
  name: string;
  territoryIds: string[];
  bonus: number;
  externalGatewayTerritoryIds: string[];
  neighboringContinentIds: string[];
}
