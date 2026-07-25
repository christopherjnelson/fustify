import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CURRENT_GENERATOR_PROFILE,
  CURRENT_GENERATOR_VERSION,
  NORMALIZED_GENERATOR_PROFILE,
  NORMALIZED_GENERATOR_VERSION,
} from '../src/core/generation/constants';
import {
  analyzePlanetGeometry,
  type GeometryQualityAnalysis,
} from '../src/core/generation/geometryQuality';
import { generatePlanet } from '../src/core/generation/generatePlanet';
import type {
  GenerationTimingObserver,
  GenerationTimingPhase,
} from '../src/core/types/generation';

interface ProfileSample {
  seed: string;
  continentCount: number;
  quality: GeometryQualityAnalysis;
  timings: Record<GenerationTimingPhase, number>;
  selectedCandidateIndex: number | null;
  selectedScore: number | null;
}

interface Failure {
  seed: string;
  continentCount: number;
  profile: string;
  error: string;
}

interface WorstValue {
  seed: string;
  continentCount: number;
  value: number;
}

const requestedSeedCount = Number(process.env.NORMALIZED_SWEEP_SEEDS ?? '250');
const seedCount =
  Number.isSafeInteger(requestedSeedCount) && requestedSeedCount > 0
    ? requestedSeedCount
    : 250;
const continentCounts = [2, 3, 4, 5] as const;
const outputDirectory = path.resolve(
  '.fustify/reports/world-generation/normalized-v2',
);

function emptyTimings(): Record<GenerationTimingPhase, number> {
  return {
    'site-generation': 0,
    relaxation: 0,
    'polygon-construction': 0,
    'candidate-scoring': 0,
    total: 0,
  };
}

function percentile(values: readonly number[], amount: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * amount))
  ]!;
}

