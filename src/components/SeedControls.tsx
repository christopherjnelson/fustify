import type { FormEvent } from 'react';
import {
  MAX_NEW_CONTINENT_COUNT,
  MAX_TERRITORY_COUNT,
  MIN_CONTINENT_COUNT,
  MIN_TERRITORY_COUNT,
} from '../core/setup/worldSetup';
import { useGameStore } from '../state/useGameStore';

export function SeedControls() {
  const seedInput = useGameStore((state) => state.seedInput);
  const setSeedInput = useGameStore((state) => state.setSeedInput);
  const setup = useGameStore((state) => state.setup);
  const draft = useGameStore((state) => state.setupDraft);
  const setDraft = useGameStore((state) => state.setSetupDraft);
  const warning = useGameStore((state) => state.setupWarning);
  const error = useGameStore((state) => state.setupError);
  const applySeed = useGameStore((state) => state.applySeed);
  const generateWorld = useGameStore((state) => state.generateWorld);
  const continueToMatchSetup = useGameStore(
    (state) => state.continueToMatchSetup,
  );
  const operation = useGameStore((state) => state.setupOperation);
  const generating =
    operation === 'apply-seed' || operation === 'generate-world';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void applySeed();
  };

  return (
    <form className="seed-controls" onSubmit={submit} aria-busy={generating}>
      <div className="setup-heading">
        <label htmlFor="planet-seed">World setup</label>
        <span>Current seed: {setup.seed}</span>
      </div>
      <div className="seed-row">
        <input
          id="planet-seed"
          value={seedInput}
          onChange={(event) => setSeedInput(event.target.value)}
          spellCheck={false}
          aria-label="Planet seed"
          disabled={operation !== null}
        />
        <button type="submit" className="sr-only" tabIndex={-1}>
          Use seed
        </button>
      </div>
      <div className="setup-counts">
        <label>
          <span>Territories</span>
          <input
            type="number"
            min={MIN_TERRITORY_COUNT}
            max={MAX_TERRITORY_COUNT}
            value={draft.territoryCount}
            onChange={(event) =>
              setDraft({ territoryCount: Number(event.target.value) })
            }
            aria-label="Territory count"
            disabled={operation !== null}
          />
        </label>
        <label>
          <span>Continents</span>
          <input
            type="number"
            min={MIN_CONTINENT_COUNT}
            max={Math.min(MAX_NEW_CONTINENT_COUNT, draft.territoryCount)}
            value={draft.continentCount}
            onChange={(event) =>
              setDraft({ continentCount: Number(event.target.value) })
            }
            aria-label="Continent count"
            disabled={operation !== null}
          />
        </label>
      </div>
      <p className="setup-guidance">
        Recommended world: 42 territories and 5 continents. New worlds are
        temporarily capped at 5 continents while 6-continent generation is
        investigated.
      </p>
      {(warning || error) && (
        <p
          className={error ? 'setup-message error' : 'setup-message'}
          role={error ? 'alert' : 'status'}
        >
          {error ?? warning}
        </p>
      )}
      <div className="setup-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => void generateWorld()}
          disabled={operation !== null}
          aria-busy={operation === 'generate-world'}
        >
          {operation === 'generate-world' ? 'Generating…' : 'Generate World'}
        </button>
        <button
          type="button"
          className="continue-setup"
          onClick={continueToMatchSetup}
          disabled={operation !== null}
        >
          Start Game
        </button>
      </div>
    </form>
  );
}
