import type { MatchEvent } from '../core/game/types';

export type MatchEventIconName =
  | 'reinforcement'
  | 'combat'
  | 'capture'
  | 'movement'
  | 'fortification'
  | 'turn'
  | 'victory'
  | 'elimination'
  | 'generic';

export function matchEventIconName(event: MatchEvent): MatchEventIconName {
  switch (event.type) {
    case 'reinforcements-received':
    case 'armies-placed':
      return 'reinforcement';
    case 'combat':
      return 'combat';
    case 'territory-captured':
      return 'capture';
    case 'capture-move':
      return 'movement';
    case 'fortification-completed':
    case 'fortification-skipped':
      return 'fortification';
    case 'turn-started':
    case 'attack-phase-ended':
    case 'turn-ended':
      return 'turn';
    case 'match-won':
      return 'victory';
    case 'player-eliminated':
      return 'elimination';
    default:
      return 'generic';
  }
}
