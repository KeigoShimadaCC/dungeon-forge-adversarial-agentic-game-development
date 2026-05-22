import {
  deterministicFallback,
  findStairsPosition,
  firstActionOfType,
  pickMoveMinimizingDistance,
} from './helpers.js';
import type { BaselinePlayerInput, BaselinePlayerPolicy } from './types.js';

export const stairsSeeking: BaselinePlayerPolicy = (input: BaselinePlayerInput) => {
  const { availableActions, state } = input;

  const descend = firstActionOfType(availableActions, 'descend');
  if (descend) {
    return descend;
  }

  const towardStairs = pickMoveMinimizingDistance(
    state,
    availableActions,
    findStairsPosition(state),
  );
  if (towardStairs) {
    return towardStairs;
  }

  return deterministicFallback(availableActions);
};
