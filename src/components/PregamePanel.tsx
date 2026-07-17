import type { CSSProperties } from 'react';
import { PLAYER_COLORS, playerColorValue } from '../core/setup/playerConfig';
import { useGameStore } from '../state/useGameStore';

export function PregamePanel() {
  const setup = useGameStore((state) => state.setup);
  const matchSetup = useGameStore((state) => state.matchSetup);
  const errors = useGameStore((state) => state.playerSetupErrors);
  const updatePlayer = useGameStore((state) => state.updatePlayer);
  const reroll = useGameStore((state) => state.rerollOwnership);
  const start = useGameStore((state) => state.startMatch);
  const back = useGameStore((state) => state.backToWorldSetup);
  const analysis = matchSetup.startingPosition.analysis;
  const metricByPlayer = new Map(
    analysis.players.map((metric) => [metric.playerId, metric]),
  );

  return (
    <aside
      className="setup-panel pregame-panel"
      aria-labelledby="pregame-title"
    >
      <div className="setup-heading-row">
        <div>
          <span className="eyebrow">Pregame · {setup.seed}</span>
          <h1 id="pregame-title">Choose your factions</h1>
        </div>
        <span className="variant-badge">
          Variant {matchSetup.ownershipVariant}
        </span>
      </div>
      <p>
        Edit names and choose distinct colors, then review the globe preview.
      </p>

      <div className="player-config-list">
        {matchSetup.players
          .slice()
          .sort((a, b) => a.seatIndex - b.seatIndex)
          .map((player) => {
            const metric = metricByPlayer.get(player.id)!;
            const usedColors = new Set(
              matchSetup.players
                .filter((item) => item.id !== player.id)
                .map((item) => item.colorId),
            );
            return (
              <section
                className="player-config"
                key={player.id}
                style={
                  {
                    '--player-color': playerColorValue(player.colorId),
                  } as CSSProperties
                }
              >
                <span
                  className="player-seat"
                  aria-label={`Seat ${player.seatIndex + 1}`}
                >
                  {player.seatIndex + 1}
                </span>
                <label>
                  <span className="sr-only">
                    Player {player.seatIndex + 1} name
                  </span>
                  <input
                    value={player.name}
                    onChange={(event) =>
                      updatePlayer(player.id, { name: event.target.value })
                    }
                    aria-label={`Player ${player.seatIndex + 1} name`}
                  />
                </label>
                <label>
                  <span className="sr-only">{player.name} color</span>
                  <select
                    value={player.colorId}
                    onChange={(event) =>
                      updatePlayer(player.id, { colorId: event.target.value })
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
                <span className="player-preview" aria-hidden="true">
                  ◆
                </span>
                <small>
                  {metric.territoryCount} territories · {metric.armyCount}{' '}
                  armies · {metric.connectedComponentCount} ownership region
                  {metric.connectedComponentCount === 1 ? '' : 's'} · largest{' '}
                  {metric.largestComponentSize}
                </small>
              </section>
            );
          })}
      </div>

      <section className={`balance-card ${analysis.rating}`} aria-live="polite">
        <div>
          <span className="eyebrow">Starting balance</span>
          <strong>
            {analysis.rating} — {analysis.overallScore}/100
          </strong>
        </div>
        <dl className="balance-summary">
          <div>
            <dt>Territory spread</dt>
            <dd>≤ 1</dd>
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
            Eight 0–100 categories reward equal totals, distributed ownership,
            broad access, and comparable exposure. Hard-invalid layouts are
            rejected before score comparison.
          </p>
          <dl>
            <div><dt>Territory parity</dt><dd>{analysis.breakdown.territoryParity}</dd></div>
            <div><dt>Army parity</dt><dd>{analysis.breakdown.armyParity}</dd></div>
            <div><dt>Continent fairness</dt><dd>{analysis.breakdown.continentFairness}</dd></div>
            <div><dt>Ownership regions</dt><dd>{analysis.breakdown.connectivityDistribution}</dd></div>
            <div><dt>World spread</dt><dd>{analysis.breakdown.geographicSpread}</dd></div>
            <div><dt>Border exposure</dt><dd>{analysis.breakdown.borderExposure}</dd></div>
            <div><dt>Sea-route access</dt><dd>{analysis.breakdown.seaRouteAccess}</dd></div>
            <div><dt>Gateway access</dt><dd>{analysis.breakdown.gatewayAccess}</dd></div>
          </dl>
          <div className="player-balance-details">
            {matchSetup.players.slice().sort((a, b) => a.seatIndex - b.seatIndex).map((player) => {
              const metric = metricByPlayer.get(player.id)!;
              return (
                <p key={player.id}>
                  <strong>{player.name}</strong>: {metric.connectedComponentCount} regions,
                  largest {metric.largestComponentSize}; {Math.round(metric.maximumContinentShare * 100)}%
                  max continent share; {metric.seaRouteEndpointCount} sea endpoints;{' '}
                  {metric.borderTerritoryCount} border territories.
                </p>
              );
            })}
          </div>
        </details>
      </section>

      {errors.length > 0 && (
        <div className="action-feedback error" role="alert">
          {errors.map((error) => (
            <span key={error}>{error}</span>
          ))}
        </div>
      )}
      <div className="pregame-actions">
        <button type="button" className="secondary" onClick={back}>
          Back to world setup
        </button>
        <button type="button" className="secondary" onClick={reroll}>
          Reroll ownership
        </button>
        <button
          type="button"
          onClick={start}
          disabled={errors.length > 0 || analysis.hardFailure}
        >
          Start match
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        Ownership variant {matchSetup.ownershipVariant}. Balance{' '}
        {analysis.rating}, {analysis.overallScore} out of 100.
      </span>
    </aside>
  );
}
