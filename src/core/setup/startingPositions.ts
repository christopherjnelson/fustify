import { createSeededRandom } from '../generation/seededRandom';
import type { PlanetDefinition } from '../types/planet';
import type { LocalPlayerConfig } from './playerConfig';

export interface StartingBalanceBreakdown {
  territoryParity: number;
  armyParity: number;
  continentFairness: number;
  connectivityDistribution: number;
  geographicSpread: number;
  borderExposure: number;
  seaRouteAccess: number;
  gatewayAccess: number;
}

export interface PlayerStartingBalance {
  playerId: string;
  territoryCount: number;
  armyCount: number;
  connectedComponentCount: number;
  largestComponentSize: number;
  largestComponentRatio: number;
  sameOwnerAdjacencyRatio: number;
  geographicSpread: number;
  borderTerritoryCount: number;
  gatewayTerritoryCount: number;
  seaRouteEndpointCount: number;
  fullyOwnedContinentCount: number;
  maximumContinentShare: number;
  majorityContinentCount: number;
  nearCompleteContinentCount: number;
  potentialStartingBonus: number;
  averageDegree: number;
  landmassCount: number;
  isolatedTerritoryCount: number;
}

export interface StartingBalanceAnalysis {
  overallScore: number;
  rating: 'excellent' | 'good' | 'uneven' | 'poor';
  breakdown: StartingBalanceBreakdown;
  warnings: string[];
  hardFailure: boolean;
  hardFailureReasons: string[];
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

export interface StartingComponentTarget {
  minimum: number;
  preferred: number;
  maximum: number;
}

/** Category weights used to derive the visible overall score. */
export const STARTING_BALANCE_WEIGHTS: Record<
  keyof StartingBalanceBreakdown,
  number
> = {
  territoryParity: 0.16,
  armyParity: 0.12,
  continentFairness: 0.18,
  connectivityDistribution: 0.18,
  geographicSpread: 0.1,
  borderExposure: 0.1,
  seaRouteAccess: 0.08,
  gatewayAccess: 0.08,
};

export function startingArmyTotal(playerCount: number): number {
  return (
    ({ 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 } as Record<number, number>)[
      playerCount
    ] ?? 20
  );
}

const clampScore = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));
const range = (values: number[]) =>
  values.length ? Math.max(...values) - Math.min(...values) : 0;

/** Scales from one useful region in tiny positions to a 2–5 region default range. */
export function startingComponentTarget(
  territoryCount: number,
): StartingComponentTarget {
  const maximum = Math.max(1, Math.min(5, territoryCount));
  const minimum = territoryCount < 4 ? 1 : 2;
  return {
    minimum,
    preferred: Math.max(
      minimum,
      Math.min(maximum, Math.round(Math.sqrt(territoryCount))),
    ),
    maximum,
  };
}

function componentSizes(
  ids: string[],
  adjacency: Map<string, string[]>,
): number[] {
  const remaining = new Set(ids);
  const sizes: number[] = [];
  while (remaining.size) {
    const first = remaining.values().next().value as string;
    remaining.delete(first);
    const queue = [first];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const neighbor of adjacency.get(queue[cursor]!) ?? []) {
        if (remaining.delete(neighbor)) queue.push(neighbor);
      }
    }
    sizes.push(queue.length);
  }
  return sizes.sort((a, b) => b - a);
}

function meanPairwiseAngularSpread(
  planet: PlanetDefinition,
  ids: string[],
): number {
  const centers = planet.territories
    .filter((item) => ids.includes(item.id))
    .map((item) => item.center);
  if (centers.length < 2) return 0;
  let total = 0;
  let pairs = 0;
  for (let a = 0; a < centers.length; a += 1) {
    for (let b = a + 1; b < centers.length; b += 1) {
      const left = centers[a]!;
      const right = centers[b]!;
      const leftLength = Math.hypot(...left);
      const rightLength = Math.hypot(...right);
      const cosine =
        (left[0] * right[0] + left[1] * right[1] + left[2] * right[2]) /
        (leftLength * rightLength);
      total += Math.acos(Math.max(-1, Math.min(1, cosine))) / Math.PI;
      pairs += 1;
    }
  }
  return total / pairs;
}

