import { useMemo, useState, type CSSProperties } from 'react';
import {
  calculateReinforcements,
  getFullyOwnedContinents,
  getOwnedTerritories,
  getValidAttackDice,
} from '../core/game';
import { useGameStore, type PlanetViewMode } from '../state/useGameStore';
import { SeedControls } from './SeedControls';

const PHASE_LABELS = {
  reinforce: 'Reinforce',
  attack: 'Attack',
  capture: 'Move after capture',
  fortify: 'Fortify',
  'turn-end': 'End turn',
  'game-over': 'Game over',
} as const;

const VIEW_MODES: { id: PlanetViewMode; label: string }[] = [
  { id: 'ownership', label: 'Ownership' },
  { id: 'continents', label: 'Continents' },
  { id: 'terrain', label: 'Terrain' },
];

export function TerritoryHud() {
  const planet = useGameStore((state) => state.planet);
  const match = useGameStore((state) => state.match);
  const debugView = useGameStore((state) => state.debugView);
  const viewMode = useGameStore((state) => state.viewMode);
  const eventLogOpen = useGameStore((state) => state.eventLogOpen);
  const error = useGameStore((state) => state.lastActionError);
  const dispatch = useGameStore((state) => state.dispatchGameAction);
  const resetMatch = useGameStore((state) => state.resetMatch);
  const toggleDebug = useGameStore((state) => state.toggleDebugView);
  const toggleEventLog = useGameStore((state) => state.toggleEventLog);
  const setViewMode = useGameStore((state) => state.setViewMode);
  const focusSelected = useGameStore((state) => state.focusSelectedTerritory);
  const [attackDice, setAttackDice] = useState(1);
  const [moveAmount, setMoveAmount] = useState(1);
  const [fortifyAmount, setFortifyAmount] = useState(1);

  const territoryById = useMemo(
    () =>
      new Map(planet.territories.map((territory) => [territory.id, territory])),
    [planet],
  );
  const activePlayer = planet.players.find(
    (player) => player.id === match.activePlayerId,
  )!;
  const sourceId = match.selectedSourceTerritoryId;
  const targetId = match.selectedTargetTerritoryId;
  const source = sourceId ? territoryById.get(sourceId) : undefined;
  const target = targetId ? territoryById.get(targetId) : undefined;
  const sourceState = sourceId ? match.territories[sourceId] : undefined;
  const selected = target ?? source;
  const selectedState = selected ? match.territories[selected.id] : undefined;
  const selectedOwner = planet.players.find(
    (player) => player.id === selectedState?.ownerId,
  );
  const owned = getOwnedTerritories(match, match.activePlayerId);
  const ownedContinents = getFullyOwnedContinents(
    planet,
    match,
    match.activePlayerId,
  );
  const reinforcement = calculateReinforcements(
    planet,
    match,
    match.activePlayerId,
  );
  const diceOptions = sourceState
    ? getValidAttackDice(sourceState.armyCount)
    : [];
  const effectiveAttackDice = diceOptions.includes(attackDice)
    ? attackDice
    : (diceOptions.at(-1) ?? 1);
  const latestCombat = [...match.events]
    .reverse()
    .find((event) => event.type === 'combat');
  const pending = match.pendingCapture;
  const captureMax = pending
    ? match.territories[pending.fromTerritoryId]!.armyCount - 1
    : 1;
  const effectiveMoveAmount = pending
    ? Math.min(captureMax, Math.max(pending.minimumArmies, moveAmount))
    : 1;
  const fortifyMax = sourceState ? Math.max(1, sourceState.armyCount - 1) : 1;
  const effectiveFortifyAmount = Math.min(
    fortifyMax,
    Math.max(1, fortifyAmount),
  );

  return (
    <aside className="hud" aria-label="Local match controls">
      <SeedControls />

      <section
        className="turn-banner"
        style={{ '--player-color': activePlayer.color } as CSSProperties}
      >
        <span className="player-token" aria-hidden="true">
          ◆
        </span>
        <div>
          <span>
            Turn {match.turnNumber} · {PHASE_LABELS[match.phase]}
          </span>
          <strong>{activePlayer.name}</strong>
        </div>
        <div className="turn-stat">
          <strong>{owned.length}</strong>
          <span>territories</span>
        </div>
      </section>

      <div className="view-modes" aria-label="Globe display mode">
        {VIEW_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={viewMode === mode.id ? 'active' : ''}
            onClick={() => setViewMode(mode.id)}
            aria-pressed={viewMode === mode.id}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="action-feedback error" role="alert">
          <strong>{error.code.replaceAll('_', ' ')}</strong>
          <span>{error.message}</span>
        </div>
      )}

      {match.phase === 'reinforce' && (
        <section className="phase-card">
          <div className="phase-heading">
            <div>
              <span className="eyebrow">Reinforcement pool</span>
              <strong className="reinforcement-total">
                {match.remainingReinforcements}
              </strong>
            </div>
            <p>
              {reinforcement.territoryBase} base from{' '}
              {reinforcement.ownedTerritoryCount} territories
              {' + '}
              {reinforcement.continentBonus} continent bonus
            </p>
          </div>
          {ownedContinents.length > 0 && (
            <p className="bonus-line">
              Full control:{' '}
              {ownedContinents
                .map((continent) => `${continent.name} (+${continent.bonus})`)
                .join(', ')}
            </p>
          )}
          <p className="phase-instruction">
            Select one of your dashed markers, then place armies.
          </p>
          <div className="action-row">
            <button
              type="button"
              disabled={!sourceId}
              onClick={() =>
                sourceId &&
                dispatch({
                  type: 'PLACE_REINFORCEMENT',
                  territoryId: sourceId,
                  amount: 1,
                })
              }
            >
              Place 1
            </button>
            <button
              type="button"
              disabled={!sourceId}
              onClick={() =>
                sourceId &&
                dispatch({
                  type: 'PLACE_REINFORCEMENT',
                  territoryId: sourceId,
                  amount: match.remainingReinforcements,
                })
              }
            >
              Place all ({match.remainingReinforcements})
            </button>
          </div>
        </section>
      )}

      {match.phase === 'attack' && (
        <section className="phase-card">
          <span className="eyebrow">Attack phase</span>
          <p className="phase-instruction">
            Choose a dashed source, then an outlined adjacent enemy. The ≈
            marker indicates a sea route.
          </p>
          {source && target && (
            <div className="combat-control">
              <strong>
                {source.name} → {target.name}
              </strong>
              <label>
                Attack dice
                <select
                  value={effectiveAttackDice}
                  onChange={(event) =>
                    setAttackDice(Number(event.target.value))
                  }
                >
                  {diceOptions.map((dice) => (
                    <option key={dice} value={dice}>
                      {dice}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() =>
                  dispatch({
                    type: 'ATTACK',
                    fromTerritoryId: source.id,
                    toTerritoryId: target.id,
                    attackDice: effectiveAttackDice,
                  })
                }
              >
                Attack
              </button>
            </div>
          )}
          {latestCombat && (
            <p className="combat-summary">
              Last roll: {latestCombat.attackerRolls?.join(' · ')} vs{' '}
              {latestCombat.defenderRolls?.join(' · ')} — losses{' '}
              {latestCombat.attackerLosses}:{latestCombat.defenderLosses}
            </p>
          )}
          <button
            type="button"
            className="wide secondary-action"
            onClick={() => dispatch({ type: 'END_ATTACK_PHASE' })}
          >
            End attack phase
          </button>
        </section>
      )}

      {match.phase === 'capture' && pending && (
        <section className="phase-card capture-card">
          <span className="eyebrow">Territory captured</span>
          <h2>Move armies in</h2>
          <p>
            Move at least {pending.minimumArmies}; the source must keep one
            army.
          </p>
          <label className="amount-control">
            <span>Armies</span>
            <input
              type="range"
              min={pending.minimumArmies}
              max={captureMax}
              value={effectiveMoveAmount}
              onChange={(event) => setMoveAmount(Number(event.target.value))}
            />
            <strong>{effectiveMoveAmount}</strong>
          </label>
          <button
            type="button"
            className="wide"
            onClick={() =>
              dispatch({
                type: 'MOVE_AFTER_CAPTURE',
                fromTerritoryId: pending.fromTerritoryId,
                toTerritoryId: pending.toTerritoryId,
                amount: effectiveMoveAmount,
              })
            }
          >
            Complete capture move
          </button>
        </section>
      )}

      {match.phase === 'fortify' && (
        <section className="phase-card">
          <span className="eyebrow">Fortify once or skip</span>
          <p className="phase-instruction">
            Choose a source and any destination connected through your
            territories.
          </p>
          {source && target && (
            <>
              <strong className="route-label">
                {source.name} → {target.name}
              </strong>
              <label className="amount-control">
                <span>Armies</span>
                <input
                  type="range"
                  min={1}
                  max={fortifyMax}
                  value={effectiveFortifyAmount}
                  onChange={(event) =>
                    setFortifyAmount(Number(event.target.value))
                  }
                />
                <strong>{effectiveFortifyAmount}</strong>
              </label>
              <button
                type="button"
                className="wide"
                onClick={() =>
                  dispatch({
                    type: 'FORTIFY',
                    fromTerritoryId: source.id,
                    toTerritoryId: target.id,
                    amount: effectiveFortifyAmount,
                  })
                }
              >
                Fortify
              </button>
            </>
          )}
          <button
            type="button"
            className="wide secondary-action"
            onClick={() => dispatch({ type: 'SKIP_FORTIFY' })}
          >
            Skip fortification
          </button>
        </section>
      )}

      {match.phase === 'turn-end' && (
        <section className="phase-card end-turn-card">
          <span className="eyebrow">Actions complete</span>
          <h2>Ready for the next player?</h2>
          <p>Pass the device, then end the turn.</p>
          <button
            type="button"
            className="wide"
            onClick={() => dispatch({ type: 'END_TURN' })}
          >
            End turn
          </button>
        </section>
      )}

      {selected && selectedState && (
        <section className="selection-card compact" aria-live="polite">
          <div className="territory-title">
            <span
              className="color-swatch"
              style={{ background: selectedOwner?.color }}
            />
            <div>
              <span className="eyebrow">
                {target?.id === selected.id
                  ? 'Selected target'
                  : 'Selected source'}
              </span>
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
              <dt>Owner</dt>
              <dd>{selectedOwner?.name}</dd>
            </div>
            <div>
              <dt>Armies</dt>
              <dd>{selectedState.armyCount}</dd>
            </div>
            <div>
              <dt>Continent</dt>
              <dd>
                {
                  planet.continents.find(
                    (item) => item.id === selected.continentId,
                  )?.name
                }
              </dd>
            </div>
            <div>
              <dt>Connection</dt>
              <dd>
                {source && target
                  ? (planet.connections.find(
                      (connection) =>
                        (connection.fromTerritoryId === source.id &&
                          connection.toTerritoryId === target.id) ||
                        (connection.toTerritoryId === source.id &&
                          connection.fromTerritoryId === target.id),
                    )?.type ?? 'owned path')
                  : '—'}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <div className="utility-row">
        <button
          type="button"
          className={`icon-button ${debugView ? 'active' : ''}`}
          onClick={toggleDebug}
          aria-pressed={debugView}
        >
          Debug
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={toggleEventLog}
          aria-expanded={eventLogOpen}
        >
          {eventLogOpen ? 'Hide log' : `Event log (${match.events.length})`}
        </button>
        <button
          type="button"
          className="icon-button danger"
          onClick={resetMatch}
        >
          Reset match
        </button>
      </div>

      {eventLogOpen && (
        <section className="event-log">
          <span className="eyebrow">Latest events</span>
          <ol>
            {[...match.events]
              .reverse()
              .slice(0, 40)
              .map((event) => (
                <li key={event.id}>
                  <span>T{event.turnNumber}</span>
                  {event.message}
                </li>
              ))}
          </ol>
        </section>
      )}

      {debugView && (
        <section className="debug-panel">
          <div className="debug-heading">
            <span className="eyebrow">Strategic graph</span>
            <span>{planet.connections.length} connections</span>
          </div>
          <p>
            {planet.analysis.articulationTerritoryIds.length} articulation
            points · {planet.analysis.seaRouteBridgeConnections.length} sea
            bridges · {planet.analysis.routeRedundancy} redundant routes
          </p>
        </section>
      )}

      {match.phase === 'game-over' && (
        <section className="victory-panel" role="dialog" aria-label="Match won">
          <span className="eyebrow">Match won</span>
          <h2>
            {
              planet.players.find((player) => player.id === match.winnerId)
                ?.name
            }
          </h2>
          <p>Every playable territory is under one banner.</p>
          <button type="button" onClick={resetMatch}>
            Play again
          </button>
        </section>
      )}
    </aside>
  );
}
