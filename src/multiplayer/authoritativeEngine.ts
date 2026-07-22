import { createMatch } from '../core/game/createMatch.ts';
import type { MatchState } from '../core/game/types.ts';
import { GENERATOR_VERSION } from '../core/generation/constants.ts';
import { generatePlanet } from '../core/generation/generatePlanet.ts';
import type { PlanetDefinition } from '../core/types/planet.ts';
import type { LocalPlayerConfig } from '../core/setup/playerConfig.ts';
import { generateStartingPosition } from '../core/setup/startingPositions.ts';
import { sha256Fingerprint } from './gameProtocol.ts';

export interface ClaimedSeat {
  seatIndex: number;
  userId: string;
  displayName: string;
  controllerType: 'human';
}

export interface AuthoritativeSeat extends ClaimedSeat {
  playerId: string;
}

export interface AuthoritativeMatchInitialization {
  setupSnapshot: Record<string, unknown>;
  seatOrderSnapshot: AuthoritativeSeat[];
  generatorMetadata: Record<string, unknown>;
  planet: PlanetDefinition;
  state: MatchState;
  stateFingerprint: string;
}

export async function createAuthoritativeMatch(
  matchId: string,
  room: {
    id: string;
    seed: string;
    territory_count: number;
    continent_count: number;
    assignment_mode: string;
  },
  claimedSeats: ClaimedSeat[],
): Promise<AuthoritativeMatchInitialization> {
  if (room.assignment_mode !== 'random') {
    throw new Error('multiplayer_draft_unsupported');
  }
  const seats = claimedSeats.slice().sort((a, b) => a.seatIndex - b.seatIndex);
  if (seats.length < 2 || seats.length > 5) {
    throw new Error('not_enough_players');
  }
  const players: LocalPlayerConfig[] = seats.map((seat, index) => ({
    id: `player-${String(index + 1).padStart(2, '0')}`,
    name: seat.displayName,
    colorId: `color-${index + 1}`,
    seatIndex: index,
    controllerType: 'local-human',
  }));
  const seatOrderSnapshot: AuthoritativeSeat[] = seats.map((seat, index) => ({
    ...seat,
    playerId: players[index]!.id,
  }));
  const planet = generatePlanet(room.seed, {
    territoryCount: room.territory_count,
    continentCount: room.continent_count,
    playerCount: players.length,
  });
  const startingPosition = generateStartingPosition(planet, players, 0);
  const setup = {
    players,
    assignmentMode: 'random' as const,
    ownershipVariant: 0,
    setupPhase: 'ready' as const,
    startingPosition,
    draft: null,
  };
  const matchSeed = `${room.seed}|multiplayer|${room.id}`;
  const state = {
    ...createMatch(planet, setup, { matchSeed }),
    matchId,
  };
  return {
    setupSnapshot: {
      version: 2,
      seed: room.seed,
      territoryCount: room.territory_count,
      continentCount: room.continent_count,
      playerCount: players.length,
      assignmentMode: 'random',
      ownershipVariant: 0,
    },
    seatOrderSnapshot,
    generatorMetadata: {
      generatorVersion: GENERATOR_VERSION,
      worldSetupVersion: 1,
      correctionProfile: 'corrected-v1',
      authorityVersion: 1,
    },
    planet,
    state,
    stateFingerprint: await sha256Fingerprint(state),
  };
}
