import { describe, expect, it } from 'vitest';

import {
  createSeededRng,
  restoreSeededRng,
  type SeededRng,
} from '../src/game/rng.js';

function collectFloats(rng: SeededRng, count: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    values.push(rng.nextFloat());
  }
  return values;
}

function collectInts(rng: SeededRng, min: number, max: number, count: number): number[] {
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    values.push(rng.nextInt(min, max));
  }
  return values;
}

describe('Phase 02B seeded RNG', () => {
  it('produces the same float sequence for the same seed', () => {
    const a = collectFloats(createSeededRng('seed_001'), 8);
    const b = collectFloats(createSeededRng('seed_001'), 8);
    expect(b).toEqual(a);
  });

  it('produces the same integer sequence for the same seed', () => {
    const a = collectInts(createSeededRng('seed_002'), 0, 9, 12);
    const b = collectInts(createSeededRng('seed_002'), 0, 9, 12);
    expect(b).toEqual(a);
  });

  it('usually produces different sequences for different seeds', () => {
    const a = collectFloats(createSeededRng('seed_001'), 6);
    const b = collectFloats(createSeededRng('seed_002'), 6);
    expect(b).not.toEqual(a);
  });

  it('shuffles deterministically without mutating the caller array', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    const inputCopy = [...input];
    const rng = createSeededRng('shuffle-seed');

    const first = rng.shuffle(input);
    const second = createSeededRng('shuffle-seed').shuffle(input);

    expect(first).toEqual(second);
    expect(input).toEqual(inputCopy);
    expect(first).not.toBe(input);
  });

  it('weighted choice is deterministic for a fixed seed and weights', () => {
    const items = ['common', 'rare', 'legendary'];
    const weights = [70, 25, 5];
    const rngA = createSeededRng('weights-seed');
    const picks = Array.from({ length: 10 }, () => rngA.weightedChoice(items, weights));
    const rngB = createSeededRng('weights-seed');
    const again = Array.from({ length: 10 }, () => rngB.weightedChoice(items, weights));
    expect(again).toEqual(picks);
  });

  it('restores sequence position from a snapshot', () => {
    const rng = createSeededRng('snapshot-seed');
    collectFloats(rng, 3);
    const snapshot = rng.snapshot();
    const expected = collectFloats(rng, 4);

    const restored = restoreSeededRng('snapshot-seed', snapshot);
    expect(collectFloats(restored, 4)).toEqual(expected);
  });

  it('nextFloat returns values in [0, 1)', () => {
    const rng = createSeededRng('bounds-seed');
    for (let i = 0; i < 50; i++) {
      const value = rng.nextFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('nextInt returns integers within inclusive bounds', () => {
    const rng = createSeededRng('int-bounds-seed');
    for (let i = 0; i < 50; i++) {
      const value = rng.nextInt(3, 7);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('rejects invalid integer bounds', () => {
    const rng = createSeededRng('bad-bounds');
    expect(() => rng.nextInt(5, 2)).toThrow(/bounds invalid/i);
    expect(() => rng.nextInt(1.5, 3)).toThrow(/must be integers/i);
  });

  it('rejects invalid weighted-choice inputs', () => {
    const rng = createSeededRng('bad-weights');
    expect(() => rng.weightedChoice([], [])).toThrow(/at least one item/i);
    expect(() => rng.weightedChoice(['a'], [1, 2])).toThrow(/length mismatch/i);
    expect(() => rng.weightedChoice(['a'], [-1])).toThrow(/invalid weight/i);
    expect(() => rng.weightedChoice(['a'], [0])).toThrow(/positive total weight/i);
  });
});
