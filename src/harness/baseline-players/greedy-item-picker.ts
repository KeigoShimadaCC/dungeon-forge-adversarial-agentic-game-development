import {
  FIRE_SEED_ITEM_ID,
  POTION_ITEM_ID,
  SMOKE_BOMB_ITEM_ID,
} from '../../game/content.js';
import {
  firstActionOfType,
  isLowHp,
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
  if (isLowHp(input.state)) {
    const healItem = input.availableActions.find(
      (action) =>
        action.type === 'use_item' &&
        (action.payload?.itemType === POTION_ITEM_ID || action.payload?.effect === 'heal'),
    );
    if (healItem) {
      return healItem;
    }
  }

  const fireSeedUse = input.availableActions.find(
    (action) =>
      action.type === 'use_item' && action.payload?.itemType === FIRE_SEED_ITEM_ID,
  );
  if (
    fireSeedUse &&
    input.state.enemies.some((enemy) => manhattanDistance(input.state.player, enemy) <= 2)
  ) {
    return fireSeedUse;
  }

  const smokeUse = input.availableActions.find(
    (action) =>
      action.type === 'use_item' && action.payload?.itemType === SMOKE_BOMB_ITEM_ID,
  );
  if (smokeUse && input.state.enemies.length > 0) {
    return smokeUse;
  }

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
