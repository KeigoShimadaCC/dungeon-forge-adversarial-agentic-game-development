import {
  firstActionOfType,
  manhattanDistance,
  pickMoveMinimizingDistance,
} from './helpers.js';
import { stairsSeeking } from './stairs-seeking.js';
import type { BaselinePlayerInput, BaselinePlayerPolicy } from './types.js';

const nearestItemTarget = (input: BaselinePlayerInput) => {
  const { state } = input;
  if (state.items.length === 0) {
    return undefined;
  }

  let nearest = state.items[0];
  let nearestDistance = manhattanDistance(state.player, nearest);

  for (const item of state.items.slice(1)) {
    const distance = manhattanDistance(state.player, item);
    if (distance < nearestDistance) {
      nearest = item;
      nearestDistance = distance;
    }
  }

  return nearest;
};

export const greedyItemPicker: BaselinePlayerPolicy = (input: BaselinePlayerInput) => {
  const pickup = firstActionOfType(input.availableActions, 'pickup');
  if (pickup) {
    return pickup;
  }

  const targetItem = nearestItemTarget(input);
  if (targetItem) {
    const towardItem = pickMoveMinimizingDistance(
      input.state,
      input.availableActions,
      targetItem,
    );
    if (towardItem) {
      return towardItem;
    }
  }

  return stairsSeeking(input);
};
