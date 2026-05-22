import { createSeededRng } from '../../game/rng.js';
import { sortActionsById } from './helpers.js';
import type { BaselinePlayerInput, BaselinePlayerPolicy } from './types.js';

/** Creates a random valid-action policy with a fixed seed for reproducible choices. */
export function createRandomValidActionPolicy(policySeed: string): BaselinePlayerPolicy {
  return (input: BaselinePlayerInput) => {
    const ordered = sortActionsById(input.availableActions);
    if (ordered.length === 0) {
      throw new Error('randomValidAction requires at least one available action');
    }

    const rng = createSeededRng(
      `${policySeed}:${input.state.seed}:${input.turn}:${ordered.length}`,
    );
    const index = rng.nextInt(0, ordered.length - 1);
    return ordered[index];
  };
}

/** Default random policy using the game seed as the policy RNG label. */
export const randomValidAction: BaselinePlayerPolicy = createRandomValidActionPolicy(
  'baseline-random',
);
