import { describe, expect, it } from 'vitest';
import {
  simulateMatch,
  type BotPolicy,
  type SimulationOptions,
} from './simulator';

const policies: BotPolicy[] = ['conservative', 'aggressive'];

function reportMatrix(
  label: string,
  results: ReturnType<typeof simulateMatch>[],
) {
  const completed = results.filter(({ outcome }) => outcome === 'victory');
  const transitions = results.reduce(
    (sum, result) => sum + result.actionCount,
    0,
  );
  console.log(
    `${label}: ${completed.length}/${results.length} complete matches; ${transitions} state transitions`,
  );
}

const smokeSetups: Omit<SimulationOptions, 'policy'>[] = Array.from(
  { length: 10 },
  (_, index) => ({
    seed: `simulation-smoke-${index}`,
    territoryCount: [12, 18, 24][index % 3]!,
    continentCount: [2, 3, 4][index % 3]!,
    playerCount: 2 + (index % 5),
    ownershipVariant: index % 2,
    maxActions: 500,
  }),
);

function stressSetups(): Omit<SimulationOptions, 'policy'>[] {
  const setups: Omit<SimulationOptions, 'policy'>[] = [];
  for (const territoryCount of [12, 18, 24]) {
    for (const continentCount of [2, 3, 4]) {
      for (let playerCount = 2; playerCount <= 6; playerCount += 1) {
        for (let variant = 0; variant < 3; variant += 1) {
          setups.push({
            seed: `simulation-stress-${territoryCount}-${continentCount}-${playerCount}-${variant}`,
            territoryCount,
            continentCount,
            playerCount,
            ownershipVariant: variant,
            maxActions: 750,
          });
        }
      }
    }
  }
  return setups;
}

describe('deterministic match simulator', () => {
  it(
    'runs a fast smoke matrix through both policies',
    { timeout: 120_000 },
    () => {
      const results = smokeSetups.flatMap((setup) =>
        policies.map((policy) => simulateMatch({ ...setup, policy })),
      );
      expect(results).toHaveLength(20);
      expect(results.every(({ actionCount }) => actionCount > 0)).toBe(true);
      expect(results.some(({ outcome }) => outcome === 'victory')).toBe(true);
      reportMatrix('simulation smoke', results);
    },
  );

  it.runIf(process.env.SIMULATION_STRESS === '1')(
    'runs 135 world/setup combinations through both policies',
    { timeout: 900_000 },
    () => {
      const setups = stressSetups();
      expect(setups).toHaveLength(135);
      const results = setups.flatMap((setup) =>
        policies.map((policy) => simulateMatch({ ...setup, policy })),
      );
      reportMatrix('simulation stress', results);
    },
  );

  it.runIf(Boolean(process.env.SIMULATION_SEED))(
    'replays the configured failing seed',
    { timeout: 120_000 },
    () => {
      const integer = (name: string, fallback: number) =>
        Number.parseInt(process.env[name] ?? String(fallback), 10);
      const result = simulateMatch({
        seed: process.env.SIMULATION_SEED!,
        territoryCount: integer('SIMULATION_TERRITORIES', 18),
        continentCount: integer('SIMULATION_CONTINENTS', 3),
        playerCount: integer('SIMULATION_PLAYERS', 4),
        ownershipVariant: integer('SIMULATION_VARIANT', 0),
        policy:
          process.env.SIMULATION_POLICY === 'conservative'
            ? 'conservative'
            : 'aggressive',
        maxActions: integer('SIMULATION_MAX_ACTIONS', 2_000),
      });
      expect(result.actionCount).toBeGreaterThan(0);
    },
  );
});
