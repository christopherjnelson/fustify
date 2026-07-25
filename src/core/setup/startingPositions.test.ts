import { describe, expect, it } from 'vitest';
import { CURRENT_GENERATOR_VERSION } from '../generation/constants';
import { generatePlanet } from '../generation/generatePlanet';
import { createMatch } from '../game/createMatch';
import { createDefaultPlayerConfigs } from './playerConfig';
import {
  analyzeStartingPosition,
  createMatchSetup,
  generateStartingPosition,
  STARTING_BALANCE_WEIGHTS,
  startingComponentTarget,
  startingArmyTotal,
} from './startingPositions';

// Hold geography stable so this suite measures assignment, not generator drift.
const planet = generatePlanet('starting-position-tests', {
  generatorVersion: CURRENT_GENERATOR_VERSION,
  territoryCount: 42,
  continentCount: 6,
  playerCount: 4,
  landCoverage: 0.52,
});
const players = createDefaultPlayerConfigs(4);

function linePlanet(territoryCount = 10) {
  const generated = generatePlanet(`line-starting-position-${territoryCount}`, {
    generatorVersion: CURRENT_GENERATOR_VERSION,
    territoryCount,
    continentCount: 2,
    playerCount: 2,
    landCoverage: 0.52,
  });
  const ids = generated.territories.map((territory) => territory.id);
  return {
    ...generated,
    territories: generated.territories.map((territory, index) => ({
      ...territory,
      adjacentTerritoryIds: [ids[index - 1], ids[index + 1]].filter(
        (id): id is string => Boolean(id),
      ),
    })),
    continents: generated.continents.map((continent, index) => ({
      ...continent,
      territoryIds: ids.slice(
        index * Math.ceil(territoryCount / 2),
        (index + 1) * Math.ceil(territoryCount / 2),
      ),
    })),
    connections: [],
    analysis: {
      ...generated.analysis,
      articulationTerritoryIds: [],
      gatewayTerritoryIds: [],
    },
  };
}

function ownershipFor(
  fixture: ReturnType<typeof linePlanet>,
  firstPlayerIndexes: number[],
) {
  const first = new Set(firstPlayerIndexes);
  const fixturePlayers = createDefaultPlayerConfigs(2);
  return Object.fromEntries(
    fixture.territories.map((territory, index) => [
      territory.id,
      {
        ownerId: fixturePlayers[first.has(index) ? 0 : 1]!.id,
        armyCount: 1,
      },
    ]),
  );
}

