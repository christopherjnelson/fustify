import { useMemo, useState } from 'react';
import { PLAYER_COLORS, playerColorValue } from '../core/setup/playerConfig';
import {
  MAX_NEW_PLAYER_COUNT,
  MIN_PLAYER_COUNT,
} from '../core/setup/worldSetup';
import { activeDraftPlayer } from '../core/setup/territoryAssignment';
import { useGameStore } from '../state/useGameStore';
import {
  GameSetupShell,
  SetupActionBar,
  SetupRoster,
  SetupSeatRow,
  SetupSummary,
  SetupWorldPanel,
} from './setup/GameSetup';
import { hasHeuristicBot } from '../browser/botPacingVisibility';
import { BotPacingSelector } from './BotPacingSelector';

export function PregamePanel() {
  const setup = useGameStore((state) => state.setup);
  const planet = useGameStore((state) => state.planet);
  const matchSetup = useGameStore((state) => state.matchSetup);
  const errors = useGameStore((state) => state.playerSetupErrors);
  const feedback = useGameStore((state) => state.assignmentFeedback);
  const saveMessage = useGameStore((state) => state.saveMessage);
  const saveError = useGameStore((state) => state.saveError);
  const updatePlayer = useGameStore((state) => state.updatePlayer);
  const setPlayerCount = useGameStore((state) => state.setPlayerCount);
  const setAssignmentMode = useGameStore((state) => state.setAssignmentMode);
  const beginAssignment = useGameStore((state) => state.beginAssignment);
  const cancelAssignment = useGameStore((state) => state.cancelAssignment);
  const restartDraft = useGameStore((state) => state.restartDraft);
  const pickDraftTerritory = useGameStore((state) => state.pickDraftTerritory);
  const reroll = useGameStore((state) => state.rerollOwnership);
  const start = useGameStore((state) => state.startMatch);
  const save = useGameStore((state) => state.saveMatch);
  const back = useGameStore((state) => state.backToWorldSetup);
  const operation = useGameStore((state) => state.setupOperation);
  const [selectedDraftTerritoryId, setSelectedDraftTerritoryId] = useState(
    planet.territories[0]?.id ?? '',
  );
  const orderedPlayers = useMemo(
    () =>
      matchSetup.players
        .slice()
        .sort((left, right) => left.seatIndex - right.seatIndex),
    [matchSetup.players],
  );
  const ready = matchSetup.setupPhase === 'ready' ? matchSetup : null;
  const analysis = ready?.startingPosition.analysis ?? null;
  const metricByPlayer = new Map(
    analysis?.players.map((metric) => [metric.playerId, metric]) ?? [],
  );
  const drafting =
    matchSetup.setupPhase === 'assignment-in-progress' ? matchSetup : null;
  const activePlayer = drafting ? activeDraftPlayer(drafting) : null;
  const invalidFeedback =
    feedback?.includes('already') ||
    feedback?.includes('not part') ||
    feedback?.includes('before choosing');
  const hasBots = hasHeuristicBot(orderedPlayers);

  return (
    <GameSetupShell
      as="aside"
      variant="overlay"
      ariaLabelledBy="pregame-title"
      busy={operation !== null}
      eyebrow={`World preview · ${setup.seed}`}
      title="Preview and assign territories"
      summary={
        <SetupSummary label="Local setup summary">
          <span>
            {setup.playerCount} players · {planet.territories.length}{' '}
            territories · {planet.continents.length} continents
          </span>
          <span className="local-setup-summary-note">
            Configure the table before assigning ownership.
          </span>
        </SetupSummary>
      }
      roster={
        <SetupRoster
          title="Players"
          supplemental={hasBots ? <BotPacingSelector context="setup" /> : null}
          headerActions={
            <label className="player-count-control">
              <span>Players</span>
              <input
                type="number"
                min={MIN_PLAYER_COUNT}
                max={Math.max(MAX_NEW_PLAYER_COUNT, setup.playerCount)}
                value={setup.playerCount}
                onChange={(event) => setPlayerCount(Number(event.target.value))}
                aria-label="Player count"
                disabled={
                  matchSetup.setupPhase !== 'neutral-preview' ||
                  operation !== null
                }
              />
            </label>
          }
        >
          {orderedPlayers.map((player) => {
            const metric = metricByPlayer.get(player.id);
            const usedColors = new Set(
              matchSetup.players
                .filter((item) => item.id !== player.id)
                .map((item) => item.colorId),
            );
            const editable =
              matchSetup.setupPhase === 'neutral-preview' && operation === null;
            return (
              <SetupSeatRow
                key={player.id}
                testId={`local-seat-${player.seatIndex + 1}`}
                seatNumber={player.seatIndex + 1}
                colorLabel={
                  PLAYER_COLORS.find((color) => color.id === player.colorId)
                    ?.label ?? player.colorId
                }
                colorValue={playerColorValue(player.colorId)}
                primaryLabel={player.name}
                primaryContent={
                  <label>
                    <span className="sr-only">
                      Player {player.seatIndex + 1} name
                    </span>
                    <input
                      value={player.name}
                      disabled={!editable}
                      onChange={(event) =>
                        updatePlayer(player.id, { name: event.target.value })
                      }
                      aria-label={`Player ${player.seatIndex + 1} name`}
                    />
                  </label>
                }
                colorContent={
                  <label>
                    <span className="sr-only">
                      {player.name || `Player ${player.seatIndex + 1}`} color
                    </span>
                    <select
                      value={player.colorId}
                      disabled={!editable}
                      onChange={(event) =>
                        updatePlayer(player.id, {
                          colorId: event.target.value,
                        })
                      }
                      aria-label={`${player.name || `Player ${player.seatIndex + 1}`} color`}
                    >
                      {PLAYER_COLORS.map((color) => (
                        <option
                          key={color.id}
                          value={color.id}
                          disabled={usedColors.has(color.id)}
                        >
                          {color.label}
                        </option>
                      ))}
                    </select>
                  </label>
                }
                controls={
                  <label>
                    <span className="sr-only">
                      {player.name || `Player ${player.seatIndex + 1}`}{' '}
                      controller
                    </span>
                    <select
                      value={player.controllerType}
                      disabled={!editable}
                      onChange={(event) =>
                        updatePlayer(player.id, {
                          controllerType: event.target.value as
                            'local-human' | 'heuristic-bot',
                        })
                      }
                      aria-label={`${player.name || `Player ${player.seatIndex + 1}`} controller`}
                    >
                      <option value="local-human">Local Human</option>
                      <option value="heuristic-bot">Heuristic Bot</option>
                    </select>
                  </label>
                }
                secondaryStatus={
                  metric
                    ? `${metric.territoryCount} territories · ${metric.armyCount} armies · ${metric.connectedComponentCount} region${metric.connectedComponentCount === 1 ? '' : 's'}`
                    : undefined
                }
              />
            );
          })}
        </SetupRoster>
      }
      world={
        <SetupWorldPanel
          title="Assignment"
          notice={
            <div className="assignment-heading">
              <span>Choose how starting ownership is created.</span>
              <span className="variant-badge">
                {matchSetup.setupPhase === 'neutral-preview'
                  ? 'Neutral world'
                  : matchSetup.setupPhase === 'assignment-in-progress'
                    ? 'Drafting'
                    : matchSetup.assignmentMode === 'random'
                      ? `Ready · Variant ${matchSetup.ownershipVariant}`
                      : 'Draft ready'}
              </span>
            </div>
          }
          controls={
            <>
              <fieldset
                className="assignment-modes"
                disabled={
                  matchSetup.setupPhase !== 'neutral-preview' ||
                  operation !== null
                }
              >
                <legend>Territory assignment</legend>
                <label
                  className={
                    matchSetup.assignmentMode === 'random' ? 'selected' : ''
                  }
                >
                  <input
                    type="radio"
                    name="assignment-mode"
                    value="random"
                    checked={matchSetup.assignmentMode === 'random'}
                    onChange={() => setAssignmentMode('random')}
                  />
                  <span>
                    <strong>Random assignment</strong>
                  </span>
                </label>
                <label
                  className={
                    matchSetup.assignmentMode === 'player-draft'
                      ? 'selected'
                      : ''
                  }
                >
                  <input
                    type="radio"
                    name="assignment-mode"
                    value="player-draft"
                    checked={matchSetup.assignmentMode === 'player-draft'}
                    onChange={() => setAssignmentMode('player-draft')}
                  />
                  <span>
                    <strong>Player draft</strong>
                  </span>
                </label>
              </fieldset>
              <p className="assignment-description">
                {matchSetup.assignmentMode === 'random'
                  ? 'Deterministically distributes balanced starting ownership.'
                  : 'Local players choose unowned territories in round-robin order.'}
              </p>

              {matchSetup.setupPhase === 'neutral-preview' && (
                <section className="neutral-preview-card" aria-live="polite">
                  <strong>Neutral geography preview</strong>
                  <p>
                    All {planet.territories.length} territories are unowned.
                    Balance results will appear after ownership exists.
                  </p>
                </section>
              )}

              {drafting && activePlayer && (
                <section
                  className="draft-card"
                  aria-labelledby="draft-turn-title"
                >
                  <span className="eyebrow">
                    Pick {drafting.draft.pickIndex + 1} of{' '}
                    {planet.territories.length}
                  </span>
                  <h2 id="draft-turn-title">{activePlayer.name} chooses now</h2>
                  <p>
                    Select an unowned territory on the globe or use this
                    keyboard-ready list. Turns follow seat order and repeat
                    until the world is owned.
                  </p>
                  <label>
                    Territory to claim
                    <select
                      value={selectedDraftTerritoryId}
                      onChange={(event) =>
                        setSelectedDraftTerritoryId(event.target.value)
                      }
                    >
                      {planet.territories.map((territory) => {
                        const ownerId =
                          drafting.draft.territoryOwners[territory.id];
                        const owner = orderedPlayers.find(
                          (player) => player.id === ownerId,
                        );
                        return (
                          <option key={territory.id} value={territory.id}>
                            {territory.name}
                            {owner
                              ? ` — claimed by ${owner.name}`
                              : ' — unowned'}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => pickDraftTerritory(selectedDraftTerritoryId)}
                  >
                    Claim for {activePlayer.name}
                  </button>
                  <div className="draft-totals" aria-label="Draft totals">
                    {orderedPlayers.map((player) => (
                      <span key={player.id}>
                        {player.name}:{' '}
                        {
                          Object.values(drafting.draft.territoryOwners).filter(
                            (ownerId) => ownerId === player.id,
                          ).length
                        }
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {analysis && ready && (
                <section
                  className={`balance-card ${analysis.rating}`}
                  aria-live="polite"
                >
                  <div>
                    <span className="eyebrow">
                      {ready.assignmentMode === 'random'
                        ? 'Starting balance'
                        : 'Advisory balance'}
                    </span>
                    <strong>
                      {analysis.rating} — {analysis.overallScore}/100
                    </strong>
                  </div>
                  <dl className="balance-summary">
                    <div>
                      <dt>Territories by seat</dt>
                      <dd>
                        {analysis.players
                          .map((item) => item.territoryCount)
                          .join(' · ')}
                      </dd>
                    </div>
                    <div>
                      <dt>Sea access</dt>
                      <dd>
                        {analysis.players
                          .map((item) => item.seaRouteEndpointCount)
                          .join(' · ')}
                      </dd>
                    </div>
                    <div>
                      <dt>Border territories</dt>
                      <dd>
                        {analysis.players
                          .map((item) => item.borderTerritoryCount)
                          .join(' · ')}
                      </dd>
                    </div>
                    <div>
                      <dt>Full continents</dt>
                      <dd>
                        {analysis.players.reduce(
                          (sum, item) => sum + item.fullyOwnedContinentCount,
                          0,
                        )}
                      </dd>
                    </div>
                  </dl>
                  {ready.assignmentMode === 'player-draft' && (
                    <p className="advisory-copy">
                      Draft balance is advisory. Intentional clusters do not
                      block play; only incomplete or structurally invalid
                      ownership does.
                    </p>
                  )}
                  {analysis.warnings.length > 0 && (
                    <ul>
                      {analysis.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                  {analysis.hardFailureReasons.length > 0 && (
                    <div className="balance-blockers" role="alert">
                      <strong>Start blocked</strong>
                      <ul>
                        {analysis.hardFailureReasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <details className="balance-details">
                    <summary>How is this scored?</summary>
                    <p>
                      Eight categories compare totals, ownership regions,
                      access, and exposure. Random assignments apply fairness
                      blockers; player drafts apply structural blockers and show
                      strategy warnings as advice.
                    </p>
                  </details>
                </section>
              )}

              {errors.length > 0 && (
                <div className="action-feedback error" role="alert">
                  {errors.map((error) => (
                    <span key={error}>{error}</span>
                  ))}
                </div>
              )}
              {feedback && (
                <div
                  className={`action-feedback ${invalidFeedback ? 'error' : ''}`}
                  role={invalidFeedback ? 'alert' : 'status'}
                >
                  <span>{feedback}</span>
                </div>
              )}
              {(saveMessage || saveError) && (
                <div
                  className={`action-feedback ${saveError ? 'error' : ''}`}
                  role={saveError ? 'alert' : 'status'}
                >
                  <span>{saveError ?? saveMessage}</span>
                </div>
              )}
            </>
          }
        />
      }
      actions={
        <SetupActionBar
          primary={
            <>
              {matchSetup.setupPhase === 'neutral-preview' && (
                <button
                  type="button"
                  onClick={() => void beginAssignment()}
                  disabled={errors.length > 0 || operation !== null}
                  aria-busy={operation === 'assign-territories'}
                >
                  {operation === 'assign-territories'
                    ? matchSetup.assignmentMode === 'random'
                      ? 'Assigning…'
                      : 'Starting draft…'
                    : matchSetup.assignmentMode === 'random'
                      ? 'Assign territories'
                      : 'Start player draft'}
                </button>
              )}
              {ready && (
                <button
                  type="button"
                  onClick={() => void start()}
                  disabled={
                    errors.length > 0 ||
                    analysis?.hardFailure ||
                    operation !== null
                  }
                  aria-busy={operation === 'start-game'}
                >
                  {operation === 'start-game' ? 'Beginning…' : 'Begin Match'}
                </button>
              )}
            </>
          }
          secondary={
            <>
              <button
                type="button"
                className="secondary"
                onClick={back}
                disabled={operation !== null}
              >
                World settings
              </button>
              <button
                type="button"
                className="secondary"
                onClick={save}
                disabled={operation !== null}
              >
                Save setup
              </button>
              {drafting && (
                <>
                  <button
                    type="button"
                    className="secondary"
                    onClick={cancelAssignment}
                    disabled={operation !== null}
                  >
                    Cancel draft
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={restartDraft}
                    disabled={operation !== null}
                  >
                    Restart draft
                  </button>
                </>
              )}
              {ready && (
                <>
                  <button
                    type="button"
                    className="secondary"
                    onClick={
                      ready.assignmentMode === 'random'
                        ? () => void reroll()
                        : restartDraft
                    }
                    disabled={operation !== null}
                    aria-busy={operation === 'reroll-territories'}
                  >
                    {ready.assignmentMode === 'random'
                      ? operation === 'reroll-territories'
                        ? 'Rerolling…'
                        : 'Reroll territories'
                      : 'Restart draft'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={cancelAssignment}
                    disabled={operation !== null}
                  >
                    Change strategy
                  </button>
                </>
              )}
            </>
          }
          status={
            <span className="sr-only" aria-live="polite">
              {drafting && activePlayer
                ? `${activePlayer.name}'s turn to pick. ${planet.territories.length - drafting.draft.pickIndex} territories remain.`
                : feedback}
            </span>
          }
        />
      }
    />
  );
}
