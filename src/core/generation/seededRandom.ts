export interface SeededRandom {
  next(): number;
  integer(min: number, max: number): number;
  pick<T>(values: readonly T[]): T;
  shuffle<T>(values: readonly T[]): T[];
}

function xmur3(value: string): () => number {
  let hash = 1779033703 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const result = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + result) | 0;
    return (result >>> 0) / 4294967296;
  };
}

export function createSeededRandom(seed: string): SeededRandom {
  const hash = xmur3(seed);
  const random = sfc32(hash(), hash(), hash(), hash());

  return {
    next: random,
    integer(min, max) {
      return Math.floor(random() * (max - min + 1)) + min;
    },
    pick<T>(values: readonly T[]): T {
      if (values.length === 0)
        throw new Error('Cannot pick from an empty array.');
      return values[Math.floor(random() * values.length)] as T;
    },
    shuffle<T>(values: readonly T[]): T[] {
      const result = [...values];
      for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [result[index], result[swapIndex]] = [
          result[swapIndex] as T,
          result[index] as T,
        ];
      }
      return result;
    },
  };
}
