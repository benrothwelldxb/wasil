/**
 * Deterministic, dependency-free seeded RNG.
 *
 * `xmur3` hashes a string into a 32-bit seed; `mulberry32` turns that seed into
 * a fast PRNG. Everything in the synthetic engine draws from here — there is NO
 * `Math.random()` or `Date.now()` anywhere in generation, so identical inputs
 * always yield byte-identical journeys.
 */

/** xmur3 string hash → a stateful generator of 32-bit unsigned integers. */
export function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function next(): number {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32 PRNG seeded from a 32-bit integer → floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** Uniform float in [0, 1). */
  rand(): number;
  /** Uniform integer in [min, max], inclusive. */
  randInt(min: number, max: number): number;
  /** Uniform element of a non-empty array. */
  pick<T>(arr: readonly T[]): T;
  /** Weighted choice from [value, weight] pairs (weights need not sum to 1). */
  weighted<T>(pairs: ReadonlyArray<readonly [T, number]>): T;
  /** `base` scaled by a symmetric factor in [1 - pct, 1 + pct]. */
  jitter(base: number, pct: number): number;
}

/** Build an independent RNG from a seed string. */
export function createRng(seedString: string): Rng {
  const seed = xmur3(seedString)();
  const rand = mulberry32(seed);

  const randInt = (min: number, max: number): number => {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(rand() * (max - min + 1));
  };

  const pick = <T>(arr: readonly T[]): T => {
    if (arr.length === 0) throw new Error('Rng.pick: empty array');
    return arr[Math.floor(rand() * arr.length)];
  };

  const weighted = <T>(pairs: ReadonlyArray<readonly [T, number]>): T => {
    if (pairs.length === 0) throw new Error('Rng.weighted: empty pairs');
    const total = pairs.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
    if (total <= 0) return pairs[0][0];
    let roll = rand() * total;
    for (const [value, w] of pairs) {
      roll -= Math.max(0, w);
      if (roll < 0) return value;
    }
    return pairs[pairs.length - 1][0];
  };

  const jitter = (base: number, pct: number): number => base * (1 + (rand() * 2 - 1) * pct);

  return { rand, randInt, pick, weighted, jitter };
}

/**
 * Stable base36 identifier derived from a string. Two 32-bit words are
 * concatenated for collision resistance across the candidate set.
 */
export function toBase36Id(str: string): string {
  const gen = xmur3(str);
  const a = gen();
  const b = gen();
  return a.toString(36) + b.toString(36);
}
