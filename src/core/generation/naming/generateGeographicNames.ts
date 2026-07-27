import {
  PHONETIC_NAME_FAMILIES,
  type PhoneticNameFamily,
} from './phoneticNameAssets.ts';
import { SOURCE_PLACE_NAME_KEYS } from './sourceNameKeys.ts';
import { createSeededRandom, type SeededRandom } from '../seededRandom.ts';

export const GEOGRAPHIC_NAMING_VERSION = 1;

const MIN_NAME_LENGTH = 4;
const MAX_NAME_LENGTH = 12;
const MAX_CANDIDATE_ATTEMPTS = 2_048;
const DIALECT_SYLLABLES = [
  'ba',
  'be',
  'bi',
  'bo',
  'da',
  'de',
  'di',
  'do',
  'fa',
  'fe',
  'fi',
  'fo',
  'ga',
  'ge',
  'gi',
  'go',
  'ka',
  'ke',
  'ki',
  'ko',
  'la',
  'le',
  'li',
  'lo',
  'ma',
  'me',
  'mi',
  'mo',
  'na',
  'ne',
  'ni',
  'no',
  'ra',
  'ri',
] as const;
const DIALECT_COUNT = DIALECT_SYLLABLES.length ** 2;

const BLOCKED_FRAGMENTS = [
  'anal',
  'anus',
  'arse',
  'bastard',
  'bitch',
  'cunt',
  'dick',
  'fuck',
  'nazi',
  'penis',
  'piss',
  'shit',
  'slut',
  'twat',
] as const;

function comparisonKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z]/g, '');
}

const SOURCE_KEYS_BY_LENGTH = new Map<number, string[]>();
const SOURCE_KEY_SET = new Set<string>(SOURCE_PLACE_NAME_KEYS);
for (const source of SOURCE_PLACE_NAME_KEYS) {
  const bucket = SOURCE_KEYS_BY_LENGTH.get(source.length) ?? [];
  bucket.push(source);
  SOURCE_KEYS_BY_LENGTH.set(source.length, bucket);
}

function isWithinEditDistance(
  left: string,
  right: string,
  maximumDistance: number,
): boolean {
  if (Math.abs(left.length - right.length) > maximumDistance) return false;
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    if (Math.min(...current) > maximumDistance) return false;
    previous.splice(0, previous.length, ...current);
  }
  return (
    (previous[right.length] ?? Number.POSITIVE_INFINITY) <= maximumDistance
  );
}

export function isAcceptableGeographicName(
  value: string,
  existingNames: ReadonlySet<string> = new Set(),
): boolean {
  const key = comparisonKey(value);
  if (
    key.length < MIN_NAME_LENGTH ||
    key.length > MAX_NAME_LENGTH ||
    !/^[A-Z][a-z]+$/.test(value) ||
    /(.)\1\1/.test(key) ||
    /[^aeiouy]{5}/.test(key) ||
    BLOCKED_FRAGMENTS.some((fragment) => key.includes(fragment)) ||
    existingNames.has(key)
  ) {
    return false;
  }

  if (SOURCE_KEY_SET.has(key)) return false;
  const maximumDistance = key.length <= 5 ? 1 : 2;
  for (
    let length = key.length - maximumDistance;
    length <= key.length + maximumDistance;
    length += 1
  ) {
    for (const source of SOURCE_KEYS_BY_LENGTH.get(length) ?? []) {
      const sourceMaximumDistance =
        Math.min(key.length, source.length) <= 5 ? 1 : 2;
      if (isWithinEditDistance(key, source, sourceMaximumDistance))
        return false;
    }
  }
  return true;
}

function buildCandidate(
  family: PhoneticNameFamily,
  signature: string,
  random: SeededRandom,
): string {
  const start = random.pick(family.starts);
  const firstCore = random.pick(family.cores);
  const secondCore =
    random.integer(0, 3) === 0 ? random.pick(family.cores) : '';
  const ending = random.pick(family.endings);
  const parts = [start, firstCore, secondCore, signature, ending];
  const raw = parts
    .join('')
    .replace(/([aeiouy])\1+/g, '$1')
    .replace(/([^aeiouy])\1+/g, '$1');
  return `${raw.charAt(0).toLocaleUpperCase('en-US')}${raw.slice(1)}`;
}

function generateUniqueName(
  family: PhoneticNameFamily,
  signature: string,
  random: SeededRandom,
  used: Set<string>,
): string {
  for (let attempt = 0; attempt < MAX_CANDIDATE_ATTEMPTS; attempt += 1) {
    const candidate = buildCandidate(family, signature, random);
    if (!isAcceptableGeographicName(candidate, used)) continue;
    used.add(comparisonKey(candidate));
    return candidate;
  }
  throw new Error(
    `Unable to generate a safe unique geographic name for family ${family.id}.`,
  );
}

export interface GeneratedGeographicNames {
  continentNames: string[];
  territoryNames: string[];
  /** Diagnostics for tests and naming audits; not serialized into worlds. */
  familyIds: string[];
  dialects: number[];
}

export function generateGeographicNames(
  seed: string,
  continentCount: number,
  continentAssignments: readonly number[],
): GeneratedGeographicNames {
  if (
    !Number.isInteger(continentCount) ||
    continentCount < 1 ||
    continentCount > PHONETIC_NAME_FAMILIES.length
  ) {
    throw new Error(
      `Geographic naming supports 1–${PHONETIC_NAME_FAMILIES.length} continents.`,
    );
  }
  if (
    continentAssignments.some(
      (assignment) =>
        !Number.isInteger(assignment) ||
        assignment < 0 ||
        assignment >= continentCount,
    )
  ) {
    throw new Error('Every territory needs a valid continent assignment.');
  }

  const rootSeed = `${seed}|geographic-names|v${GEOGRAPHIC_NAMING_VERSION}`;
  const familyRandom = createSeededRandom(`${rootSeed}|families`);
  const families = familyRandom
    .shuffle(PHONETIC_NAME_FAMILIES)
    .slice(0, continentCount);
  const dialects = families.map((_, continentIndex) =>
    createSeededRandom(
      `${rootSeed}|continent-${continentIndex}|dialect`,
    ).integer(0, DIALECT_COUNT - 1),
  );
  const signatures = dialects.map(
    (dialect) =>
      `${DIALECT_SYLLABLES[Math.floor(dialect / DIALECT_SYLLABLES.length)]}${DIALECT_SYLLABLES[dialect % DIALECT_SYLLABLES.length]}`,
  );
  const used = new Set<string>();
  const continentNames = families.map((family, continentIndex) =>
    generateUniqueName(
      family,
      signatures[continentIndex]!,
      createSeededRandom(`${rootSeed}|continent-${continentIndex}|name`),
      used,
    ),
  );
  const territoryNames = continentAssignments.map(
    (continentIndex, territoryIndex) =>
      generateUniqueName(
        families[continentIndex]!,
        signatures[continentIndex]!,
        createSeededRandom(
          `${rootSeed}|continent-${continentIndex}|territory-${territoryIndex}`,
        ),
        used,
      ),
  );

  return {
    continentNames,
    territoryNames,
    familyIds: families.map((family) => family.id),
    dialects,
  };
}
