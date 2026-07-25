import { PLANET_SUBDIVISIONS } from '../generation/constants.ts';
import type { PlanetDefinition } from '../types/planet.ts';
import { createIcosphere, type IcosphereData } from './icosphere.ts';

export function getPlanetSurfaceSphere(
  planet: Pick<PlanetDefinition, 'surfaceVertices'>,
): IcosphereData {
  const base = createIcosphere(PLANET_SUBDIVISIONS);
  return planet.surfaceVertices
    ? { faces: base.faces, vertices: planet.surfaceVertices }
    : base;
}
