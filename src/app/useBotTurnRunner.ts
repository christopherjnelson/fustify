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
      return `Reinforced ${name(action.territoryId)} with ${action.amount}.`;
    case 'ATTACK':
      return `Attacked ${name(action.toTerritoryId)} from ${name(action.fromTerritoryId)}.`;
    case 'MOVE_AFTER_CAPTURE':
      return `Moved ${action.amount} armies into ${name(action.toTerritoryId)}.`;
    case 'FORTIFY':
      return `Fortified ${name(action.toTerritoryId)} from ${name(action.fromTerritoryId)}.`;
    case 'END_ATTACK_PHASE':
      return 'Ended attack phase.';
    case 'SKIP_FORTIFY':
      return 'Ended fortification without moving armies.';
    case 'END_TURN':
      return 'Ended turn.';
  }
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new DOMException('Bot action canceled.', 'AbortError'));
      },
      { once: true },
    );
  });
}

/** Runs at most one asynchronous decision per canonical state fingerprint. */
export function useBotTurnRunner() {
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
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const pacing = reducedMotion ? 0 : 360;
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
        await delay(pacing, abort.signal);
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
      setBotExecution({
        phase: 'applying',
        playerId,
        summary: actionSummary(
          command,
          new Map(planet.territories.map((item) => [item.id, item.name])),
        ),
        error: null,
        ...highlights,
      });
      await delay(pacing, abort.signal);
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
    planet,
    setBotExecution,
  ]);
}