function parityScore(values: number[], tolerance: number): number {
  return clampScore(100 - Math.max(0, range(values) - tolerance) * 50);
}

export function analyzeStartingPosition(
  planet: PlanetDefinition,
  players: LocalPlayerConfig[],
  territories: Record<string, StartingTerritoryState>,
): StartingBalanceAnalysis {
  const adjacency = new Map(
    planet.territories.map((item) => [item.id, item.adjacentTerritoryIds]),
  );
  const seaEndpoints = new Set(
    planet.connections
      .filter((item) => item.type === 'sea-route')
      .flatMap((item) => [item.fromTerritoryId, item.toTerritoryId]),
  );
  const gatewayIds = new Set(
    planet.analysis.gatewayTerritoryIds.length
      ? planet.analysis.gatewayTerritoryIds
      : planet.analysis.articulationTerritoryIds,
  );
  const orderedPlayers = players
    .slice()
    .sort((a, b) => a.seatIndex - b.seatIndex);
  const metrics = orderedPlayers.map((player): PlayerStartingBalance => {
    const ids = planet.territories
      .filter((item) => territories[item.id]?.ownerId === player.id)
      .map((item) => item.id);
    const idSet = new Set(ids);
    const components = componentSizes(ids, adjacency);
    const friendlyEdges = ids.reduce(
      (sum, id) =>
        sum +
        (adjacency.get(id) ?? []).filter((neighbor) => idSet.has(neighbor))
          .length,
      0,
    );
    const allEdges = ids.reduce(
      (sum, id) => sum + (adjacency.get(id)?.length ?? 0),
      0,
    );
    const shares = planet.continents.map((continent) => ({
      continent,
      owned: continent.territoryIds.filter((id) => idSet.has(id)).length,
      share:
        continent.territoryIds.filter((id) => idSet.has(id)).length /
        Math.max(1, continent.territoryIds.length),
    }));
    return {
      playerId: player.id,
      territoryCount: ids.length,
      armyCount: ids.reduce(
        (sum, id) => sum + (territories[id]?.armyCount ?? 0),
        0,
      ),
      connectedComponentCount: components.length,
      largestComponentSize: components[0] ?? 0,
      largestComponentRatio: (components[0] ?? 0) / Math.max(1, ids.length),
      sameOwnerAdjacencyRatio: friendlyEdges / Math.max(1, allEdges),
      geographicSpread: meanPairwiseAngularSpread(planet, ids),
      borderTerritoryCount: ids.filter((id) =>
        (adjacency.get(id) ?? []).some((neighbor) => !idSet.has(neighbor)),
      ).length,
      gatewayTerritoryCount: ids.filter((id) => gatewayIds.has(id)).length,
      seaRouteEndpointCount: ids.filter((id) => seaEndpoints.has(id)).length,
      fullyOwnedContinentCount: shares.filter((item) => item.share === 1)
        .length,
      maximumContinentShare: Math.max(0, ...shares.map((item) => item.share)),
      majorityContinentCount: shares.filter((item) => item.share > 0.5).length,
      nearCompleteContinentCount: shares.filter(
        (item) =>
          item.owned > 0 &&
          item.owned === item.continent.territoryIds.length - 1,
      ).length,
      potentialStartingBonus: shares.reduce(
        (sum, item) => sum + item.continent.bonus * item.share,
        0,
      ),
      averageDegree: allEdges / Math.max(1, ids.length),
      landmassCount: new Set(
        planet.territories
          .filter((item) => idSet.has(item.id))
          .map((item) => item.landmassId),
      ).size,
      isolatedTerritoryCount: components.filter((size) => size === 1).length,
    };
  });

  const territorySpread = range(metrics.map((item) => item.territoryCount));
  const armySpread = range(metrics.map((item) => item.armyCount));
  const componentScores = metrics.map((item) => {
    const target = startingComponentTarget(item.territoryCount);
    const componentDistance = Math.abs(
      item.connectedComponentCount - target.preferred,
    );
    const ratioPenalty =
      item.largestComponentRatio > 0.6
        ? (item.largestComponentRatio - 0.6) * 180
        : item.largestComponentRatio < 0.25
          ? (0.25 - item.largestComponentRatio) * 100
          : 0;
    const isolationAllowance = Math.max(1, Math.ceil(item.territoryCount / 10));
    return clampScore(
      100 -
        componentDistance * 14 -
        ratioPenalty -
        Math.max(0, item.isolatedTerritoryCount - isolationAllowance) * 12,
    );
  });
  const bonusSpread = range(metrics.map((item) => item.potentialStartingBonus));
  const breakdown: StartingBalanceBreakdown = {
    territoryParity: parityScore(
      metrics.map((item) => item.territoryCount),
      1,
    ),
    armyParity: parityScore(
      metrics.map((item) => item.armyCount),
      1,
    ),
    continentFairness: clampScore(
      100 -
        metrics.reduce(
          (sum, item) =>
            sum +
            item.fullyOwnedContinentCount * 50 +
            item.nearCompleteContinentCount * 12 +
            item.majorityContinentCount * 8,
          0,
        ) -
        bonusSpread * 8,
    ),
    connectivityDistribution: clampScore(
      componentScores.reduce((sum, item) => sum + item, 0) /
        Math.max(1, metrics.length),
    ),
    geographicSpread: clampScore(
      100 -
        range(metrics.map((item) => item.geographicSpread)) * 180 -
        metrics.reduce(
          (sum, item) => sum + (item.landmassCount === 1 ? 8 : 0),
          0,
        ),
    ),
    borderExposure: clampScore(
      100 - range(metrics.map((item) => item.borderTerritoryCount)) * 14,
    ),
    seaRouteAccess: clampScore(
      100 - range(metrics.map((item) => item.seaRouteEndpointCount)) * 18,
    ),
    gatewayAccess: clampScore(
      100 - range(metrics.map((item) => item.gatewayTerritoryCount)) * 18,
    ),
  };
  const overallScore = clampScore(
    (
      Object.keys(
        STARTING_BALANCE_WEIGHTS,
      ) as (keyof StartingBalanceBreakdown)[]
    ).reduce(
      (sum, key) => sum + breakdown[key] * STARTING_BALANCE_WEIGHTS[key],
      0,
    ),
  );
  const hardFailureReasons: string[] = [];
  const warnings: string[] = [];
  const names = new Map(
    orderedPlayers.map((player) => [player.id, player.name]),
  );
  if (
    Object.keys(territories).length !== planet.territories.length ||
    planet.territories.some((item) => !territories[item.id])
  )
    hardFailureReasons.push('Not every territory has a starting owner.');
  if (territorySpread > 1)
    hardFailureReasons.push(
      `Territory totals differ by ${territorySpread}; the allowed difference is one.`,
    );
  if (armySpread > 1)
    hardFailureReasons.push(
      `Starting-army totals differ by ${armySpread}; the allowed difference is one.`,
    );
  const invalidOwner = planet.territories.find((item) => {
    const ownerId = territories[item.id]?.ownerId;
    return ownerId && !names.has(ownerId);
  });
  if (invalidOwner)
    hardFailureReasons.push(
      `${invalidOwner.name} is assigned to an unknown player.`,
    );
  for (const metric of metrics) {
    const name = names.get(metric.playerId) ?? metric.playerId;
    if (!metric.territoryCount || !metric.armyCount)
      hardFailureReasons.push(`${name} has no practical starting position.`);
    if (metric.territoryCount >= 5 && metric.largestComponentRatio >= 0.8)
      hardFailureReasons.push(
        `${name} owns nearly all territories in one connected region.`,
      );
    if (metric.averageDegree === 0)
      hardFailureReasons.push(
        `${name} has no practical access to the strategic graph.`,
      );
    const mixableMajorities = planet.continents.filter((continent) => {
      if (continent.territoryIds.length < 2) return false;
      const owned = continent.territoryIds.filter(
        (id) => territories[id]?.ownerId === metric.playerId,
      ).length;
      return owned / continent.territoryIds.length > 0.5;
    }).length;
    if (mixableMajorities >= 3)
      hardFailureReasons.push(
        `${name} controls an excessive share of multiple continents.`,
      );
  }
  const meanSea =
    metrics.reduce((sum, item) => sum + item.seaRouteEndpointCount, 0) /
    Math.max(1, metrics.length);
  const meanGateway =
    metrics.reduce((sum, item) => sum + item.gatewayTerritoryCount, 0) /
    Math.max(1, metrics.length);
  const seaTolerance = Math.max(2, Math.ceil(meanSea * 0.75));
  const gatewayTolerance = Math.max(2, Math.ceil(meanGateway * 0.75));
  for (const metric of metrics) {
    const name = names.get(metric.playerId) ?? metric.playerId;
    if (metric.seaRouteEndpointCount > meanSea + seaTolerance)
      hardFailureReasons.push(
        `${name} has too many sea-route endpoints (${metric.seaRouteEndpointCount}; table average ${meanSea.toFixed(1)}).`,
      );
    if (metric.gatewayTerritoryCount > meanGateway + gatewayTolerance)
      hardFailureReasons.push(
        `${name} has too many gateway territories (${metric.gatewayTerritoryCount}; table average ${meanGateway.toFixed(1)}).`,
      );
  }
  for (const continent of planet.continents) {
    const continentOwners = new Set(
      continent.territoryIds
        .map((id) => territories[id]?.ownerId)
        .filter(Boolean),
    );
    if (continentOwners.size !== 1) continue;
    const ownerId = continentOwners.values().next().value as string;
    const ownerName = names.get(ownerId) ?? ownerId;
    if (continent.territoryIds.length < 2) {
      warnings.push(
        `${continent.name} contains only one territory, so mixed starting ownership there is impossible; ${ownerName} begins with it.`,
      );
    } else {
      hardFailureReasons.push(
        `${ownerName} begins with all of ${continent.name}.`,
      );
    }
  }
  if (
    planet.territories.some(
      (item) => (territories[item.id]?.armyCount ?? 0) < 1,
    )
  )
    hardFailureReasons.push(
      'Every territory must begin with at least one army.',
    );

  for (const metric of metrics) {
    const name = names.get(metric.playerId) ?? metric.playerId;
    if (metric.largestComponentRatio > 0.6)
      warnings.push(
        `${name} owns ${metric.largestComponentSize} of its ${metric.territoryCount} territories in one ownership region.`,
      );
    for (const continent of planet.continents) {
      if (continent.territoryIds.length < 2) continue;
      const owned = continent.territoryIds.filter(
        (id) => territories[id]?.ownerId === metric.playerId,
      ).length;
      if (owned === continent.territoryIds.length - 1)
        warnings.push(
          `${name} begins one territory away from controlling ${continent.name}.`,
        );
    }
    if (metric.seaRouteEndpointCount < Math.max(0, meanSea - 1.5))
      warnings.push(
        `${name} has ${metric.seaRouteEndpointCount} sea-route endpoint${metric.seaRouteEndpointCount === 1 ? '' : 's'}; the table average is ${meanSea.toFixed(1)}.`,
      );
    if (
      metric.isolatedTerritoryCount >
      Math.max(1, Math.ceil(metric.territoryCount / 10))
    )
      warnings.push(
        `${name} has ${metric.isolatedTerritoryCount} isolated territories.`,
      );
  }
  return {
    overallScore,
    rating:
      overallScore >= 90
        ? 'excellent'
        : overallScore >= 75
          ? 'good'
          : overallScore >= 55
            ? 'uneven'
            : 'poor',
    breakdown,
    warnings: [...new Set(warnings)],
    hardFailure: hardFailureReasons.length > 0,
    hardFailureReasons: [...new Set(hardFailureReasons)],
    players: metrics,
  };
}

