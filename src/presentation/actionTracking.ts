import { eventFocusTerritoryId } from '../core/game/eventFocus';
import type { MatchEvent } from '../core/game/types';
import type { GeographicPoint } from '../core/minimap/projection';

export const ACTION_CUE_DURATION_MS = 1_800;
export const ACTION_FOLLOW_RECENTER_DEGREES = 25;

export type ActionCueKind =
  'reinforcement' | 'combat' | 'capture' | 'movement' | 'fortification';

export type FollowActionState = 'off' | 'following' | 'paused';
export type FollowActionTransition = 'enable' | 'disable' | 'pause' | 'reset';

export interface ActionCue {
  matchId: string;
  eventId: string;
  sourceTerritoryId: string | null;
  targetTerritoryId: string;
  kind: ActionCueKind;
  sequence: number;
}

export interface ActionEventTracking {
  matchId: string;
  eventIds: string[];
  sequence: number;
}

export interface ActionEventReconciliation {
  tracking: ActionEventTracking;
  cue: ActionCue | null;
}

export function transitionFollowAction(
  current: FollowActionState,
  transition: FollowActionTransition,
): FollowActionState {
  if (transition === 'enable') return 'following';
  if (transition === 'disable' || transition === 'reset') return 'off';
  return current === 'following' ? 'paused' : current;
}

function cueKind(event: MatchEvent): ActionCueKind | null {
  switch (event.type) {
    case 'armies-placed':
      return 'reinforcement';
    case 'combat':
      return 'combat';
    case 'territory-captured':
      return 'capture';
    case 'capture-move':
      return 'movement';
    case 'fortification-completed':
      return 'fortification';
    case 'turn-started':
    case 'reinforcements-received':
    case 'player-eliminated':
    case 'attack-phase-ended':
    case 'fortification-skipped':
    case 'turn-ended':
    case 'match-won':
      return null;
  }
}

export function actionCueFromEvent(
  matchId: string,
  event: MatchEvent,
  sequence: number,
): ActionCue | null {
  const kind = cueKind(event);
  const targetTerritoryId = eventFocusTerritoryId(event);
  if (kind === null || targetTerritoryId === null) return null;
  return {
    matchId,
    eventId: event.id,
    sourceTerritoryId:
      kind === 'reinforcement' ? null : (event.sourceTerritoryId ?? null),
    targetTerritoryId,
    kind,
    sequence,
  };
}

export function reconcileActionEvents(
  previous: ActionEventTracking | null,
  matchId: string,
  events: readonly MatchEvent[],
): ActionEventReconciliation {
  const eventIds = events.map((event) => event.id);
  if (previous === null || previous.matchId !== matchId) {
    return {
      tracking: { matchId, eventIds, sequence: 0 },
      cue: null,
    };
  }

  const isAppend =
    eventIds.length >= previous.eventIds.length &&
    previous.eventIds.every((eventId, index) => eventIds[index] === eventId);
  if (!isAppend) {
    return {
      tracking: { ...previous, eventIds },
      cue: null,
    };
  }

  const appendedEvents = events.slice(previous.eventIds.length);
  const nextSequence = previous.sequence + 1;
  let cue: ActionCue | null = null;
  for (let index = appendedEvents.length - 1; index >= 0; index -= 1) {
    cue = actionCueFromEvent(matchId, appendedEvents[index]!, nextSequence);
    if (cue !== null) break;
  }

  return {
    tracking: {
      matchId,
      eventIds,
      sequence: cue === null ? previous.sequence : nextSequence,
    },
    cue,
  };
}

export function angularDistanceDegrees(
  first: GeographicPoint,
  second: GeographicPoint,
): number {
  const radians = Math.PI / 180;
  const firstLatitude = first.latitude * radians;
  const secondLatitude = second.latitude * radians;
  const longitudeDelta = (first.longitude - second.longitude) * radians;
  const cosine =
    Math.sin(firstLatitude) * Math.sin(secondLatitude) +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.cos(longitudeDelta);
  return Math.acos(Math.max(-1, Math.min(1, cosine))) / radians;
}

export function shouldRecenterAction(
  currentFocus: GeographicPoint,
  actionFocus: GeographicPoint,
): boolean {
  return (
    angularDistanceDegrees(currentFocus, actionFocus) >
    ACTION_FOLLOW_RECENTER_DEGREES
  );
}
