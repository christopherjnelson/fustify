import { useEffect, useMemo } from 'react';
import {
  controllerDecisionSeed,
  controllerStreamIdForObservation,
  createGameObservation,
  deterministicFallback,
  getLegalGameCommands,
  heuristicController,
} from '../core/controllers';
import { commandFingerprint } from '../core/controllers/observation';
import type { GameCommand } from '../core/controllers/types';
import { useGameStore } from '../state/useGameStore';
import { BRAND } from '../branding';
import { useBotPacingPreference } from '../browser/botPacingPreference';
import { waitForBotPacing } from './botPacingDelay';

function sameCommand(left: GameCommand, right: GameCommand): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function actionTerritories(action: GameCommand) {
  if (action.type === 'PLACE_REINFORCEMENT') {
    return { sourceTerritoryId: action.territoryId, targetTerritoryId: null };
  }
  if (
    action.type === 'ATTACK' ||
    action.type === 'MOVE_AFTER_CAPTURE' ||
    action.type === 'FORTIFY'
  ) {
    return {
      sourceTerritoryId: action.fromTerritoryId,
      targetTerritoryId: action.toTerritoryId,
    };
  }
  return { sourceTerritoryId: null, targetTerritoryId: null };
}

function actionSummary(
  action: GameCommand,
  names: ReadonlyMap<string, string>,
): string {
  const name = (id: string) => names.get(id) ?? id;
  switch (action.type) {
    case 'PLACE_REINFORCEMENT':
      return `Reinforcing ${name(action.territoryId)} with ${action.amount}.`;
    case 'ATTACK':
      return `Attacking ${name(action.toTerritoryId)} from ${name(action.fromTerritoryId)}.`;
    case 'MOVE_AFTER_CAPTURE':
      return `Moving ${action.amount} armies into ${name(action.toTerritoryId)}.`;
    case 'FORTIFY':
      return `Fortifying ${name(action.toTerritoryId)} from ${name(action.fromTerritoryId)}.`;
    case 'END_ATTACK_PHASE':
      return 'Ending the attack phase.';
    case 'SKIP_FORTIFY':
      return 'Ending fortification without moving armies.';
    case 'END_TURN':
      return 'Ending the turn.';
  }
}

/** Runs at most one asynchronous decision per canonical state fingerprint. */
export function useBotTurnRunner() {
  const [pacingMode] = useBotPacingPreference();
  const mode = useGameStore((state) => state.applicationMode);
  const match = useGameStore((state) => state.match);
  const planet = useGameStore((state) => state.planet);
  const players = useGameStore((state) => state.matchSetup.players);
  const beginBotTurn = useGameStore((state) => state.beginBotTurn);
  const dispatchControllerAction = useGameStore(
    (state) => state.dispatchControllerAction,
  );
  const setBotExecution = useGameStore((state) => state.setBotExecution);
  const controllerEpoch = useGameStore((state) => state.controllerEpoch);
  const activePlayer = players.find(
    (player) => player.id === match?.activePlayerId,
  );
  const fingerprint = useMemo(
    () => (match ? commandFingerprint(match) : null),
    [match],
  );

  useEffect(() => {
    if (
      import.meta.env.DEV &&
      new URLSearchParams(window.location.search).get('visual-review') === '1'
    ) {
      return;
    }
    if (!match || activePlayer?.controllerType !== 'heuristic-bot') {
      setBotExecution({
        phase: 'idle',
        playerId: null,
        summary: null,
        error: null,
        sourceTerritoryId: null,
        targetTerritoryId: null,
      });
      return;
    }
    if (mode === 'game-over') return;
    const abort = new AbortController();
    const playerId = activePlayer.id;

    const run = async () => {
      if (mode === 'handoff') {
        setBotExecution({
          phase: 'thinking',
          playerId,
          summary: `${activePlayer.name} is preparing the turn.`,
          error: null,
          sourceTerritoryId: null,
          targetTerritoryId: null,
        });
        beginBotTurn(match.matchId, playerId);
        return;
      }
      if (mode !== 'playing' || !fingerprint) return;
      const legalActions = getLegalGameCommands(planet, match);
      const observation = createGameObservation(planet, match);
      const decisionIndex = match.events.length + match.combatSequence;
      setBotExecution({
        phase: 'thinking',
        playerId,
        summary: `${activePlayer.name} is choosing a legal action.`,
        error: null,
        sourceTerritoryId: null,
        targetTerritoryId: null,
      });

      let command: GameCommand;
      try {
        const controllerStreamId =
          controllerStreamIdForObservation(observation);
        command = await heuristicController.chooseAction(
          observation,
          Object.freeze(structuredClone(legalActions)),
          {
            controllerType: 'heuristic-bot',
            controllerVersion: heuristicController.version,
            controllerStreamId,
            decisionIndex,
            decisionSeed: controllerDecisionSeed(
              observation,
              decisionIndex,
              controllerStreamId,
            ),
          },
        );
        if (!legalActions.some((legal) => sameCommand(legal, command))) {
          throw new Error(
            'Controller returned a command outside the legal set.',
          );
        }
      } catch (error) {
        const fallback = deterministicFallback(legalActions);
        console.error(`${BRAND.productName} controller failure`, {
          matchId: match.matchId,
          turnNumber: match.turnNumber,
          phase: match.phase,
          playerId,
          error: error instanceof Error ? error.message : String(error),
          fallback,
        });
        if (!fallback) {
          setBotExecution({
            phase: 'error',
            playerId,
            summary: null,
            error: 'The bot has no safe legal action.',
            sourceTerritoryId: null,
            targetTerritoryId: null,
          });
          return;
        }
        command = fallback;
      }

      const highlights = actionTerritories(command);
      const summary = actionSummary(
        command,
        new Map(planet.territories.map((item) => [item.id, item.name])),
      );
      setBotExecution({
        phase: 'applying',
        playerId,
        summary:
          pacingMode === 'instant'
            ? summary
            : `${summary} Waiting before this action for readability.`,
        error: null,
        ...highlights,
      });
      await waitForBotPacing(pacingMode, abort.signal);
      if (abort.signal.aborted) return;
      dispatchControllerAction(command, fingerprint, controllerEpoch);
    };

    void run().catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setBotExecution({
        phase: 'error',
        playerId,
        summary: null,
        error: error instanceof Error ? error.message : String(error),
        sourceTerritoryId: null,
        targetTerritoryId: null,
      });
    });
    return () => abort.abort();
  }, [
    activePlayer?.controllerType,
    activePlayer?.id,
    activePlayer?.name,
    beginBotTurn,
    controllerEpoch,
    dispatchControllerAction,
    fingerprint?.activePlayerId,
    fingerprint?.combatSequence,
    fingerprint?.eventCount,
    fingerprint?.matchId,
    fingerprint?.phase,
    fingerprint?.turnNumber,
    fingerprint,
    match,
    mode,
    pacingMode,
    planet,
    setBotExecution,
  ]);
}
