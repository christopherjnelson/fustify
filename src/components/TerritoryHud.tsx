import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  calculateReinforcements,
  getFullyOwnedContinents,
  getOwnedTerritories,
  getValidAttackDice,
} from '../core/game';
import { useGameStore, type PlanetViewMode } from '../state/useGameStore';
import { TerritoryNavigator } from './TerritoryNavigator';
import { territoryDrawerReducer } from '../core/navigation/territoryNavigator';
import { playerColorValue } from '../core/setup/playerConfig';

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
  const configuredPlayers = useGameStore((state) => state.matchSetup.players);
  const debugView = useGameStore((state) => state.debugView);
  const viewMode = useGameStore((state) => state.viewMode);
  const eventLogOpen = useGameStore((state) => state.eventLogOpen);
  const error = useGameStore((state) => state.lastActionError);
  const dispatch = useGameStore((state) => state.dispatchGameAction);
  const resetMatch = useGameStore((state) => state.resetMatch);
  const rematchNewOwnership = useGameStore(
    (state) => state.rematchNewOwnership,
  );
  const backToWorldSetup = useGameStore((state) => state.backToWorldSetup);
  const saveMatch = useGameStore((state) => state.saveMatch);
  const deleteSavedMatch = useGameStore((state) => state.deleteSavedMatch);
  const savedAt = useGameStore((state) => state.savedAt);
  const saveMessage = useGameStore((state) => state.saveMessage);
  const saveError = useGameStore((state) => state.saveError);
  const toggleDebug = useGameStore((state) => state.toggleDebugView);
  const toggleEventLog = useGameStore((state) => state.toggleEventLog);
  const setViewMode = useGameStore((state) => state.setViewMode);
  const focusSelected = useGameStore((state) => state.focusSelectedTerritory);
  const [attackDice, setAttackDice] = useState(1);
  const [moveAmount, setMoveAmount] = useState(1);
  const [fortifyAmount, setFortifyAmount] = useState(1);
  const [reviewingGameOver, setReviewingGameOver] = useState(false);
  const [navigatorOpen, dispatchNavigator] = useReducer(
    territoryDrawerReducer,
    false,
  );
  const navigatorTriggerRef = useRef<HTMLButtonElement>(null);

  const closeNavigator = () => {
    dispatchNavigator('close');
    window.requestAnimationFrame(() => navigatorTriggerRef.current?.focus());
  };

  useEffect(() => {
    const openFromShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        dispatchNavigator('open');
      }
    };
    window.addEventListener('keydown', openFromShortcut);
    return () => window.removeEventListener('keydown', openFromShortcut);
  }, []);

  const territoryById = useMemo(
    () =>
      new Map(planet.territories.map((territory) => [territory.id, territory])),
    [planet],
  );
  const activePlayer = configuredPlayers.find(
    (player) => player.id === match.activePlayerId,
  )!;
  const sourceId = match.selectedSourceTerritoryId;
  const targetId = match.selectedTargetTerritoryId;
  const source = sourceId ? territoryById.get(sourceId) : undefined;
  const target = targetId ? territoryById.get(targetId) : undefined;
  const sourceState = sourceId ? match.territories[sourceId] : undefined;
  const selected = target ?? source;
  const selectedState = selected ? match.territories[selected.id] : undefined;
  const selectedOwner = configuredPlayers.find(
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
    <>
      <aside className="hud" aria-label="Local match controls">
        <section
          className="turn-banner"
          aria-live="polite"
          style={
            {
              '--player-color': playerColorValue(activePlayer.colorId),
            } as CSSProperties
          }
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
                style={{
                  background: selectedOwner
                    ? playerColorValue(selectedOwner.colorId)
                    : undefined,
                }}
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
            ref={navigatorTriggerRef}
            className="icon-button territory-list-trigger"
            onClick={() => dispatchNavigator('open')}
            aria-haspopup="dialog"
            aria-expanded={navigatorOpen}
          >
            Territory list <kbd>⌘/Ctrl K</kbd>
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
            className={`icon-button ${debugView ? 'active' : ''}`}
            onClick={toggleDebug}
            aria-pressed={debugView}
          >
            Debug
          </button>
          <details className="game-menu">
            <summary>Game</summary>
            <div>
              <button type="button" onClick={saveMatch}>
                Save match
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm('Restart with the same world and ownership?')
                  )
                    resetMatch();
                }}
              >
                Same ownership rematch
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      'Return to pregame with a new ownership layout?',
                    )
                  )
                    rematchNewOwnership();
                }}
              >
                Reroll ownership
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      'Leave this match for world setup? The local save will remain.',
                    )
                  )
                    backToWorldSetup();
                }}
              >
                Different world
              </button>
              <button
                type="button"
                className="danger"
                onClick={deleteSavedMatch}
              >
                Delete local save
              </button>
            </div>
          </details>
        </div>

        {(saveMessage || saveError || savedAt) && (
          <p
            className={saveError ? 'save-status error' : 'save-status'}
            role="status"
          >
            {saveError ??
              saveMessage ??
              `Saved locally ${new Date(savedAt!).toLocaleTimeString()}`}
          </p>
        )}

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

        {match.phase === 'game-over' && reviewingGameOver && (
          <section className="phase-card">
            <span className="eyebrow">Reviewing final world</span>
            <button
              type="button"
              className="wide"
              onClick={() => setReviewingGameOver(false)}
            >
              Show rematch options
            </button>
          </section>
        )}

        {match.phase === 'game-over' && !reviewingGameOver && (
          <section
            className="victory-panel"
            role="dialog"
            aria-label="Match won"
            aria-live="assertive"
          >
            <span className="eyebrow">Match won</span>
            <h2>
              {
                configuredPlayers.find((player) => player.id === match.winnerId)
                  ?.name
              }
            </h2>
            <p>Every playable territory is under one banner.</p>
            <div className="victory-actions">
              <button type="button" onClick={() => setReviewingGameOver(true)}>
                Review world
              </button>
              <button type="button" onClick={resetMatch}>
                Same ownership rematch
              </button>
              <button type="button" onClick={rematchNewOwnership}>
                Reroll ownership
              </button>
              <button type="button" onClick={backToWorldSetup}>
                Different world
              </button>
              <button
                type="button"
                className="danger"
                onClick={deleteSavedMatch}
              >
                Delete saved match
              </button>
            </div>
          </section>
        )}
      </aside>
      <TerritoryNavigator open={navigatorOpen} onClose={closeNavigator} />
    </>
  );
}