function distributedAssignments(
  planet: PlanetDefinition,
  playerCount: number,
  seed: string,
): number[] {
  const random = createSeededRandom(`${seed}|distributed`);
  const order = random.shuffle(planet.territories.map((_, index) => index));
  const seatOffset = random.integer(0, playerCount - 1);
  const assignments = Array.from({ length: order.length }, () => -1);
  order.forEach((territoryIndex, position) => {
    assignments[territoryIndex] = (position + seatOffset) % playerCount;
  });
  return assignments;
}

function positionFromAssignments(
  planet: PlanetDefinition,
  players: LocalPlayerConfig[],
  assignments: number[],
): Record<string, StartingTerritoryState> {
  return Object.fromEntries(
    planet.territories.map((territory, index) => [
      territory.id,
      { ownerId: players[assignments[index]!]!.id, armyCount: 1 },
    ]),
  );
}

function improveAssignments(
  planet: PlanetDefinition,
  players: LocalPlayerConfig[],
  assignments: number[],
  seed: string,
): number[] {
  const random = createSeededRandom(`${seed}|local-improvement`);
  let best = assignments.slice();
  let bestAnalysis = analyzeStartingPosition(
    planet,
    players,
    positionFromAssignments(planet, players, best),
  );
  const merit = (analysis: StartingBalanceAnalysis) => {
    const isolated = analysis.players.reduce(
      (sum, item) => sum + item.isolatedTerritoryCount,
      0,
    );
    const targetDistance = analysis.players.reduce((sum, item) => {
      const target = startingComponentTarget(item.territoryCount);
      return sum + Math.abs(item.connectedComponentCount - target.preferred);
    }, 0);
    return (
      (analysis.hardFailure
        ? -100000 - analysis.hardFailureReasons.length * 1000
        : 0) +
      analysis.overallScore * 100 -
      isolated * 8 -
      targetDistance * 5
    );
  };
  for (
    let step = 0;
    step < Math.max(240, planet.territoryCount * 10);
    step += 1
  ) {
    const left = random.integer(0, best.length - 1);
    const right = random.integer(0, best.length - 1);
    if (best[left] === best[right]) continue;
    const proposal = best.slice();
    [proposal[left], proposal[right]] = [proposal[right]!, proposal[left]!];
    const analysis = analyzeStartingPosition(
      planet,
      players,
      positionFromAssignments(planet, players, proposal),
    );
    if (merit(analysis) > merit(bestAnalysis)) {
      best = proposal;
      bestAnalysis = analysis;
    }
  }
  return best;
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
  const candidateSeed = `${planet.seed}|v${planet.generatorVersion}|starting|distributed|${variant}|${candidateIndex}|${orderedPlayers.map((player) => player.id).join(',')}`;
  const assignments = improveAssignments(
    planet,
    orderedPlayers,
    distributedAssignments(planet, orderedPlayers.length, candidateSeed),
    candidateSeed,
  );
  const territories = positionFromAssignments(
    planet,
    orderedPlayers,
    assignments,
  );
  const total = startingArmyTotal(orderedPlayers.length);
  const random = createSeededRandom(`${candidateSeed}|armies`);
  for (const player of orderedPlayers) {
    const owned = planet.territories
      .filter((item) => territories[item.id]!.ownerId === player.id)
      .map((item) => item.id);
    let remaining = total - owned.length;
    let cursor = random.integer(0, Math.max(0, owned.length - 1));
    while (remaining > 0) {
      territories[owned[cursor % owned.length]!]!.armyCount += 1;
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
  const failures = new Map<string, number>();
  for (let index = 0; index < candidateCount; index += 1) {
    const candidate = createCandidate(planet, players, variant, index);
    if (candidate.analysis.hardFailure) {
      candidate.analysis.hardFailureReasons.forEach((reason) =>
        failures.set(reason, (failures.get(reason) ?? 0) + 1),
      );
      continue;
    }
    const isolated = candidate.analysis.players.reduce(
      (sum, item) => sum + item.isolatedTerritoryCount,
      0,
    );
    const bestIsolated =
      best?.analysis.players.reduce(
        (sum, item) => sum + item.isolatedTerritoryCount,
        0,
      ) ?? Number.POSITIVE_INFINITY;
    if (
      !best ||
      candidate.analysis.overallScore > best.analysis.overallScore ||
      (candidate.analysis.overallScore === best.analysis.overallScore &&
        (isolated < bestIsolated ||
          (isolated === bestIsolated &&
            candidate.candidateIndex < best.candidateIndex)))
    )
      best = candidate;
  }
  if (!best) {
    const reasons = [...failures.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([reason]) => reason);
    throw new Error(
      `No valid starting ownership candidate was found${reasons.length ? `: ${reasons.join(' ')}` : '.'}`,
    );
  }
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
