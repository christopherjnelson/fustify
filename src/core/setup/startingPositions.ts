import { createSeededRandom } from '../generation/seededRandom';
import { generateOwnershipAssignments } from '../generation/generatePlayers';
import type { PlanetDefinition } from '../types/planet';
import type { LocalPlayerConfig } from './playerConfig';

export interface PlayerStartingBalance {
  playerId: string;
  territoryCount: number;
  armyCount: number;
  connectedComponentCount: number;
  borderTerritoryCount: number;
  gatewayTerritoryCount: number;
  seaRouteEndpointCount: number;
  fullyOwnedContinentCount: number;
  averageDegree: number;
  landmassCount: number;
  isolatedTerritoryCount: number;
}

export interface StartingBalanceAnalysis {
  overallScore: number;
  rating: 'excellent' | 'good' | 'uneven' | 'poor';
  warnings: string[];
  hardFailure: boolean;
  players: PlayerStartingBalance[];
}

export interface StartingTerritoryState {
  ownerId: string;
  armyCount: number;
}

export interface StartingPosition {
  variant: number;
  candidateIndex: number;
  territories: Record<string, StartingTerritoryState>;
  analysis: StartingBalanceAnalysis;
}

export interface MatchSetup {
  players: LocalPlayerConfig[];
  ownershipVariant: number;
  startingPosition: StartingPosition;
}

export const STARTING_CANDIDATE_COUNT = 32;

export function startingArmyTotal(playerCount: number): number {
  return (
    ({ 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 } as Record<number, number>)[
      playerCount
    ] ?? 20
  );
}

function connectedComponents(
  ids: string[],
  ownerId: string,
  territories: Record<string, StartingTerritoryState>,
  adjacency: Map<string, string[]>,
): number {
  const remaining = new Set(ids);
  let count = 0;
  while (remaining.size > 0) {
    count += 1;
    const first = remaining.values().next().value as string;
    remaining.delete(first);
    const queue = [first];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const neighbor of adjacency.get(queue[cursor]!) ?? []) {
        if (
          remaining.has(neighbor) &&
          territories[neighbor]?.ownerId === ownerId
        ) {
          remaining.delete(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }
  return count;
}

export function analyzeStartingPosition(
  planet: PlanetDefinition,
  players: LocalPlayerConfig[],
  territories: Record<string, StartingTerritoryState>,
): StartingBalanceAnalysis {
  const adjacency = new Map(
    planet.territories.map((territory) => [
      territory.id,
      territory.adjacentTerritoryIds,
    ]),
  );
  const seaEndpoints = new Set(
    planet.connections
      .filter((connection) => connection.type === 'sea-route')
      .flatMap((connection) => [
        connection.fromTerritoryId,
        connection.toTerritoryId,
      ]),
  );
  const gatewayIds = new Set(planet.analysis.articulationTerritoryIds);
  const metrics = players
    .slice()
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((player) => {
      const ids = planet.territories
        .filter((territory) => territories[territory.id]?.ownerId === player.id)
        .map((territory) => territory.id);
      const idSet = new Set(ids);
      const borderTerritoryCount = ids.filter((id) =>
        (adjacency.get(id) ?? []).some((neighbor) => !idSet.has(neighbor)),
      ).length;
      const isolatedTerritoryCount = ids.filter(
        (id) =>
          !(adjacency.get(id) ?? []).some((neighbor) => idSet.has(neighbor)),
      ).length;
      return {
        playerId: player.id,
        territoryCount: ids.length,
        armyCount: ids.reduce(
          (sum, id) => sum + (territories[id]?.armyCount ?? 0),
          0,
        ),
        connectedComponentCount: connectedComponents(
          ids,
          player.id,
          territories,
          adjacency,
        ),
        borderTerritoryCount,
        gatewayTerritoryCount: ids.filter((id) => gatewayIds.has(id)).length,
        seaRouteEndpointCount: ids.filter((id) => seaEndpoints.has(id)).length,
        fullyOwnedContinentCount: planet.continents.filter((continent) =>
          continent.territoryIds.every((id) => idSet.has(id)),
        ).length,
        averageDegree:
          ids.reduce((sum, id) => sum + (adjacency.get(id)?.length ?? 0), 0) /
          Math.max(1, ids.length),
        landmassCount: new Set(
          planet.territories
            .filter((territory) => idSet.has(territory.id))
            .map((territory) => territory.landmassId),
        ).size,
        isolatedTerritoryCount,
      };
    });
  const range = (values: number[]) => Math.max(...values) - Math.min(...values);
  const territorySpread = range(metrics.map((item) => item.territoryCount));
  const armySpread = range(metrics.map((item) => item.armyCount));
  const componentPenalty = metrics.reduce(
    (sum, item) => sum + Math.max(0, item.connectedComponentCount - 1) * 7,
    0,
  );
  const borderSpread = range(metrics.map((item) => item.borderTerritoryCount));
  const seaSpread = range(metrics.map((item) => item.seaRouteEndpointCount));
  const gatewaySpread = range(
    metrics.map((item) => item.gatewayTerritoryCount),
  );
  const degreeSpread = range(metrics.map((item) => item.averageDegree));
  const landmassSpread = range(metrics.map((item) => item.landmassCount));
  const continentPenalty = metrics.reduce(
    (sum, item) => sum + item.fullyOwnedContinentCount * 16,
    0,
  );
  const isolatedPenalty = metrics.reduce(
    (sum, item) => sum + item.isolatedTerritoryCount * 5,
    0,
  );
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          territorySpread * 12 -
          armySpread * 5 -
          componentPenalty -
          borderSpread * 2 -
          seaSpread * 2 -
          gatewaySpread * 2 -
          degreeSpread * 3 -
          landmassSpread * 2 -
          continentPenalty -
          isolatedPenalty,
      ),
    ),
  );
  const warnings: string[] = [];
  if (metrics.some((item) => item.connectedComponentCount > 2))
    warnings.push('One or more players have a scattered starting position.');
  if (metrics.some((item) => item.fullyOwnedContinentCount > 0))
    warnings.push('A player begins with a complete continent.');
  if (seaSpread > 2) warnings.push('Sea-route access is uneven.');
  if (gatewaySpread > 2) warnings.push('Defensive gateway access is uneven.');
  const impermissibleContinentOwner = metrics.some((metric) => {
    const ownedIds = new Set(
      planet.territories
        .filter(
          (territory) => territories[territory.id]?.ownerId === metric.playerId,
        )
        .map((territory) => territory.id),
    );
    return planet.continents.some(
      (continent) =>
        continent.bonus >= 4 &&
        continent.territoryIds.every((id) => ownedIds.has(id)),
    );
  });
  const hardFailure =
    Object.keys(territories).length !== planet.territories.length ||
    metrics.some((item) => item.territoryCount === 0 || item.armyCount === 0) ||
    territorySpread > 1 ||
    armySpread > 1 ||
    impermissibleContinentOwner ||
    planet.territories.some(
      (territory) =>
        !territories[territory.id] || territories[territory.id]!.armyCount < 1,
    );
  return {
    overallScore: score,
    rating:
      score >= 90
        ? 'excellent'
        : score >= 75
          ? 'good'
          : score >= 55
            ? 'uneven'
            : 'poor',
    warnings,
    hardFailure,
    players: metrics,
  };
}

