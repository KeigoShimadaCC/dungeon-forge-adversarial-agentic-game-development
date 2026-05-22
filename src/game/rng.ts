/**
 * Deterministic seeded randomness for game setup, procedural generation, and
 * baseline policies.
 *
 * Game logic must not call `Math.random()` directly. Pass a `SeededRng` instance
 * (or derive one from serializable `RngSnapshot` state in `GameState`) into any
 * function that needs randomness.
 */

/** Serializable PRNG state for restore through game state or forks. */
export type RngSnapshot = {
  /** Internal Mulberry32 state (unsigned 32-bit). */
  state: number;
};

export type SeededRng = {
  /** Original seed string used at construction (for logging/debug). */
  readonly seed: string;
  /** Next float in [0, 1). */
  nextFloat: () => number;
  /** Next integer in [min, max] (both inclusive). */
  nextInt: (min: number, max: number) => number;
  /** Deterministic Fisher–Yates shuffle; does not mutate the input array. */
  shuffle: <T>(items: readonly T[]) => T[];
  /** Deterministic pick using parallel item/weight arrays. */
  weightedChoice: <T>(items: readonly T[], weights: readonly number[]) => T;
  /** Capture current state for serialization or branching. */
  snapshot: () => RngSnapshot;
};

const UINT32_MAX = 0xffffffff;

/** Hash a string seed into an unsigned 32-bit starting state. */
function hashSeedToState(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function assertIntegerBounds(min: number, max: number): void {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new Error('RNG integer bounds must be integers');
  }
  if (min > max) {
    throw new Error(`RNG integer bounds invalid: min (${min}) must be <= max (${max})`);
  }
}

function assertWeightedChoiceInputs<T>(
  items: readonly T[],
  weights: readonly number[],
): void {
  if (items.length === 0) {
    throw new Error('RNG weighted choice requires at least one item');
  }
  if (items.length !== weights.length) {
    throw new Error(
      `RNG weighted choice length mismatch: ${items.length} items vs ${weights.length} weights`,
    );
  }
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    if (!Number.isFinite(w) || w < 0) {
      throw new Error(`RNG weighted choice invalid weight at index ${i}: ${String(w)}`);
    }
  }
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) {
    throw new Error('RNG weighted choice requires a positive total weight');
  }
}

function createRngFromState(seed: string, initialState: number): SeededRng {
  let state = initialState >>> 0;
  const next = (): number => {
    let t = (state += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / (UINT32_MAX + 1);
  };

  return {
    seed,
    nextFloat: next,
    nextInt: (min: number, max: number) => {
      assertIntegerBounds(min, max);
      const span = max - min + 1;
      return min + Math.floor(next() * span);
    },
    shuffle: <T>(items: readonly T[]): T[] => {
      const result = [...items];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = result[i];
        result[i] = result[j] as T;
        result[j] = tmp as T;
      }
      return result;
    },
    weightedChoice: <T>(items: readonly T[], weights: readonly number[]): T => {
      assertWeightedChoiceInputs(items, weights);
      const total = weights.reduce((sum, w) => sum + w, 0);
      let threshold = next() * total;
      for (let i = 0; i < items.length; i++) {
        threshold -= weights[i] as number;
        if (threshold < 0) {
          return items[i] as T;
        }
      }
      return items[items.length - 1] as T;
    },
    snapshot: () => ({ state: state >>> 0 }),
  };
}

/** Create a deterministic RNG from a string seed. */
export function createSeededRng(seed: string): SeededRng {
  return createRngFromState(seed, hashSeedToState(seed));
}

/** Restore an RNG from a previously captured snapshot (and original seed label). */
export function restoreSeededRng(seed: string, snapshot: RngSnapshot): SeededRng {
  return createRngFromState(seed, snapshot.state >>> 0);
}
