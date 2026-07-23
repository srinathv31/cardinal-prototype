// Seeded PRNG for background-account noise. The three personas are
// hand-authored literals; only background accounts draw from this. Determinism
// depends on draw order — background.ts documents its fixed draw sequence.

export const PRNG_SEED = 20260805; // first demo date

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  cents(minDollars: number, maxDollars: number): number;
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: (arr) => arr[int(0, arr.length - 1)],
    cents: (minDollars, maxDollars) =>
      int(minDollars * 100, maxDollars * 100),
  };
}
