import { useMemo } from 'react';
import {
  getProjectedWorldGeometry,
  type ProjectedPoint,
} from '../core/minimap/projection';
import type { PlanetDefinition } from '../core/types/planet';
import { MinimapContinentLabels } from '../components/MinimapContinentLabels';

function format(value: number): number {
  return Number(value.toFixed(3));
}

function polygonPath(fragments: readonly { points: ProjectedPoint[] }[]) {
  return fragments
    .map(
      ({ points }) =>
        `M ${points.map(({ x, y }) => `${format(x)} ${format(y)}`).join(' L ')} Z`,
    )
    .join(' ');
}

function linePath(fragments: readonly ProjectedPoint[][]) {
  return fragments
    .map(
      (points) =>
        `M ${points.map(({ x, y }) => `${format(x)} ${format(y)}`).join(' L ')}`,
    )
    .join(' ');
}

export function ReadonlyMinimap({
  planet,
  className = '',
}: {
  planet: PlanetDefinition;
  className?: string;
}) {
  const geometry = useMemo(() => getProjectedWorldGeometry(planet), [planet]);
  const territoryById = useMemo(
    () =>
      new Map(planet.territories.map((territory) => [territory.id, territory])),
    [planet.territories],
  );
  const boundaryPath = (kind: 'territory' | 'continent' | 'coastline') =>
    linePath(
      geometry.boundaries
        .filter((boundary) => boundary.kind === kind)
        .map((boundary) => boundary.points),
    );
  return (
    <section
      className={`minimap-panel multiplayer-minimap ${className}`.trim()}
      aria-labelledby="multiplayer-minimap-title"
      data-testid="multiplayer-minimap"
    >
      <header className="minimap-heading">
        <div>
          <span className="eyebrow">Synchronized overview</span>
          <strong id="multiplayer-minimap-title">World minimap</strong>
        </div>
        <span className="minimap-readonly">Read-only</span>
      </header>
      <svg
        className="minimap-map"
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <rect className="minimap-ocean" width="360" height="180" rx="3" />
        <g className="minimap-territories">
          {geometry.territories.map((territory) => (
            <path
              key={territory.territoryId}
              d={polygonPath(territory.fragments)}
              fill={territoryById.get(territory.territoryId)!.displayColor}
              stroke={territoryById.get(territory.territoryId)!.displayColor}
              data-territory-id={territory.territoryId}
            />
          ))}
        </g>
        <g className="minimap-routes">
          {geometry.routes.map((route) => (
            <path key={route.routeId} d={linePath(route.fragments)} />
          ))}
        </g>
        <path className="minimap-boundaries" d={boundaryPath('territory')} />
        <path
          className="minimap-continent-boundaries"
          d={boundaryPath('continent')}
        />
        <path className="minimap-coastlines" d={boundaryPath('coastline')} />
        <MinimapContinentLabels planet={planet} />
      </svg>
    </section>
  );
}
