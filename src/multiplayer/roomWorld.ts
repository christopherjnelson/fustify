import { generatePlanet } from '../core/generation/generatePlanet';
import { resolveGeneratorVersion } from '../core/generation/constants';
import { generateReadableWorldSeed } from '../core/generation/readableWorldSeed';
import type { PlanetDefinition } from '../core/types/planet';
import type { Room } from './multiplayerApi';

export type RoomSeedGenerator = () => string;

export function withFreshRoomSeed(
  room: Room,
  generateSeed: RoomSeedGenerator = generateReadableWorldSeed,
): Room {
  return { ...room, seed: generateSeed() };
}

export function generateRoomPreviewPlanet(
  room: Pick<
    Room,
    'seed' | 'territory_count' | 'continent_count' | 'max_seats'
  > &
    Partial<Pick<Room, 'generator_version'>>,
): PlanetDefinition {
  return generatePlanet(room.seed, {
    territoryCount: room.territory_count,
    continentCount: room.continent_count,
    playerCount: room.max_seats,
    generatorVersion: resolveGeneratorVersion(room.generator_version),
  });
}