function rounded(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function summary(values: readonly number[]) {
  return {
    mean: rounded(
      values.reduce((sum, value) => sum + value, 0) /
        Math.max(1, values.length),
    ),
    p50: rounded(percentile(values, 0.5)),
    p90: rounded(percentile(values, 0.9)),
    p95: rounded(percentile(values, 0.95)),
    p99: rounded(percentile(values, 0.99)),
    maximum: rounded(Math.max(0, ...values)),
  };
}

function profileSample(
  seed: string,
  continentCount: number,
  generatorVersion:
    typeof CURRENT_GENERATOR_VERSION | typeof NORMALIZED_GENERATOR_VERSION,
): ProfileSample {
  const timings = emptyTimings();
  const timingObserver: GenerationTimingObserver = (phase, milliseconds) => {
    timings[phase] += milliseconds;
  };
  const planet = generatePlanet(seed, {
    territoryCount: 42,
    continentCount,
    playerCount: 4,
    generatorVersion,
    timingObserver,
  });
  return {
    seed,
    continentCount,
    quality: analyzePlanetGeometry(planet),
    timings,
    selectedCandidateIndex:
      planet.generationDiagnostics?.selectedCandidateIndex ?? null,
    selectedScore:
      planet.generationDiagnostics?.candidates.find(
        (candidate) =>
          candidate.candidateIndex ===
          planet.generationDiagnostics?.selectedCandidateIndex,
      )?.score.total ?? null,
  };
}

function aggregateSideCounts(samples: readonly ProfileSample[]) {
  const counts = new Map<number, number>();
  for (const sample of samples) {
    for (const metric of sample.quality.territories) {
      counts.set(
        metric.meaningfulSideCount,
        (counts.get(metric.meaningfulSideCount) ?? 0) + 1,
      );
    }
  }
  return Object.fromEntries(
    [...counts].sort((left, right) => left[0] - right[0]),
  );
}

function worst(
  samples: readonly ProfileSample[],
  read: (sample: ProfileSample) => number,
  direction: 'minimum' | 'maximum',
): WorstValue | null {
  let result: WorstValue | null = null;
  for (const sample of samples) {
    const value = read(sample);
    if (
      result === null ||
      (direction === 'minimum' ? value < result.value : value > result.value)
    ) {
      result = {
        seed: sample.seed,
        continentCount: sample.continentCount,
        value: rounded(value, 6),
      };
    }
  }
  return result;
}

function timingSummary(samples: readonly ProfileSample[]) {
  return Object.fromEntries(
    (
      [
        'site-generation',
        'relaxation',
        'polygon-construction',
        'candidate-scoring',
        'total',
      ] as const
    ).map((phase) => [
      phase,
      summary(samples.map((sample) => sample.timings[phase])),
    ]),
  );
}

const currentSamples: ProfileSample[] = [];
const normalizedSamples: ProfileSample[] = [];
const failures: Failure[] = [];
let peakCurrentHeapBytes = process.memoryUsage().heapUsed;
let peakNormalizedHeapBytes = peakCurrentHeapBytes;

for (let seedIndex = 0; seedIndex < seedCount; seedIndex += 1) {
  const seed = `normalized-sweep-${String(seedIndex).padStart(4, '0')}`;
  for (const continentCount of continentCounts) {
    try {
      currentSamples.push(
        profileSample(seed, continentCount, CURRENT_GENERATOR_VERSION),
      );
      peakCurrentHeapBytes = Math.max(
        peakCurrentHeapBytes,
        process.memoryUsage().heapUsed,
      );
    } catch (error) {
      failures.push({
        seed,
        continentCount,
        profile: CURRENT_GENERATOR_PROFILE,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      normalizedSamples.push(
        profileSample(seed, continentCount, NORMALIZED_GENERATOR_VERSION),
      );
      peakNormalizedHeapBytes = Math.max(
        peakNormalizedHeapBytes,
        process.memoryUsage().heapUsed,
      );
    } catch (error) {
      failures.push({
        seed,
        continentCount,
        profile: NORMALIZED_GENERATOR_PROFILE,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

const sampleKey = (sample: ProfileSample) =>
  `${sample.seed}|${sample.continentCount}`;
const currentByKey = new Map(
  currentSamples.map((sample) => [sampleKey(sample), sample]),
);
const pairs = normalizedSamples
  .map((normalized) => ({
    normalized,
    current: currentByKey.get(sampleKey(normalized)),
  }))
  .filter(
    (
      pair,
    ): pair is {
      normalized: ProfileSample;
      current: ProfileSample;
    } => pair.current !== undefined,
  );
const percentageChange = (
  before: number,
  after: number,
  direction: 'reduction' | 'increase',
) =>
  direction === 'reduction'
    ? (before - after) / Math.max(1e-12, before)
    : (after - before) / Math.max(1e-12, before);
const improvements = {
  territoryAreaCoefficientOfVariation: summary(
    pairs.map(({ current, normalized }) =>
      percentageChange(
        current.quality.world.territoryAreaCoefficientOfVariation,
        normalized.quality.world.territoryAreaCoefficientOfVariation,
        'reduction',
      ),
    ),
  ),
  meanTerritoryCompactness: summary(
    pairs.map(({ current, normalized }) => {
      const mean = (sample: ProfileSample) =>
        sample.quality.territories.reduce(
          (sum, territory) => sum + territory.compactness,
          0,
        ) / sample.quality.territories.length;
      return percentageChange(mean(current), mean(normalized), 'increase');
    }),
  ),
  tinyEdgeTotal: summary(
    pairs.map(({ current, normalized }) =>
      percentageChange(
        current.quality.world.tinyEdgeTotal,
        normalized.quality.world.tinyEdgeTotal,
        'reduction',
      ),
    ),
  ),
  worstAspectRatio: summary(
    pairs.map(({ current, normalized }) =>
      percentageChange(
        Math.max(
          ...current.quality.territories.map(
            (territory) => territory.diameterAspectRatio,
          ),
        ),
        Math.max(
          ...normalized.quality.territories.map(
            (territory) => territory.diameterAspectRatio,
          ),
        ),
        'reduction',
      ),
    ),
  ),
  continentCompactness: summary(
    pairs.map(({ current, normalized }) => {
      const mean = (sample: ProfileSample) =>
        sample.quality.continents.reduce(
          (sum, continent) => sum + continent.compactness,
          0,
        ) / sample.quality.continents.length;
      return percentageChange(mean(current), mean(normalized), 'increase');
    }),
  ),
};

function profileQualitySummary(samples: readonly ProfileSample[]) {
  return {
    sampleCount: samples.length,
    territoryAreaCoefficientOfVariation: summary(
      samples.map(
        (sample) => sample.quality.world.territoryAreaCoefficientOfVariation,
      ),
    ),
    meanTerritoryCompactness: summary(
      samples.map(
        (sample) =>
          sample.quality.territories.reduce(
            (sum, territory) => sum + territory.compactness,
            0,
          ) / sample.quality.territories.length,
      ),
    ),
    sideCountDistribution: aggregateSideCounts(samples),
    tinyEdgeTotal: samples.reduce(
      (sum, sample) => sum + sample.quality.world.tinyEdgeTotal,
      0,
    ),
    acuteCornerTotal: samples.reduce(
      (sum, sample) => sum + sample.quality.world.acuteCornerTotal,
      0,
    ),
    continentTendrilCount: samples.reduce(
      (sum, sample) =>
        sum +
        sample.quality.continents.reduce(
          (count, continent) => count + continent.oneTerritoryAppendageCount,
          0,
        ),
      0,
    ),
    continentConnectivityFailures: samples.reduce(
      (sum, sample) =>
        sum +
        sample.quality.continents.filter(
          (continent) => continent.connectedComponentCount !== 1,
        ).length,
      0,
    ),
    enclaveOrHoleCount: samples.reduce(
      (sum, sample) =>
        sum +
        sample.quality.continents.reduce(
          (count, continent) => count + continent.enclaveOrHoleCount,
          0,
        ),
      0,
    ),
    anchorOutsideCount: samples.reduce(
      (sum, sample) =>
        sum +
        sample.quality.territories.filter(
          (territory) => !territory.anchorInside,
        ).length,
      0,
    ),
    timingMilliseconds: timingSummary(samples),
  };
}

const benchmarkConfigurations = [
  { territoryCount: 42, continentCount: 5 },
  { territoryCount: 42, continentCount: 3 },
  { territoryCount: 60, continentCount: 5 },
] as const;
const representativeRuntime = [];
for (const configuration of benchmarkConfigurations) {
  for (const generatorVersion of [
    CURRENT_GENERATOR_VERSION,
    NORMALIZED_GENERATOR_VERSION,
  ] as const) {
    const total: number[] = [];
    const phases: Record<GenerationTimingPhase, number[]> = {
      'site-generation': [],
      relaxation: [],
      'polygon-construction': [],
      'candidate-scoring': [],
      total: [],
    };
    for (let run = 0; run < 5; run += 1) {
      const timings = emptyTimings();
      generatePlanet(`normalized-runtime-${run}`, {
        ...configuration,
        playerCount: 4,
        generatorVersion,
        timingObserver: (phase, milliseconds) => {
          timings[phase] += milliseconds;
        },
      });
      total.push(timings.total);
      for (const phase of Object.keys(phases) as GenerationTimingPhase[]) {
        phases[phase].push(timings[phase]);
      }
    }
    representativeRuntime.push({
      ...configuration,
      profile:
        generatorVersion === CURRENT_GENERATOR_VERSION
          ? CURRENT_GENERATOR_PROFILE
          : NORMALIZED_GENERATOR_PROFILE,
      totalMilliseconds: summary(total),
      phaseMilliseconds: Object.fromEntries(
        (Object.keys(phases) as GenerationTimingPhase[]).map((phase) => [
          phase,
          summary(phases[phase]),
        ]),
      ),
    });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  seedCount,
  continentCounts,
  attemptedWorldsPerProfile: seedCount * continentCounts.length,
  pairedWorldCount: pairs.length,
  failureCount: failures.length,
  failureCountByProfile: Object.fromEntries(
    [CURRENT_GENERATOR_PROFILE, NORMALIZED_GENERATOR_PROFILE].map((profile) => [
      profile,
      failures.filter((failure) => failure.profile === profile).length,
    ]),
  ),
  failures,
  current: profileQualitySummary(currentSamples),
  normalized: profileQualitySummary(normalizedSamples),
  normalizedCandidateSelection: {
    indexDistribution: Object.fromEntries(
      [0, 1, 2, 3].map((candidateIndex) => [
        String(candidateIndex),
        normalizedSamples.filter(
          (sample) => sample.selectedCandidateIndex === candidateIndex,
        ).length,
      ]),
    ),
    selectedScore: summary(
      normalizedSamples
        .map((sample) => sample.selectedScore)
        .filter((score): score is number => score !== null),
    ),
  },
  improvementFractions: improvements,
  normalizedWorstRemaining: {
    lowestAreaToMedianRatio: worst(
      normalizedSamples,
      (sample) =>
        Math.min(
          ...sample.quality.territories.map(
            (territory) => territory.areaToMedianRatio,
          ),
        ),
      'minimum',
    ),
    highestAreaToMedianRatio: worst(
      normalizedSamples,
      (sample) =>
        Math.max(
          ...sample.quality.territories.map(
            (territory) => territory.areaToMedianRatio,
          ),
        ),
      'maximum',
    ),
    lowestCompactness: worst(
      normalizedSamples,
      (sample) =>
        Math.min(
          ...sample.quality.territories.map(
            (territory) => territory.compactness,
          ),
        ),
      'minimum',
    ),
    shortestEdge: worst(
      normalizedSamples,
      (sample) =>
        Math.min(
          ...sample.quality.territories.map(
            (territory) => territory.shortestEdge,
          ),
        ),
      'minimum',
    ),
    highestAspectRatio: worst(
      normalizedSamples,
      (sample) =>
        Math.max(
          ...sample.quality.territories.map(
            (territory) => territory.diameterAspectRatio,
          ),
        ),
      'maximum',
    ),
  },
  representativeRuntime,
  memory: {
    note: 'Peak process heap observed without forced garbage collection; diagnostic only.',
    peakCurrentHeapBytes,
    peakNormalizedHeapBytes,
    peakDifferenceBytes: peakNormalizedHeapBytes - peakCurrentHeapBytes,
  },
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, 'seed-sweep.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
const markdown = `# Normalized generator v2 seed sweep

- Seeds: ${seedCount}
- Continent configurations: ${continentCounts.join(', ')}
- Attempted worlds per profile: ${report.attemptedWorldsPerProfile}
- Paired comparisons: ${report.pairedWorldCount}
- Failures: ${report.failureCount}

## Improvement fractions

\`\`\`json
${JSON.stringify(improvements, null, 2)}
\`\`\`

## Worst remaining normalized outliers

\`\`\`json
${JSON.stringify(report.normalizedWorstRemaining, null, 2)}
\`\`\`

## Runtime

\`\`\`json
${JSON.stringify(representativeRuntime, null, 2)}
\`\`\`
`;
await writeFile(path.join(outputDirectory, 'seed-sweep.md'), markdown);
console.log(
  JSON.stringify(
    {
      outputDirectory,
      seedCount,
      pairedWorldCount: pairs.length,
      failureCount: failures.length,
      failureCountByProfile: report.failureCountByProfile,
      improvements,
      normalizedWorstRemaining: report.normalizedWorstRemaining,
    },
    null,
    2,
  ),
);
if (process.env.NORMALIZED_SWEEP_STRICT === '1' && failures.length > 0) {
  process.exitCode = 1;
}
