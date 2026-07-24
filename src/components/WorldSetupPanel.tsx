import { useGameStore } from '../state/useGameStore';
import { SeedControls } from './SeedControls';
import {
  GameSetupShell,
  SetupSummary,
  SetupWorldPanel,
} from './setup/GameSetup';

export function WorldSetupPanel() {
  const saved = useGameStore((state) => state.savedMatchAvailable);
  const savedAt = useGameStore((state) => state.savedAt);
  const saveError = useGameStore((state) => state.saveError);
  const resume = useGameStore((state) => state.resumeSavedMatch);
  const deleteSave = useGameStore((state) => state.deleteSavedMatch);
  const operation = useGameStore((state) => state.setupOperation);

  return (
    <GameSetupShell
      as="aside"
      variant="overlay"
      ariaLabelledBy="world-setup-title"
      busy={operation !== null}
      eyebrow="Local hot-seat"
      title="Choose your world"
      summary={
        <>
          <p className="local-setup-intro">
            Generate neutral worlds until the globe and minimap show the world
            you want to play. Type a custom seed and press Enter to use it.
          </p>
          {saved && (
            <SetupSummary label="Local saved session">
              <div className="resume-card-content">
                <strong>Local session available</strong>
                <span>
                  {savedAt
                    ? `Saved ${new Date(savedAt).toLocaleString()}`
                    : 'The save needs recovery.'}
                </span>
                {saveError && <p role="alert">{saveError}</p>}
              </div>
              <div className="resume-card-actions">
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
                <button
                  type="button"
                  className="secondary"
                  onClick={deleteSave}
                >
                  Delete save
                </button>
              </div>
            </SetupSummary>
          )}
        </>
      }
      world={
        <SetupWorldPanel title="World settings" controls={<SeedControls />} />
      }
    />
  );
}
