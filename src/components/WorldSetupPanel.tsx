import { useGameStore } from '../state/useGameStore';
import { SeedControls } from './SeedControls';

export function WorldSetupPanel() {
  const saved = useGameStore((state) => state.savedMatchAvailable);
  const savedAt = useGameStore((state) => state.savedAt);
  const saveError = useGameStore((state) => state.saveError);
  const resume = useGameStore((state) => state.resumeSavedMatch);
  const deleteSave = useGameStore((state) => state.deleteSavedMatch);
  const operation = useGameStore((state) => state.setupOperation);

  return (
    <aside
      className={`setup-panel ${operation ? 'is-busy' : ''}`}
      aria-labelledby="world-setup-title"
      aria-busy={operation !== null}
    >
      <span className="eyebrow">Local hot-seat</span>
      <h1 id="world-setup-title">Choose your world</h1>
      <p>
        Generate neutral worlds until the globe and minimap show the world you
        want to play. Type a custom seed and press Enter to use it.
      </p>
      {saved && (
        <section className="resume-card" aria-label="Local saved session">
          <strong>Local session available</strong>
          <span>
            {savedAt
              ? `Saved ${new Date(savedAt).toLocaleString()}`
              : 'The save needs recovery.'}
          </span>
          {saveError && <p role="alert">{saveError}</p>}
          <div className="setup-actions">
            <button
              type="button"
              onClick={() => void resume()}
              disabled={!savedAt || operation !== null}
              aria-busy={operation === 'restore-game'}
            >
              {operation === 'restore-game'
                ? 'Restoring…'
                : 'Resume saved session'}
            </button>
            <button type="button" className="secondary" onClick={deleteSave}>
              Delete save
            </button>
          </div>
        </section>
      )}
      <SeedControls />
    </aside>
  );
}
