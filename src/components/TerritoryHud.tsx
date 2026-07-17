import { validatePlanet } from '../core/generation/validatePlanet';
import { useGameStore } from '../state/useGameStore';
import { SeedControls } from './SeedControls';

export function TerritoryHud() {
  const planet = useGameStore((state) => state.planet);
  const selectedId = useGameStore((state) => state.selectedTerritoryId);
  const debugView = useGameStore((state) => state.debugView);
  const toggleDebug = useGameStore((state) => state.toggleDebugView);
  const selected = planet.territories.find((item) => item.id === selectedId);
  const continent = planet.continents.find(
    (item) => item.id === selected?.continentId,
  );
  const territoryById = new Map(
    planet.territories.map((territory) => [territory.id, territory]),
  );
  const validation = validatePlanet(planet);

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
          title="Toggle high-contrast borders"
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
                style={{ background: selected.displayColor }}
              />
              <div>
                <span className="eyebrow">Selected territory</span>
                <h2>{selected.name}</h2>
              </div>
            </div>
            <dl>
              <div>
                <dt>ID</dt>
                <dd>{selected.id}</dd>
              </div>
              <div>
                <dt>Continent</dt>
                <dd>{continent?.name ?? selected.continentId}</dd>
              </div>
              <div>
                <dt>Armies</dt>
                <dd>{selected.armyCount}</dd>
              </div>
              <div>
                <dt>Adjacent</dt>
                <dd>{selected.adjacentTerritoryIds.length}</dd>
              </div>
            </dl>
            <div className="neighbors">
              <h3>Bordering territories</h3>
              <ul>
                {selected.adjacentTerritoryIds.map((id) => (
                  <li key={id}>{territoryById.get(id)?.name ?? id}</li>
                ))}
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
    </aside>
  );
}