describe('deterministic starting positions', () => {
  it('reproduces the same selected candidate', () => {
    expect(generateStartingPosition(planet, players, 3)).toEqual(
      generateStartingPosition(planet, players, 3),
    );
  });

  it('rerolls ownership without changing geography', () => {
    const beforeCenters = planet.territories.map(
      (territory) => territory.center,
    );
    const first = generateStartingPosition(planet, players, 0);
    const rerolled = generateStartingPosition(planet, players, 1);
    expect(rerolled.territories).not.toEqual(first.territories);
    expect(planet.territories.map((territory) => territory.center)).toEqual(
      beforeCenters,
    );
  });

  it('assigns every territory once with at least one army', () => {
    const position = generateStartingPosition(planet, players, 0);
    expect(Object.keys(position.territories)).toHaveLength(
      planet.territoryCount,
    );
    expect(
      Object.values(position.territories).every((item) => item.armyCount >= 1),
    ).toBe(true);
  });

  it('balances territory and army totals', () => {
    const position = generateStartingPosition(planet, players, 0);
    const territoryCounts = position.analysis.players.map(
      (item) => item.territoryCount,
    );
    const armyCounts = position.analysis.players.map((item) => item.armyCount);
    expect(
      Math.max(...territoryCounts) - Math.min(...territoryCounts),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.max(...armyCounts) - Math.min(...armyCounts),
    ).toBeLessThanOrEqual(1);
    expect(armyCounts).toEqual(
      players.map(() => startingArmyTotal(players.length)),
    );
  });

  it('reports bounded, serializable balance analysis', () => {
    const analysis = generateStartingPosition(planet, players, 2).analysis;
    expect(analysis.overallScore).toBeGreaterThanOrEqual(0);
    expect(analysis.overallScore).toBeLessThanOrEqual(100);
    expect(JSON.parse(JSON.stringify(analysis))).toEqual(analysis);
    expect(JSON.stringify(analysis)).not.toContain('Object3D');
    expect(Object.keys(analysis.breakdown)).toEqual([
      'territoryParity',
      'armyParity',
      'continentFairness',
      'connectivityDistribution',
      'geographicSpread',
      'borderExposure',
      'seaRouteAccess',
      'gatewayAccess',
    ]);
    expect(
      Object.values(analysis.breakdown).every(
        (score) => score >= 0 && score <= 100,
      ),
    ).toBe(true);
  });

  it('prefers distributed ownership without prebuilt continents', () => {
    const position = generateStartingPosition(planet, players, 0);
    const analysis = position.analysis;
    expect(analysis.hardFailure).toBe(false);
    for (const metric of analysis.players) {
      expect(metric.connectedComponentCount).toBeGreaterThanOrEqual(2);
      expect(metric.connectedComponentCount).toBeLessThanOrEqual(5);
      expect(metric.largestComponentRatio).toBeLessThanOrEqual(0.6);
      expect(metric.isolatedTerritoryCount).toBeLessThanOrEqual(2);
      expect(metric.fullyOwnedContinentCount).toBe(0);
    }
    for (const continent of planet.continents) {
      const owners = new Set(
        continent.territoryIds.map((id) => position.territories[id]!.ownerId),
      );
      expect(owners.size).toBeGreaterThanOrEqual(2);
    }
  });

  it('uses scaled component targets for tiny and ordinary positions', () => {
    expect(startingComponentTarget(2)).toEqual({
      minimum: 1,
      preferred: 1,
      maximum: 2,
    });
    expect(startingComponentTarget(10)).toEqual({
      minimum: 2,
      preferred: 3,
      maximum: 5,
    });
    expect(startingComponentTarget(42)).toEqual({
      minimum: 2,
      preferred: 5,
      maximum: 5,
    });
  });

  it('computes component size, isolation, and continent-share metrics', () => {
    const fixture = linePlanet(6);
    const fixturePlayers = createDefaultPlayerConfigs(2);
    const analysis = analyzeStartingPosition(
      fixture,
      fixturePlayers,
      ownershipFor(fixture, [0, 1, 3]),
    );
    const first = analysis.players[0]!;
    expect(first.connectedComponentCount).toBe(2);
    expect(first.largestComponentSize).toBe(2);
    expect(first.largestComponentRatio).toBeCloseTo(2 / 3);
    expect(first.isolatedTerritoryCount).toBe(1);
    expect(first.maximumContinentShare).toBeCloseTo(2 / 3);
    expect(first.nearCompleteContinentCount).toBe(1);
    expect(analysis.warnings).toContain(
      `${fixturePlayers[0]!.name} begins one territory away from controlling ${fixture.continents[0]!.name}.`,
    );
  });

  it('hard-rejects giant empires and penalizes checkerboards', () => {
    const fixture = linePlanet(10);
    const fixturePlayers = createDefaultPlayerConfigs(2);
    const giant = analyzeStartingPosition(
      fixture,
      fixturePlayers,
      ownershipFor(fixture, [0, 1, 2, 3, 4]),
    );
    const checkerboard = analyzeStartingPosition(
      fixture,
      fixturePlayers,
      ownershipFor(fixture, [0, 2, 4, 6, 8]),
    );
    const distributed = analyzeStartingPosition(
      fixture,
      fixturePlayers,
      ownershipFor(fixture, [0, 1, 5, 6, 9]),
    );
    expect(giant.hardFailureReasons).toContain(
      `${fixturePlayers[0]!.name} owns nearly all territories in one connected region.`,
    );
    expect(checkerboard.breakdown.connectivityDistribution).toBeLessThan(
      distributed.breakdown.connectivityDistribution,
    );
  });

  it('names the player and continent for full-continent failures', () => {
    const position = generateStartingPosition(planet, players, 0);
    const continent = planet.continents[0]!;
    const owner = players[0]!;
    const territories = structuredClone(position.territories);
    continent.territoryIds.forEach((id) => {
      territories[id]!.ownerId = owner.id;
    });
    const analysis = analyzeStartingPosition(planet, players, territories);
    expect(analysis.hardFailureReasons).toContain(
      `${owner.name} begins with all of ${continent.name}.`,
    );
  });

  it('warns instead of failing when a singleton continent cannot be mixed', () => {
    const position = generateStartingPosition(planet, players, 0);
    const territoryId = planet.continents[0]!.territoryIds[0]!;
    const ownerId = position.territories[territoryId]!.ownerId;
    const owner = players.find((player) => player.id === ownerId)!;
    const singletonPlanet = {
      ...planet,
      continents: planet.continents.map((continent, index) =>
        index === 0 ? { ...continent, territoryIds: [territoryId] } : continent,
      ),
    };
    const analysis = analyzeStartingPosition(
      singletonPlanet,
      players,
      position.territories,
    );
    expect(analysis.hardFailure).toBe(false);
    expect(analysis.warnings).toContain(
      `${singletonPlanet.continents[0]!.name} contains only one territory, so mixed starting ownership there is impossible; ${owner.name} begins with it.`,
    );
  });

  it('derives the overall score from the documented weights', () => {
    const analysis = generateStartingPosition(planet, players, 0).analysis;
    const weighted = Object.entries(STARTING_BALANCE_WEIGHTS).reduce(
      (sum, [category, weight]) =>
        sum +
        analysis.breakdown[category as keyof typeof analysis.breakdown] *
          weight,
      0,
    );
    expect(analysis.overallScore).toBe(Math.round(weighted));
  });

  it('selects candidates deterministically and rejects impossible counts', () => {
    const selected = generateStartingPosition(planet, players, 4);
    expect(selected.candidateIndex).toBeGreaterThanOrEqual(0);
    expect(selected.candidateIndex).toBeLessThan(32);
    expect(() => generateStartingPosition(planet, players, 4, 0)).toThrow();
  });

  it('creates a match from the preview without recomputing ownership', () => {
    const setup = createMatchSetup(planet, players, 5);
    const match = createMatch(planet, setup);
    expect(match.territories).toEqual(setup.startingPosition.territories);
    expect(match.activePlayerId).toBe(players[0]!.id);
  });
});
