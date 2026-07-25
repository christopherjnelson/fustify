import { createMatch } from '../core/game/createMatch.ts';
import type { MatchState } from '../core/game/types.ts';
import {
  generatorProfile,
  resolveGeneratorVersion,
} from '../core/generation/constants.ts';
import { generatePlanet } from '../core/generation/generatePlanet.ts';
import type { PlanetDefinition } from '../core/types/planet.ts';
import { generateStartingPosition } from '../core/setup/startingPositions.ts';
import { sha256Fingerprint } from './gameProtocol.ts';
import { createMultiplayerPlayerConfigs } from './multiplayerPlayerConfig.ts';

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
    generator_version?: number | null;
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
  const seatOrderSnapshot: AuthoritativeSeat[] = seats.map((seat, index) => ({
    ...seat,
    playerId: `player-${String(index + 1).padStart(2, '0')}`,
  }));
  const players = createMultiplayerPlayerConfigs(seatOrderSnapshot);
  const generatorVersion = resolveGeneratorVersion(room.generator_version);
  const planet = generatePlanet(room.seed, {
    territoryCount: room.territory_count,
    continentCount: room.continent_count,
    playerCount: players.length,
    generatorVersion,
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
      generatorVersion,
      assignmentMode: 'random',
      ownershipVariant: 0,
    },
    seatOrderSnapshot,
    generatorMetadata: {
      generatorVersion,
      worldSetupVersion: 1,
      profile: generatorProfile(generatorVersion),
      authorityVersion: 1,
    },
    planet,
    state,
    stateFingerprint: await sha256Fingerprint(state),
  };
}
