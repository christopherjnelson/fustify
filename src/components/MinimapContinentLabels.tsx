import { useMemo } from 'react';
import type { PlanetDefinition } from '../core/types/planet';
import {
  getContinentLabelAnchors,
  layoutMinimapContinentLabels,
} from '../presentation/continentLabels';

function format(value: number): number {
  return Number(value.toFixed(3));
}

export function MinimapContinentLabels({
  planet,
}: {
  planet: PlanetDefinition;
}) {
  const labels = useMemo(
    () => layoutMinimapContinentLabels(getContinentLabelAnchors(planet)),
    [planet],
  );

  return (
    <g className="minimap-continent-labels" aria-hidden="true">
      {labels.map((label) => (
        <text
          key={label.continentId}
          x={format(label.point.x)}
          y={format(label.point.y)}
          fontSize={format(label.fontSize)}
          data-continent-label={label.continentId}
          data-anchor-territory-id={label.territoryId}
        >
          {label.name}
        </text>
      ))}
    </g>
  );
}
