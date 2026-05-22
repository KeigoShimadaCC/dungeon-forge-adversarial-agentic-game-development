import type { GameState, PlayerAction, Position } from '../../game/types.js';

export const CANONICAL_REGRESSION_SEEDS = [
  'seed_001',
  'seed_002',
  'seed_003',
  'seed_004',
  'seed_005',
] as const;

const LOW_HP_FRACTION = 0.4;

export const manhattanDistance = (a: Position, b: Position): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export const findStairsPosition = (state: GameState): Position => {
  for (let y = 0; y < state.map.tiles.length; y += 1) {
    const row = state.map.tiles[y];
    for (let x = 0; x < row.length; x += 1) {
      if (row[x]?.type === 'stairs') {
        return { x, y };
      }
    }
  }

  return { x: state.map.width - 2, y: state.map.height - 2 };
};

export const isLowHp = (state: GameState): boolean =>
  state.player.hp <= Math.max(1, Math.floor(state.player.maxHp * LOW_HP_FRACTION));

export const playerWouldBeAdjacentToEnemy = (
  state: GameState,
  destination: Position,
): boolean =>
  state.enemies.some((enemy) => manhattanDistance(destination, enemy) === 1);

export const destinationFromMoveAction = (
  state: GameState,
  action: PlayerAction,
): Position | undefined => {
  if (action.type !== 'move') {
    return undefined;
  }
  const dx = action.payload?.dx;
  const dy = action.payload?.dy;
  if (typeof dx !== 'number' || typeof dy !== 'number') {
    return undefined;
  }
  return { x: state.player.x + dx, y: state.player.y + dy };
};

/** Stable ordering for deterministic tie-breaking. */
export const sortActionsById = (actions: readonly PlayerAction[]): PlayerAction[] =>
  [...actions].sort((left, right) => left.id.localeCompare(right.id));

export const firstActionOfType = (
  actions: readonly PlayerAction[],
  type: PlayerAction['type'],
): PlayerAction | undefined => sortActionsById(actions).find((action) => action.type === type);

export const moveActions = (actions: readonly PlayerAction[]): PlayerAction[] =>
  sortActionsById(actions).filter((action) => action.type === 'move');

export const pickMoveMinimizingDistance = (
  state: GameState,
  actions: readonly PlayerAction[],
  target: Position,
): PlayerAction | undefined => {
  const moves = moveActions(actions);
  if (moves.length === 0) {
    return undefined;
  }

  let best: PlayerAction | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const move of moves) {
    const destination = destinationFromMoveAction(state, move);
    if (!destination) {
      continue;
    }
    const distance = manhattanDistance(destination, target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = move;
    }
  }

  return best;
};

/** Deterministic fallback when a policy has no preferred action. */
export const deterministicFallback = (actions: readonly PlayerAction[]): PlayerAction => {
  const ordered = sortActionsById(actions);
  const priority: PlayerAction['type'][] = [
    'wait',
    'inspect',
    'attack',
    'move',
    'pickup',
    'use_item',
    'descend',
    'talk',
  ];

  for (const type of priority) {
    const match = ordered.find((action) => action.type === type);
    if (match) {
      return match;
    }
  }

  return ordered[0];
};

export const actionsMatch = (left: PlayerAction, right: PlayerAction): boolean =>
  left.id === right.id && left.type === right.type;

export const findMatchingAvailableAction = (
  availableActions: readonly PlayerAction[],
  choice: PlayerAction,
): PlayerAction | undefined =>
  availableActions.find((action) => actionsMatch(action, choice));
