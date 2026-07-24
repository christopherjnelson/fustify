import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  calculateReinforcements,
  getAttackSources,
  getAttackTargets,
  getFullyOwnedContinents,
  getOwnedTerritories,
  getValidAttackDice,
} from '../core/game';
import { useGameStore, type PlanetViewMode } from '../state/useGameStore';
import { TerritoryNavigator } from './TerritoryNavigator';
import { territoryDrawerReducer } from '../core/navigation/territoryNavigator';
import { playerColorValue } from '../core/setup/playerConfig';
import { TERRITORY_NAVIGATOR_SHORTCUT } from '../core/input/controlBindings';
import { MatchDock } from './MatchDock';
import { TurnSoundToggle } from './TurnNotificationController';

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

export function HudUtilityRow({
  navigatorOpen,
  navigatorTriggerRef,
  onOpenNavigator,
  children,
}: {
  navigatorOpen: boolean;
  navigatorTriggerRef: RefObject<HTMLButtonElement | null>;
  onOpenNavigator: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="utility-row">
      <button
        type="button"
        ref={navigatorTriggerRef}
        className="icon-button territory-list-trigger"
        onClick={onOpenNavigator}
        aria-haspopup="dialog"
        aria-expanded={navigatorOpen}
      >
        Territory list <kbd>⌘/Ctrl K</kbd>
      </button>
      {children}
    </div>
  );
}

function ArmyAmountControl({
  label,
  minimum,
  maximum,
  value,
  onChange,
}: {
  label: string;
  minimum: number;
  maximum: number;
  value: number;
  onChange: (value: number) => void;
}) {
  if (minimum === maximum)
    return (
      <p className="fixed-amount" aria-label={`${label}: ${value}`}>
        <span>{label}</span>
        <strong>{value}</strong>
      </p>
    );
  return (
    <label className="amount-control">
      <span>{label}</span>
      <input
        aria-label={label}
        type="range"
        min={minimum}
        max={maximum}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <strong>{value}</strong>
    </label>
  );
}

