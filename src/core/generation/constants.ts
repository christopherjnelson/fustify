export const GENERATOR_VERSION = 3;
export const DEFAULT_TERRITORY_COUNT = 42;
// Engine compatibility default for canonical fixtures and legacy callers.
// Product creation flows use DEFAULT_NEW_CONTINENT_COUNT instead.
export const DEFAULT_CONTINENT_COUNT = 6;
export const DEFAULT_PLAYER_COUNT = 4;
export const MIN_PLACEHOLDER_ARMIES = 2;
export const MAX_PLACEHOLDER_ARMIES = 9;
export const PLANET_RADIUS = 2;
export const PLANET_SUBDIVISIONS = 4;
export const DEFAULT_LAND_COVERAGE = 0.52;
export const MIN_LAND_COVERAGE = 0.45;
export const MAX_LAND_COVERAGE = 0.6;
export const MIN_SUBSTANTIAL_LANDMASSES = 4;
export const MAX_SUBSTANTIAL_LANDMASSES = 8;
export const OCEAN_COLOR = '#174c70';

export const PLAYER_PALETTE = [
  '#e24f4f',
  '#3f91e8',
  '#e1a83b',
  '#55ad68',
  '#9a68d7',
  '#de6ca7',
] as const;

export const CONTINENT_PALETTE = [
  '#2f7db8',
  '#c4684d',
  '#5e9d62',
  '#b88a3c',
  '#886ab2',
  '#3e9d98',
  '#b45f86',
  '#768d42',
] as const;
