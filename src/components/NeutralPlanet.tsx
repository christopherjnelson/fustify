import { useCallback, useMemo } from 'react';
import { getPlanetSurfaceSphere } from '../core/geometry/planetSurface';
import type { PlanetDefinition } from '../core/types/planet';
import type { TerritoryDefinition } from '../core/types/territory';
import { PLANET_ROTATION } from '../presentation/globeOrientation';
import { territoryFillColor } from '../presentation/territoryVisuals';
import { PlanetSurfaceMeshes } from './PlanetSurfaceMeshes';
import { GlobeAtmosphere } from './GlobeAppearance';
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
      <GlobeAtmosphere />
    </group>
  );
}
