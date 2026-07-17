import type { MatchEvent, MatchEventType, MatchState } from './types';

export function makeEvent(
  state: Pick<MatchState, 'events' | 'turnNumber'>,
  type: MatchEventType,
  message: string,
  details: Omit<
    Partial<MatchEvent>,
    'id' | 'turnNumber' | 'type' | 'message'
  > = {},
): MatchEvent {
  return {
    id: `event-${state.events.length + 1}`,
    turnNumber: state.turnNumber,
    type,
    message,
    ...details,
  };
}
