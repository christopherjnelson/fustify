import type { GameAction, MatchState } from '../core/game/types.ts';

export interface GameplayCommandRequest {
  operation: 'command';
  matchId: string;
  expectedRevision: number;
  idempotencyKey: string;
  action: GameAction;
}

export interface StartMatchRequest {
  operation: 'start';
  roomId: string;
}

export type MultiplayerGameRequest = GameplayCommandRequest | StartMatchRequest;

export interface AuthoritativeCommandResult {
  acceptedRevision: number;
  stateFingerprint: string;
  duplicate: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string' || field.length === 0) {
    throw new Error('invalid_action');
  }
  return field;
}

function integerField(value: Record<string, unknown>, key: string): number {
  const field = value[key];
  if (!Number.isSafeInteger(field)) throw new Error('invalid_action');
  return field as number;
}

/** Rejects extra fields so a client cannot smuggle dice or resulting state. */
export function parseGameAction(value: unknown): GameAction {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error('invalid_action');
  }
  switch (value.type) {
    case 'SELECT_TERRITORY':
      if (!exactKeys(value, ['type', 'territoryId']))
        throw new Error('invalid_action');
      if (value.territoryId !== null && typeof value.territoryId !== 'string')
        throw new Error('invalid_action');
      return {
        type: value.type,
        territoryId: value.territoryId as string | null,
      };
    case 'PLACE_REINFORCEMENT':
      if (!exactKeys(value, ['type', 'territoryId', 'amount']))
        throw new Error('invalid_action');
      return {
        type: value.type,
        territoryId: stringField(value, 'territoryId'),
        amount: integerField(value, 'amount'),
      };
    case 'ATTACK':
      if (
        !exactKeys(value, [
          'type',
          'fromTerritoryId',
          'toTerritoryId',
          'attackDice',
        ])
      )
        throw new Error('invalid_action');
      return {
        type: value.type,
        fromTerritoryId: stringField(value, 'fromTerritoryId'),
        toTerritoryId: stringField(value, 'toTerritoryId'),
        attackDice: integerField(value, 'attackDice'),
      };
    case 'MOVE_AFTER_CAPTURE':
    case 'FORTIFY':
      if (
        !exactKeys(value, [
          'type',
          'fromTerritoryId',
          'toTerritoryId',
          'amount',
        ])
      )
        throw new Error('invalid_action');
      return {
        type: value.type,
        fromTerritoryId: stringField(value, 'fromTerritoryId'),
        toTerritoryId: stringField(value, 'toTerritoryId'),
        amount: integerField(value, 'amount'),
      };
    case 'END_ATTACK_PHASE':
    case 'SKIP_FORTIFY':
    case 'END_TURN':
      if (!exactKeys(value, ['type'])) throw new Error('invalid_action');
      return { type: value.type };
    default:
      throw new Error('invalid_action');
  }
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

export async function sha256Fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function isMatchState(value: unknown): value is MatchState {
  if (!isRecord(value)) return false;
  return (
    typeof value.matchId === 'string' &&
    typeof value.seed === 'string' &&
    Number.isSafeInteger(value.turnNumber) &&
    typeof value.activePlayerId === 'string' &&
    typeof value.phase === 'string' &&
    isRecord(value.territories) &&
    isRecord(value.players) &&
    Array.isArray(value.events)
  );
}
