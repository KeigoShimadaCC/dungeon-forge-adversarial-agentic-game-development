import {
  destinationFromMoveAction,
  deterministicFallback,
  firstActionOfType,
  isLowHp,
  moveActions,
  playerWouldBeAdjacentToEnemy,
} from './helpers.js';
import type { BaselinePlayerInput, BaselinePlayerPolicy } from './types.js';

export const cautiousLowHp: BaselinePlayerPolicy = (input: BaselinePlayerInput) => {
  const { availableActions, state } = input;

  if (isLowHp(state)) {
    const usePotion = firstActionOfType(availableActions, 'use_item');
    if (usePotion) {
      return usePotion;
    }
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
