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

  const submit = (event: FormEvent) => {
    event.preventDefault();
    regenerate();
  };

  return (
    <form className="seed-controls" onSubmit={submit}>
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
        <button type="submit">Generate / apply</button>
        <button type="button" className="secondary" onClick={randomize}>
          Random seed
        </button>
      </div>
    </form>
  );
}
