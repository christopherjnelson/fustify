import { validatePlanet } from '../core/generation/validatePlanet';
import { useGameStore } from '../state/useGameStore';
import { SeedControls } from './SeedControls';

export function TerritoryHud() {
  const planet = useGameStore((state) => state.planet);
  const selectedId = useGameStore((state) => state.selectedTerritoryId);
  const debugView = useGameStore((state) => state.debugView);
  const toggleDebug = useGameStore((state) => state.toggleDebugView);
  const focusSelected = useGameStore((state) => state.focusSelectedTerritory);
  const selected = planet.territories.find((item) => item.id === selectedId);
  const continent = planet.continents.find(
    (item) => item.id === selected?.continentId,
  );
  const owner = planet.players.find(
    (player) => player.id === selected?.ownerId,
  );
  const territoryById = new Map(
    planet.territories.map((territory) => [territory.id, territory]),
  );
  const selectedMetric = planet.analysis.territoryMetrics.find(
    (metric) => metric.territoryId === selectedId,
  );
  const validation = validatePlanet(planet);
  const seaRoutes = planet.connections.filter(
    (connection) => connection.type === 'sea-route',
  );
  const selectedConnections = selected
    ? planet.connections.filter(
        (connection) =>
          connection.fromTerritoryId === selected.id ||
          connection.toTerritoryId === selected.id,
      )
    : [];
  const neighborId = (connection: (typeof planet.connections)[number]) =>
    connection.fromTerritoryId === selectedId
      ? connection.toTerritoryId
      : connection.fromTerritoryId;

  return (
    <aside className="hud" aria-label="Planet information">
      <div className="hud-heading">
        <div>
          <span className="eyebrow">Procedural world</span>
          <h1>Globe Risk</h1>
        </div>
        <button
          type="button"
          className={`icon-button ${debugView ? 'active' : ''}`}
          onClick={toggleDebug}
          aria-pressed={debugView}
          title="Toggle graph analysis and strategic overlays"
        >
          Debug
        </button>
      </div>

      <SeedControls />

      <div className="metrics">
        <div>
          <strong>{planet.territoryCount}</strong>
          <span>Territories</span>
        </div>
        <div>
          <strong>{planet.continentCount}</strong>
          <span>Continents</span>
        </div>
        <div>
          <strong>{Math.round(planet.landCoverage * 100)}%</strong>
          <span>Land</span>
        </div>
        <div>
          <strong>{planet.landmasses.length}</strong>
          <span>Landmasses</span>
        </div>
        <div>
          <strong>{seaRoutes.length}</strong>
          <span>Sea routes</span>
        </div>
        <div>
          <strong className={validation.valid ? 'valid' : 'invalid'}>
            {validation.valid ? 'Connected' : 'Invalid'}
          </strong>
          <span>Graph status</span>
        </div>
      </div>

      <section className="selection-card" aria-live="polite">
        {selected ? (
          <>
            <div className="territory-title">
              <span
                className="color-swatch"
                style={{ background: owner?.color ?? selected.displayColor }}
              />
              <div>
                <span className="eyebrow">Selected territory</span>
                <h2>{selected.name}</h2>
              </div>
              <button
                type="button"
                className="focus-button"
                onClick={focusSelected}
              >
                Focus
              </button>
            </div>
            <dl>
              <div>
                <dt>ID</dt>
                <dd>{selected.id}</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{owner?.name ?? selected.ownerId}</dd>
              </div>
              <div>
                <dt>Armies</dt>
                <dd>{selected.armyCount}</dd>
              </div>
              <div>
                <dt>Continent</dt>
                <dd>{continent?.name ?? selected.continentId}</dd>
              </div>
              <div>
                <dt>Bonus</dt>
                <dd>+{continent?.bonus ?? 0} placeholder</dd>
              </div>
              <div>
                <dt>Landmass</dt>
                <dd>{selected.landmassId}</dd>
              </div>
              <div>
                <dt>Degree</dt>
                <dd>
                  {selectedMetric?.degree ??
                    selected.adjacentTerritoryIds.length}
                </dd>
              </div>
              <div>
                <dt>Gateway</dt>
                <dd>{selectedMetric?.isGateway ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt>Articulation</dt>
                <dd>{selectedMetric?.isArticulationPoint ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
            <div className="neighbors">
              <h3>Land-border neighbors</h3>
              <ul>
                {selectedConnections
                  .filter((connection) => connection.type === 'land-border')
                  .map((connection) => {
                    const id = neighborId(connection);
                    return (
                      <li key={id}>{territoryById.get(id)?.name ?? id}</li>
                    );
                  })}
              </ul>
              <h3>Sea-route neighbors</h3>
              <ul>
                {selectedConnections
                  .filter((connection) => connection.type === 'sea-route')
                  .map((connection) => {
                    const id = neighborId(connection);
                    const isBridge =
                      planet.analysis.seaRouteBridgeConnections.some(
                        (bridge) =>
                          (bridge.fromTerritoryId === selected.id &&
                            bridge.toTerritoryId === id) ||
                          (bridge.toTerritoryId === selected.id &&
                            bridge.fromTerritoryId === id),
                      );
                    return (
                      <li key={id} className="sea-neighbor">
                        ⌁ {territoryById.get(id)?.name ?? id}
                        {isBridge ? ' · bridge' : ' · redundant'}
                      </li>
                    );
                  })}
              </ul>
            </div>
          </>
        ) : (
          <div className="empty-selection">
            <div className="globe-glyph" aria-hidden="true">
              ◎
            </div>
            <h2>Select a territory</h2>
            <p>Drag to rotate, scroll to zoom, and click any colored region.</p>
          </div>
        )}
      </section>

      {debugView && (
        <section className="debug-panel">
          <div className="debug-heading">
            <span className="eyebrow">Graph analysis</span>
            <span>{validation.warnings.length} warnings</span>
          </div>
          <dl>
            <div>
              <dt>Articulation points</dt>
              <dd>{planet.analysis.articulationTerritoryIds.length}</dd>
            </div>
            <div>
              <dt>Graph bridges</dt>
              <dd>{planet.analysis.bridgeConnections.length}</dd>
            </div>
            <div>
              <dt>Sea-route bridges</dt>
              <dd>{planet.analysis.seaRouteBridgeConnections.length}</dd>
            </div>
            <div>
              <dt>Gateway territories</dt>
              <dd>{planet.analysis.gatewayTerritoryIds.length}</dd>
            </div>
            <div>
              <dt>Route redundancy</dt>
              <dd>{planet.analysis.routeRedundancy}</dd>
            </div>
          </dl>
          <h3>Continent gateways / cohesion</h3>
          <ul className="debug-list">
            {planet.continents.map((item) => {
              const cohesion = planet.analysis.continentCohesionMetrics.find(
                (metric) => metric.continentId === item.id,
              )!;
              return (
                <li key={item.id}>
                  <span>{item.name}</span>
                  <strong>
                    {item.externalGatewayTerritoryIds.length} /{' '}
                    {Math.round(cohesion.cohesionScore * 100)}%
                  </strong>
                </li>
              );
            })}
          </ul>
          <h3>Player totals</h3>
          <ul className="debug-list">
            {planet.players.map((player) => {
              const owned = planet.territories.filter(
                (territory) => territory.ownerId === player.id,
              );
              return (
                <li key={player.id}>
                  <span>
                    <i style={{ background: player.color }} /> {player.name}
                  </span>
                  <strong>
                    {owned.length} territories ·{' '}
                    {owned.reduce(
                      (sum, territory) => sum + territory.armyCount,
                      0,
                    )}{' '}
                    armies
                  </strong>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </aside>
  );
}
