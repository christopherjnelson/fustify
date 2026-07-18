import { describe, expect, it } from 'vitest';
import { generatePlanet } from './generatePlanet';
import {
  generateReadableWorldSeed,
  WORLD_NAME_DESCRIPTORS,
  WORLD_NAME_LANDMARKS,
} from './readableWorldSeed';

function entropy(values: number[]) {
  let index = 0;
  return () => values[index++ % values.length]!;
}

describe('readable world seeds', () => {
  it('uses only curated words and URL-safe slug characters', () => {
    const seed = generateReadableWorldSeed(entropy([3, 7, 42]));
    const [descriptor, landmark, suffix] = seed.split('-');
    expect(WORLD_NAME_DESCRIPTORS).toContain(descriptor);
    expect(WORLD_NAME_LANDMARKS).toContain(landmark);
    expect(suffix).toBe('142');
    expect(seed).toMatch(/^[a-z]+-[a-z]+-[1-9][0-9]{2}$/);
    expect(descriptor).not.toBe(landmark);
  });

  it('provides broad deterministic variation with injectable entropy', () => {
    const seeds = new Set(
      Array.from({ length: 200 }, (_, index) =>
        generateReadableWorldSeed(
          entropy([index, index * 17 + 3, index * 29 + 11]),
        ),
      ),
    );
    expect(seeds.size).toBeGreaterThan(190);
  });

  it('feeds the existing deterministic generator as its canonical seed', () => {
    const seed = generateReadableWorldSeed(entropy([1, 2, 3]));
    expect(generatePlanet(seed)).toEqual(generatePlanet(seed));
    expect(generatePlanet('custom typed seed').seed).toBe('custom typed seed');
  });
});
