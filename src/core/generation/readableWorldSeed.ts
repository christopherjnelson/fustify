export const WORLD_NAME_DESCRIPTORS = Object.freeze([
  'amber',
  'azure',
  'bright',
  'calm',
  'cedar',
  'coral',
  'crystal',
  'dawn',
  'distant',
  'emerald',
  'frozen',
  'gentle',
  'golden',
  'hidden',
  'indigo',
  'ivory',
  'lunar',
  'misty',
  'mossy',
  'quiet',
  'radiant',
  'russet',
  'silver',
  'silent',
  'solar',
  'still',
  'verdant',
  'violet',
  'warm',
  'wild',
  'windward',
  'winter',
] as const);

export const WORLD_NAME_LANDMARKS = Object.freeze([
  'archipelago',
  'bastion',
  'bay',
  'citadel',
  'coast',
  'crossing',
  'delta',
  'divide',
  'fjord',
  'frontier',
  'garden',
  'harbor',
  'haven',
  'highland',
  'horizon',
  'isles',
  'lagoon',
  'march',
  'meadow',
  'meridian',
  'mesa',
  'passage',
  'plateau',
  'reach',
  'reef',
  'ridge',
  'shore',
  'summit',
  'tundra',
  'vale',
  'vista',
  'woodland',
] as const);

export type WorldSeedEntropy = () => number;

function secureEntropy(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0]!;
}

/** Creates a readable canonical seed without coupling naming to geography. */
export function generateReadableWorldSeed(
  entropy: WorldSeedEntropy = secureEntropy,
): string {
  const descriptor =
    WORLD_NAME_DESCRIPTORS[entropy() % WORLD_NAME_DESCRIPTORS.length]!;
  const landmark =
    WORLD_NAME_LANDMARKS[entropy() % WORLD_NAME_LANDMARKS.length]!;
  const suffix = 100 + (entropy() % 900);
  return `${descriptor}-${landmark}-${suffix}`;
}
