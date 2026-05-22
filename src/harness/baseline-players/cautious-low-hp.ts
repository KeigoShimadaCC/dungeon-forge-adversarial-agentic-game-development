import { SMOKE_BOMB_ITEM_ID } from '../../game/content.js';
import {
  destinationFromMoveAction,
  deterministicFallback,
  firstActionOfType,
  isLowHp,
  manhattanDistance,
  moveActions,
  playerWouldBeAdjacentToEnemy,
} from './helpers.js';
import type { BaselinePlayerInput, BaselinePlayerPolicy } from './types.js';

export const cautiousLowHp: BaselinePlayerPolicy = (input: BaselinePlayerInput) => {
  const { availableActions, state } = input;

  if (isLowHp(state)) {
    const healItem = availableActions.find(
      (action) => action.type === 'use_item' && action.payload?.effect === 'heal',
    );
    if (healItem) {
      return healItem;
    }
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
  if (
    pickup &&
    !state.enemies.some((enemy) => manhattanDistance(state.player, enemy) === 1)
  ) {
    return pickup;
  }

  const safeMoves = moveActions(availableActions).filter((move) => {
    const destination = destinationFromMoveAction(state, move);
    return destination && !playerWouldBeAdjacentToEnemy(state, destination);
  });
  if (safeMoves.length > 0) {
    return safeMoves[0];
  }

  const attack = firstActionOfType(availableActions, 'attack');
  if (attack) {
    return attack;
  }

  const anyMove = firstActionOfType(availableActions, 'move');
  if (anyMove) {
    return anyMove;
  }

  return deterministicFallback(availableActions);
};
