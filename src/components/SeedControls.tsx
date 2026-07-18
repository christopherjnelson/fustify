import type { FormEvent } from 'react';
import {
  MAX_CONTINENT_COUNT,
  MAX_PLAYER_COUNT,
  MAX_TERRITORY_COUNT,
  MIN_CONTINENT_COUNT,
  MIN_PLAYER_COUNT,
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
  const regenerate = useGameStore((state) => state.regenerate);
  const randomize = useGameStore((state) => state.randomizeSeed);
  const operation = useGameStore((state) => state.setupOperation);
  const generating =
    operation === 'preview-world' || operation === 'random-seed';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void regenerate();
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
            max={Math.min(MAX_CONTINENT_COUNT, draft.territoryCount)}
            value={draft.continentCount}
            onChange={(event) =>
              setDraft({ continentCount: Number(event.target.value) })
            }
            aria-label="Continent count"
            disabled={operation !== null}
          />
        </label>
        <label>
          <span>Players</span>
          <input
            type="number"
            min={MIN_PLAYER_COUNT}
            max={MAX_PLAYER_COUNT}
            value={draft.playerCount}
            onChange={(event) =>
              setDraft({ playerCount: Number(event.target.value) })
            }
            aria-label="Player count"
            disabled={operation !== null}
          />
        </label>
      </div>
      {(warning || error) && (
        <p
          className={error ? 'setup-message error' : 'setup-message'}
          role="status"
        >
          {error ?? warning}
        </p>
      )}
      <div className="setup-actions">
        <button
          type="submit"
          disabled={operation !== null}
          aria-busy={operation === 'preview-world'}
        >
          {operation === 'preview-world' ? 'Generating…' : 'Preview world'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => void randomize()}
          disabled={operation !== null}
          aria-busy={operation === 'random-seed'}
        >
          {operation === 'random-seed' ? 'Generating…' : 'Random seed'}
        </button>
      </div>
    </form>
  );
}
