import { SMOKE_BOMB_ITEM_ID } from '../../game/content.js';
import {
  deterministicFallback,
  findStairsPosition,
  firstActionOfType,
  manhattanDistance,
  pickMoveMinimizingDistance,
} from './helpers.js';
import type { BaselinePlayerInput, BaselinePlayerPolicy } from './types.js';

export const stairsSeeking: BaselinePlayerPolicy = (input: BaselinePlayerInput) => {
  const { availableActions, state } = input;

  const descend = firstActionOfType(availableActions, 'descend');
  if (descend) {
    return descend;
  }

  const smokeUse = availableActions.find(
    (action) =>
      action.type === 'use_item' && action.payload?.itemType === SMOKE_BOMB_ITEM_ID,
  );
  if (
    smokeUse &&
    state.player.inventory.includes(SMOKE_BOMB_ITEM_ID) &&
    state.enemies.some((enemy) => manhattanDistance(state.player, enemy) <= 2)
  ) {
    return smokeUse;
  }

  const pickup = firstActionOfType(availableActions, 'pickup');
  if (pickup) {
    return pickup;
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