export function TerritoryHud({
  renderMultiplayerPostMatchActions,
}: {
  renderMultiplayerPostMatchActions?: (
    reviewing: boolean,
    onReviewingChange: (reviewing: boolean) => void,
  ) => ReactNode;
} = {}) {
  const planet = useGameStore((state) => state.planet);
  const match = useGameStore((state) => state.match)!;
  const configuredPlayers = useGameStore((state) => state.matchSetup.players);
  const assignmentMode = useGameStore(
    (state) => state.matchSetup.assignmentMode,
  );
  const debugView = useGameStore((state) => state.debugView);
  const viewMode = useGameStore((state) => state.viewMode);
  const error = useGameStore((state) => state.lastActionError);
  const botExecution = useGameStore((state) => state.botExecution);
  const multiplayerSession = useGameStore((state) => state.multiplayerSession);
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
  const setViewMode = useGameStore((state) => state.setViewMode);
  const focusSelected = useGameStore((state) => state.focusSelectedTerritory);
  const requestTerritoryFocus = useGameStore(
    (state) => state.requestTerritoryFocus,
  );
  const [attackDice, setAttackDice] = useState(1);
  const [moveAmount, setMoveAmount] = useState(1);
  const [fortifyAmount, setFortifyAmount] = useState(1);
  const [reviewingGameOver, setReviewingGameOver] = useState(false);
  const [confirmingEndAttack, setConfirmingEndAttack] = useState(false);
  const [navigatorOpen, dispatchNavigator] = useReducer(
    territoryDrawerReducer,
    false,
  );
  const navigatorTriggerRef = useRef<HTMLButtonElement>(null);
  const endAttackTriggerRef = useRef<HTMLButtonElement>(null);
  const endAttackConfirmRef = useRef<HTMLButtonElement>(null);

  const closeNavigator = () => {
    dispatchNavigator('close');
    window.requestAnimationFrame(() => navigatorTriggerRef.current?.focus());
  };

  useEffect(() => {
    const openFromShortcut = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === TERRITORY_NAVIGATOR_SHORTCUT.key
      ) {
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
  const botControlled = activePlayer.controllerType === 'heuristic-bot';
  const multiplayerPending = multiplayerSession?.pending ?? false;
  const canControl =
    !botControlled &&
    (multiplayerSession === null ||
      multiplayerSession.ownPlayerId === match.activePlayerId);
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
  const legalAttackRemains = getAttackSources(match).some(
    (territoryId) => getAttackTargets(planet, match, territoryId).length > 0,
  );

  useEffect(() => {
    if (!confirmingEndAttack) return;
    endAttackConfirmRef.current?.focus();
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setConfirmingEndAttack(false);
      window.requestAnimationFrame(() => endAttackTriggerRef.current?.focus());
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [confirmingEndAttack]);

  return (
    <>
      <div className="left-hud-rail">
        <aside
          className="hud"
          aria-label={
            multiplayerSession
              ? 'Multiplayer match controls'
              : 'Local match controls'
          }
        >
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
                Turn {match.turnNumber} · {PHASE_LABELS[match.phase]} ·{' '}
                {botControlled
                  ? 'Heuristic Bot'
                  : multiplayerSession
                    ? canControl
                      ? 'Your turn'
                      : 'Remote player'
                    : 'Local Human'}
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

          {multiplayerSession && (
            <section
              className="phase-card multiplayer-authority-status"
              aria-live="polite"
              data-testid="multiplayer-authority-status"
            >
              <span className="eyebrow">
                Authoritative revision {multiplayerSession.revision}
              </span>
              <p>
                {match.phase === 'game-over'
                  ? `Match completed. ${activePlayer.name} won.`
                  : multiplayerPending
                    ? 'Submitting command…'
                    : canControl
                      ? 'Your actions are enabled.'
                      : `Waiting for ${activePlayer.name}.`}
              </p>
              <code data-testid="state-fingerprint">
                {multiplayerSession.stateFingerprint}
              </code>
            </section>
          )}

          {botControlled && match.phase !== 'game-over' && (
            <section
              className="phase-card bot-status-card"
              aria-live="polite"
              data-testid="bot-turn-status"
              data-bot-state={botExecution.phase}
            >
              <span className="eyebrow">Bot turn · {botExecution.phase}</span>
              <h2>{activePlayer.name} is acting</h2>
              <p>
                {botExecution.error ??
                  botExecution.summary ??
                  'Choosing the next legal action.'}
              </p>
              <small>Gameplay controls are locked until control returns.</small>
            </section>
          )}

          {canControl && match.phase === 'reinforce' && (
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
                    .map(
                      (continent) => `${continent.name} (+${continent.bonus})`,
                    )
                    .join(', ')}
                </p>
              )}
              <p className="phase-instruction">
                Select one of your dashed markers, then place armies.
              </p>
              <div className="action-row">
                <button
                  type="button"
                  disabled={!sourceId || multiplayerPending}
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
                  disabled={!sourceId || multiplayerPending}
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

          {canControl && match.phase === 'attack' && (
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
                    disabled={multiplayerPending}
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
            </section>
          )}

          {canControl && match.phase === 'attack' && (
            <section
              className="phase-actions"
              aria-label="Attack phase actions"
            >
              <span className="eyebrow">Phase actions</span>
              <button
                ref={endAttackTriggerRef}
                type="button"
                className="wide secondary-action"
                disabled={multiplayerPending}
                onClick={() => {
                  if (legalAttackRemains) setConfirmingEndAttack(true);
                  else dispatch({ type: 'END_ATTACK_PHASE' });
                }}
              >
                End attack phase
              </button>
            </section>
          )}

          {confirmingEndAttack && match.phase === 'attack' && (
            <section
              className="phase-confirmation"
              role="dialog"
              aria-modal="true"
              aria-labelledby="end-attack-title"
            >
              <h2 id="end-attack-title">End attacking now?</h2>
              <p>Legal attacks remain. You cannot return to this phase.</p>
              <div className="confirmation-actions">
                <button
                  ref={endAttackConfirmRef}
                  type="button"
                  onClick={() => {
                    setConfirmingEndAttack(false);
                    dispatch({ type: 'END_ATTACK_PHASE' });
                  }}
                >
                  End attack phase
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingEndAttack(false);
                    window.requestAnimationFrame(() =>
                      endAttackTriggerRef.current?.focus(),
                    );
                  }}
                >
                  Continue attacking
                </button>
              </div>
            </section>
          )}

          {canControl && match.phase === 'capture' && pending && (
            <section className="phase-card capture-card">
              <span className="eyebrow">Territory captured</span>
              <h2>Move armies in</h2>
              <p>
                Move at least {pending.minimumArmies}; the source must keep one
                army.
              </p>
              <ArmyAmountControl
                label="Armies to move"
                minimum={pending.minimumArmies}
                maximum={captureMax}
                value={effectiveMoveAmount}
                onChange={setMoveAmount}
              />
              <button
                type="button"
                className="wide"
                disabled={multiplayerPending}
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

          {canControl && match.phase === 'fortify' && (
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
                  <ArmyAmountControl
                    label="Armies to move"
                    minimum={1}
                    maximum={fortifyMax}
                    value={effectiveFortifyAmount}
                    onChange={setFortifyAmount}
                  />
                  <button
                    type="button"
                    className="wide"
                    disabled={multiplayerPending}
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
                disabled={multiplayerPending}
                onClick={() => dispatch({ type: 'SKIP_FORTIFY' })}
              >
                Skip fortification
              </button>
            </section>
          )}

          {canControl && match.phase === 'turn-end' && (
            <section className="phase-card end-turn-card">
              <span className="eyebrow">Actions complete</span>
              <h2>Ready for the next player?</h2>
              <p>Pass the device, then end the turn.</p>
              <button
                type="button"
                className="wide"
                disabled={multiplayerPending}
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

          <HudUtilityRow
            navigatorOpen={navigatorOpen}
            navigatorTriggerRef={navigatorTriggerRef}
            onOpenNavigator={() => dispatchNavigator('open')}
          >
            <details className="game-menu">
              <summary>Game</summary>
              <div>
                <TurnSoundToggle />
                {!multiplayerSession && (
                  <>
                    <div className="game-menu-separator" />
                    <button type="button" onClick={saveMatch}>
                      Save match
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            'Restart with the same world and ownership?',
                          )
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
                      {assignmentMode === 'random'
                        ? 'Reroll ownership'
                        : 'Restart player draft'}
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
                  </>
                )}
              </div>
            </details>
          </HudUtilityRow>

          {!multiplayerSession && (saveMessage || saveError || savedAt) && (
            <p
              className={saveError ? 'save-status error' : 'save-status'}
              role="status"
            >
              {saveError ??
                saveMessage ??
                `Saved locally ${new Date(savedAt!).toLocaleTimeString()}`}
            </p>
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
              {multiplayerSession && renderMultiplayerPostMatchActions ? (
                renderMultiplayerPostMatchActions(
                  reviewingGameOver,
                  setReviewingGameOver,
                )
              ) : (
                <button
                  type="button"
                  className="wide"
                  onClick={() => setReviewingGameOver(false)}
                >
                  Show rematch options
                </button>
              )}
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
                  configuredPlayers.find(
                    (player) => player.id === match.winnerId,
                  )?.name
                }
              </h2>
              <p>Every playable territory is under one banner.</p>
              {multiplayerSession && renderMultiplayerPostMatchActions ? (
                renderMultiplayerPostMatchActions(
                  reviewingGameOver,
                  setReviewingGameOver,
                )
              ) : (
                <div className="victory-actions">
                  <button
                    type="button"
                    onClick={() => setReviewingGameOver(true)}
                  >
                    Review world
                  </button>
                  {!multiplayerSession && (
                    <>
                      <button type="button" onClick={resetMatch}>
                        Same ownership rematch
                      </button>
                      <button type="button" onClick={rematchNewOwnership}>
                        {assignmentMode === 'random'
                          ? 'Reroll ownership'
                          : 'Restart player draft'}
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
                    </>
                  )}
                </div>
              )}
            </section>
          )}
        </aside>
        <MatchDock
          matchId={match.matchId}
          events={match.events}
          planet={planet}
          players={configuredPlayers}
          onFocusTerritory={requestTerritoryFocus}
        />
      </div>
      <TerritoryNavigator open={navigatorOpen} onClose={closeNavigator} />
    </>
  );
}
