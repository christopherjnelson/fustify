import type { MatchEvent } from './types';

export function eventFocusTerritoryId(event: MatchEvent): string | null {
  switch (event.type) {
    case 'armies-placed':
      return (
        event.primaryTerritoryId ??
        event.territoryId ??
        event.targetTerritoryId ??
        null
      );
    case 'combat':
    case 'territory-captured':
    case 'capture-move':
    case 'fortification-completed':
      return (
        event.primaryTerritoryId ??
        event.targetTerritoryId ??
        event.territoryId ??
        null
      );
    case 'player-eliminated':
    case 'match-won':
      return event.primaryTerritoryId ?? event.targetTerritoryId ?? null;
    case 'turn-started':
    case 'reinforcements-received':
    case 'attack-phase-ended':
    case 'fortification-skipped':
    case 'turn-ended':
      return event.primaryTerritoryId ?? null;
  }
}
