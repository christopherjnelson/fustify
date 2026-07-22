import { useMemo, type CSSProperties } from 'react';
import {
  getProjectedWorldGeometry,
  projectGeographicPoint,
  wrapLongitude,
  type ProjectedPoint,
} from '../core/minimap/projection';
import { playerColorValue } from '../core/setup/playerConfig';
import { minimapTerritoryStyles } from '../presentation/territoryVisuals';
import { useGameStore } from '../state/useGameStore';

function format(value: number) {
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

export function Minimap() {
  const planet = useGameStore((state) => state.planet);
  const matchSetup = useGameStore((state) => state.matchSetup);
  const match = useGameStore((state) => state.match);
  const focus = useGameStore((state) => state.globeFocus);
  const geometry = useMemo(() => getProjectedWorldGeometry(planet), [planet]);
  const styles = useMemo(
    () => minimapTerritoryStyles(planet, matchSetup, match),
    [match, matchSetup, planet],
  );
  const styleByTerritory = useMemo(
    () => new Map(styles.map((style) => [style.territoryId, style])),
    [styles],
  );
  const territoryPaths = useMemo(
    () =>
      new Map(
        geometry.territories.map((territory) => [
          territory.territoryId,
          polygonPath(territory.fragments),
        ]),
      ),
    [geometry],
  );
  const routePaths = useMemo(
    () =>
      new Map(
        geometry.routes.map((route) => [
          route.routeId,
          linePath(route.fragments),
        ]),
      ),
    [geometry],
  );
  const boundaryPaths = useMemo(
    () =>
      new Map(
        (['territory', 'continent', 'coastline'] as const).map((kind) => [
          kind,
          linePath(
            geometry.boundaries
              .filter((boundary) => boundary.kind === kind)
              .map((boundary) => boundary.points),
          ),
        ]),
      ),
    [geometry],
  );
  const focusPoint = projectGeographicPoint({
    longitude: wrapLongitude(focus.longitude),
    latitude: focus.latitude,
  });
  const assignedCount = styles.filter((style) => style.ownerId !== null).length;
  const activePlayer = match
    ? matchSetup.players.find((player) => player.id === match.activePlayerId)
    : null;

  return (
    <section
      className="minimap-panel"
      aria-labelledby="minimap-title"
      aria-describedby="minimap-description"
      data-testid="minimap"
    >
      <header className="minimap-heading">
        <div>
          <span className="eyebrow">Strategic overview</span>
          <strong id="minimap-title">World minimap</strong>
        </div>
        {activePlayer ? (
          <span
            className="minimap-active-player"
            style={
              {
                '--active-player-color': playerColorValue(activePlayer.colorId),
              } as CSSProperties
            }
          >
            <i aria-hidden="true" />
            {activePlayer.name}
          </span>
        ) : (
          <span className="minimap-readonly">Read-only</span>
        )}
      </header>
      <p id="minimap-description" className="sr-only">
        Read-only equirectangular overview of {planet.territoryCount} canonical
        territories. {assignedCount} territories currently have player owners.
        The crosshair marks the point centered on the globe.
      </p>
      <svg
        className="minimap-map"
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
      >
        <rect className="minimap-ocean" width="360" height="180" rx="3" />
        <g className="minimap-territories">
          {geometry.territories.map((territory) => {
            const style = styleByTerritory.get(territory.territoryId)!;
            return (
              <path
                key={territory.territoryId}
                d={territoryPaths.get(territory.territoryId)}
                fill={style.fill}
                stroke={style.fill}
                data-territory-id={territory.territoryId}
                data-continent-id={territory.continentId}
                data-owner-id={style.ownerId ?? ''}
                data-fragment-count={territory.fragments.length}
                data-active={style.active ? 'true' : 'false'}
              />
            );
          })}
        </g>
        <g className="minimap-routes">
          {geometry.routes.map((route) => (
            <path
              key={route.routeId}
              d={routePaths.get(route.routeId)}
              data-route-id={route.routeId}
              data-from-territory-id={route.fromTerritoryId}
              data-to-territory-id={route.toTerritoryId}
              data-fragment-count={route.fragments.length}
            />
          ))}
        </g>
        <path
          className="minimap-boundaries"
          d={boundaryPaths.get('territory')}
        />
        <path
          className="minimap-continent-boundaries"
          d={boundaryPaths.get('continent')}
        />
        <path
          className="minimap-coastlines"
          d={boundaryPaths.get('coastline')}
        />
        <g
          className="minimap-focus"
          transform={`translate(${format(focusPoint.x)} ${format(focusPoint.y)})`}
          data-longitude={format(wrapLongitude(focus.longitude))}
          data-latitude={format(focus.latitude)}
        >
          <circle r="6" />
          <path d="M -9 0 H -3 M 3 0 H 9 M 0 -9 V -3 M 0 3 V 9" />
          <circle r="1.25" className="minimap-focus-center" />
        </g>
      </svg>
    </section>
  );
}
