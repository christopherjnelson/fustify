import { useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { getPlanetSurfaceSphere } from '../core/geometry/planetSurface';
import { PLANET_RADIUS } from '../core/generation/constants';
import type { PlanetDefinition } from '../core/types/planet';
import type { TerritoryDefinition } from '../core/types/territory';
import { PLANET_ROTATION } from '../presentation/globeOrientation';
import { territoryFillColor } from '../presentation/territoryVisuals';
import { PlanetSurfaceMeshes } from './PlanetSurfaceMeshes';
import { SeaRouteOverlay } from './SeaRouteOverlay';
import { TerritoryOverlay } from './TerritoryOverlay';

const NO_LEGAL_TARGETS = new Set<string>();

export function NeutralPlanet({ planet }: { planet: PlanetDefinition }) {
  const sphere = useMemo(() => getPlanetSurfaceSphere(planet), [planet]);
  const territoryColor = useCallback(
    (territory: TerritoryDefinition) =>
      territoryFillColor(territory, null, 'ownership', false, null),
    [],
  );

  return (
    <group rotation={PLANET_ROTATION}>
      <PlanetSurfaceMeshes
        planet={planet}
        sphere={sphere}
        territoryColor={territoryColor}
      />
      <TerritoryOverlay
        sphere={sphere}
        surfaceCells={planet.surfaceCells}
        territories={planet.territories}
        emphasized={false}
      />
      <SeaRouteOverlay
        planet={planet}
        selectedTerritoryId={null}
        legalTargetIds={NO_LEGAL_TARGETS}
        debugView={false}
        showNeutralPreviewRoutes
      />
      <mesh scale={1.045}>
        <sphereGeometry args={[PLANET_RADIUS, 48, 32]} />
        <meshBasicMaterial
          color="#69b9df"
          transparent
          opacity={0.055}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
