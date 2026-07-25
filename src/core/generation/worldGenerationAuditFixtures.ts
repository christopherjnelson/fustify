export interface WorldGenerationAuditFixture {
  readonly seed: string;
  readonly territoryCount: number;
  readonly continentCount: number;
  readonly group: 'known-bad' | 'primary-42-6' | 'comparison-42-5' | 'nearby';
  readonly responsive?: boolean;
  readonly note?: string;
}

export const CANONICAL_WORLD_CAMERA_ORIENTATIONS = [0, 90, 180, 270] as const;

export const WORLD_GENERATION_AUDIT_FIXTURES: readonly WorldGenerationAuditFixture[] =
  [
    {
      seed: 'calm-reef-648',
      territoryCount: 42,
      continentCount: 6,
      group: 'known-bad',
      responsive: true,
      note: 'Reported disconnected-looking regions and dominant fragmented geography.',
    },
    {
      seed: 'golden-citadel-587',
      territoryCount: 42,
      continentCount: 6,
      group: 'known-bad',
      responsive: true,
      note: 'Reported thin strips, wedges, and strategically unclear boundaries.',
    },
    ...[
      'amber-delta-104',
      'ancient-harbor-219',
      'brisk-meadow-337',
      'cobalt-garden-452',
      'coral-summit-568',
      'crystal-passage-673',
      'distant-prairie-781',
      'ember-isle-896',
      'frozen-orchard-903',
      'gentle-canyon-117',
      'hidden-plateau-228',
      'indigo-basin-346',
      'jade-horizon-459',
      'lunar-estuary-574',
      'misty-frontier-682',
      'noble-atoll-795',
      'opal-valley-814',
      'quiet-archipelago-932',
      'radiant-tundra-146',
      'silver-peninsula-257',
    ].map((seed, index) => ({
      seed,
      territoryCount: 42,
      continentCount: 6,
      group: 'primary-42-6' as const,
      responsive: index === 0 || index === 1,
      note:
        index === 0
          ? 'Representative natural size-diversity fixture.'
          : index === 1
            ? 'Representative deterministic 42/6 fixture.'
            : undefined,
    })),
    ...[
      'five-atlas-113',
      'five-bastion-227',
      'five-cascade-349',
      'five-drift-461',
      'five-ember-583',
      'five-fjord-697',
      'five-grove-719',
      'five-haven-841',
    ].map((seed) => ({
      seed,
      territoryCount: 42,
      continentCount: 5,
      group: 'comparison-42-5' as const,
    })),
    {
      seed: 'nearby-36-6-151',
      territoryCount: 36,
      continentCount: 6,
      group: 'nearby',
    },
    {
      seed: 'nearby-48-6-263',
      territoryCount: 48,
      continentCount: 6,
      group: 'nearby',
    },
    {
      seed: 'nearby-30-5-379',
      territoryCount: 30,
      continentCount: 5,
      group: 'nearby',
    },
    {
      seed: 'nearby-24-4-487',
      territoryCount: 24,
      continentCount: 4,
      group: 'nearby',
    },
  ] as const;

export interface NormalizedWorldReviewFixture {
  readonly seed: string;
  readonly territoryCount: number;
  readonly continentCount: number;
  readonly note: string;
  readonly priority: 'all-desktop' | 'laptop' | 'basic';
}

export const NORMALIZED_WORLD_REVIEW_FIXTURES: readonly NormalizedWorldReviewFixture[] =
  [
    {
      seed: 'atlas-prime',
      territoryCount: 42,
      continentCount: 5,
      note: 'Canonical product-size comparison.',
      priority: 'all-desktop',
    },
    {
      seed: 'normalized-four-regions-348',
      territoryCount: 42,
      continentCount: 4,
      note: 'Product-size four-continent comparison.',
      priority: 'all-desktop',
    },
    {
      seed: 'normalized-three-regions-619',
      territoryCount: 42,
      continentCount: 3,
      note: 'Product-size broad-region comparison.',
      priority: 'all-desktop',
    },
    {
      seed: 'nearby-30-5-379',
      territoryCount: 30,
      continentCount: 5,
      note: 'Small supported creation range.',
      priority: 'laptop',
    },
    {
      seed: 'normalized-sixty',
      territoryCount: 60,
      continentCount: 5,
      note: 'Reporting-only high territory count.',
      priority: 'laptop',
    },
    {
      seed: 'polar-normalized-217',
      territoryCount: 42,
      continentCount: 5,
      note: 'Polar-heavy anchor and projection stress.',
      priority: 'all-desktop',
    },
    {
      seed: 'calm-reef-648',
      territoryCount: 42,
      continentCount: 5,
      note: 'Historically problematic fragmented-looking geography.',
      priority: 'laptop',
    },
    {
      seed: 'golden-citadel-587',
      territoryCount: 42,
      continentCount: 5,
      note: 'Historically irregular strips and wedge boundaries.',
      priority: 'laptop',
    },
  ] as const;
