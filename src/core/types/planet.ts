import type { ContinentDefinition } from './continent.ts';
import type { StrategicGraphAnalysis } from './analysis.ts';
import type { PlayerDefinition } from './player.ts';
import type { TerritoryDefinition } from './territory.ts';
import type { Vector3Tuple } from './territory.ts';
import type {
  GenerationDiagnostics,
  GenerationTimingObserver,
} from './generation.ts';
import type { WorldGeneratorVersion } from '../generation/constants.ts';
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
  /**
   * Version-4 worlds can conservatively move the fixed topology's shared
   * vertices. Absence means the immutable subdivision-4 icosphere vertices.
   */
  surfaceVertices?: Vector3Tuple[];
  /** Deterministic experimental diagnostics; omitted from v1 planets. */
  generationDiagnostics?: GenerationDiagnostics;
}

export interface PlanetGenerationOptions {
  territoryCount?: number;
  continentCount?: number;
  landCoverage?: number;
  playerCount?: number;
  generatorVersion?: WorldGeneratorVersion;
  /** Reporting-only wall-clock observer; never affects generated data. */
  timingObserver?: GenerationTimingObserver;
}
