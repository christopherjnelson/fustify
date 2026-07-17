import { useGameStore } from '../state/useGameStore';
import { SeedControls } from './SeedControls';

export function WorldSetupPanel() {
  const saved = useGameStore((state) => state.savedMatchAvailable);
  const savedAt = useGameStore((state) => state.savedAt);
  const saveError = useGameStore((state) => state.saveError);
  const resume = useGameStore((state) => state.resumeSavedMatch);
  const deleteSave = useGameStore((state) => state.deleteSavedMatch);

  return (
    <aside className="setup-panel" aria-labelledby="world-setup-title">
      <span className="eyebrow">Local hot-seat</span>
      <h1 id="world-setup-title">Configure your world</h1>
      <p>
        The shareable URL stores geography settings only. Player setup and saved
        turns stay in this browser.
      </p>
      {saved && (
        <section className="resume-card" aria-label="Local saved match">
          <strong>Local match available</strong>
          <span>
            {savedAt
              ? `Saved ${new Date(savedAt).toLocaleString()}`
              : 'The save needs recovery.'}
          </span>
          {saveError && <p role="alert">{saveError}</p>}
          <div className="setup-actions">
            <button type="button" onClick={resume} disabled={!savedAt}>
              Resume saved match
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
