import type { PlanetDefinition } from '../core/types/planet';

export const HOME_WORLD_TERRITORY_COUNT = 42;
export const HOME_WORLD_CONTINENT_COUNT = 5;
export const HOME_WORLD_PLAYER_COUNT = 4;

export interface GenerateHomeWorldRequest {
  type: 'generate-home-world';
  requestId: number;
  seed?: string;
}

export type GenerateHomeWorldResponse =
  | {
      type: 'home-world-generated';
      requestId: number;
      planet: PlanetDefinition;
    }
  | {
      type: 'home-world-error';
      requestId: number;
      message: string;
    };