function createCandidate(
  planet: PlanetDefinition,
  players: LocalPlayerConfig[],
  variant: number,
  candidateIndex: number,
): StartingPosition {
  const orderedPlayers = players
    .slice()
    .sort((a, b) => a.seatIndex - b.seatIndex);
  const adjacency = planet.territories.map((territory) =>
    territory.adjacentTerritoryIds.map((id) =>
      planet.territories.findIndex((item) => item.id === id),
    ),
  );
  const candidateSeed = `${planet.seed}|v${planet.generatorVersion}|starting|${variant}|${candidateIndex}|${orderedPlayers.map((player) => player.id).join(',')}`;
  const assignments = generateOwnershipAssignments(
    adjacency,
    orderedPlayers.length,
    candidateSeed,
  );
  const total = startingArmyTotal(orderedPlayers.length);
  const territories: Record<string, StartingTerritoryState> = {};
  planet.territories.forEach((territory, index) => {
    territories[territory.id] = {
      ownerId: orderedPlayers[assignments[index]!]!.id,
      armyCount: 1,
    };
  });
  const random = createSeededRandom(`${candidateSeed}|armies`);
  for (const player of orderedPlayers) {
    const owned = planet.territories
      .filter((territory) => territories[territory.id]!.ownerId === player.id)
      .map((territory) => territory.id);
    let remaining = total - owned.length;
    let cursor = random.integer(0, Math.max(0, owned.length - 1));
    while (remaining > 0) {
      const id = owned[cursor % owned.length]!;
      territories[id]!.armyCount += 1;
      cursor += random.integer(1, Math.max(1, owned.length - 1));
      remaining -= 1;
    }
  }
  return {
    variant,
    candidateIndex,
    territories,
    analysis: analyzeStartingPosition(planet, orderedPlayers, territories),
  };
}

export function generateStartingPosition(
  planet: PlanetDefinition,
  players: LocalPlayerConfig[],
  variant: number,
  candidateCount = STARTING_CANDIDATE_COUNT,
): StartingPosition {
  let best: StartingPosition | null = null;
  for (let index = 0; index < candidateCount; index += 1) {
    let candidate: StartingPosition;
    try {
      candidate = createCandidate(planet, players, variant, index);
    } catch {
      continue;
    }
    if (candidate.analysis.hardFailure) continue;
    if (
      !best ||
      candidate.analysis.overallScore > best.analysis.overallScore ||
      (candidate.analysis.overallScore === best.analysis.overallScore &&
        candidate.candidateIndex < best.candidateIndex)
    ) {
      best = candidate;
    }
  }
  if (!best)
    throw new Error('No valid starting ownership candidate was found.');
  return best;
}

export function createMatchSetup(
  planet: PlanetDefinition,
  players: LocalPlayerConfig[],
  ownershipVariant = 0,
): MatchSetup {
  return {
    players,
    ownershipVariant,
    startingPosition: generateStartingPosition(
      planet,
      players,
      ownershipVariant,
    ),
  };
}
