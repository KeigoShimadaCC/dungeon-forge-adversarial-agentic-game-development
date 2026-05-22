import type {
  EnemyInstance,
  GameEvent,
  GameMap,
  GameState,
  ItemInstance,
  Position,
  Tile,
} from './types.js';

const DIRECTIONS = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
] as const;

const positionKey = (position: Position): string => `${position.x},${position.y}`;

const samePosition = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

const manhattanDistance = (a: Position, b: Position): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const getTile = (map: GameMap, position: Position): Tile | undefined =>
  map.tiles[position.y]?.[position.x];

const isInteriorWall = (map: GameMap, position: Position): boolean => {
  const tile = getTile(map, position);
  if (tile?.type !== 'wall') {
    return false;
  }
  return (
    position.x > 0 &&
    position.y > 0 &&
    position.x < map.width - 1 &&
    position.y < map.height - 1
  );
};

const enemyPayload = (
  enemy: EnemyInstance,
  extra: Record<string, string | number | boolean | null> = {},
): Record<string, string | number | boolean | null> => ({
  enemyId: enemy.id,
  enemyType: enemy.type,
  behavior: enemy.behavior,
  ...extra,
});

const makeEvent = (
  turn: number,
  type: string,
  message: string,
  enemy: EnemyInstance,
  extra: Record<string, string | number | boolean | null> = {},
): GameEvent => ({
  id:
    extra.x !== undefined && extra.y !== undefined
      ? `turn-${turn}-${type}-${enemy.id}-${extra.x}-${extra.y}`
      : `turn-${turn}-${type}-${enemy.id}`,
  type,
  message,
  turn,
  payload: enemyPayload(enemy, extra),
});

const isAdjacent = (a: Position, b: Position): boolean =>
  manhattanDistance(a, b) === 1;

const chaseMoveDeltas = (from: Position, target: Position): Position[] => {
  const horizontalStep = Math.sign(target.x - from.x);
  const verticalStep = Math.sign(target.y - from.y);
  return Math.abs(target.x - from.x) >= Math.abs(target.y - from.y)
    ? [
        { x: horizontalStep, y: 0 },
        { x: 0, y: verticalStep },
      ]
    : [
        { x: 0, y: verticalStep },
        { x: horizontalStep, y: 0 },
      ];
};

const canSlimeEnter = (
  state: GameState,
  destination: Position,
  occupied: Set<string>,
): boolean =>
  getTile(state.map, destination)?.walkable === true &&
  !samePosition(destination, state.player) &&
  !occupied.has(positionKey(destination));

const canGhostEnter = (
  state: GameState,
  destination: Position,
  occupied: Set<string>,
): boolean => {
  if (
    destination.x < 0 ||
    destination.y < 0 ||
    destination.x >= state.map.width ||
    destination.y >= state.map.height
  ) {
    return false;
  }
  if (samePosition(destination, state.player)) {
    return false;
  }
  if (occupied.has(positionKey(destination))) {
    return false;
  }
  const tile = getTile(state.map, destination);
  if (!tile) {
    return false;
  }
  return tile.type === 'floor' || isInteriorWall(state.map, destination);
};

const tryChaseMove = (
  state: GameState,
  enemy: EnemyInstance,
  target: Position,
  occupied: Set<string>,
  events: GameEvent[],
  canEnter: (
    gameState: GameState,
    destination: Position,
    blocked: Set<string>,
  ) => boolean,
): boolean => {
  for (const move of chaseMoveDeltas(enemy, target)) {
    if (move.x === 0 && move.y === 0) {
      continue;
    }
    const destination = { x: enemy.x + move.x, y: enemy.y + move.y };
    if (canEnter(state, destination, occupied)) {
      enemy.x = destination.x;
      enemy.y = destination.y;
      events.push(
        makeEvent(state.turn, 'enemy_move', `${enemy.label} shuffles closer.`, enemy, {
          x: enemy.x,
          y: enemy.y,
          reason: 'chase',
        }),
      );
      return true;
    }
  }
  return false;
};

const attackPlayer = (
  state: GameState,
  enemy: EnemyInstance,
  events: GameEvent[],
): void => {
  state.player.hp = Math.max(0, state.player.hp - enemy.attack);
  events.push(
    makeEvent(
      state.turn,
      'enemy_attack',
      `${enemy.label} hits you for ${enemy.attack}.`,
      enemy,
      { damage: enemy.attack, reason: 'adjacent' },
    ),
  );
};

const nearestItem = (
  enemy: EnemyInstance,
  items: ItemInstance[],
): ItemInstance | undefined => {
  let best: ItemInstance | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const distance = manhattanDistance(enemy, item);
    if (
      distance < bestDistance ||
      (distance === bestDistance &&
        best &&
        (item.x < best.x || (item.x === best.x && item.y < best.y)))
    ) {
      best = item;
      bestDistance = distance;
    }
  }
  return best;
};

const runChaseTurn = (
  state: GameState,
  enemy: EnemyInstance,
  events: GameEvent[],
  occupied: Set<string>,
): void => {
  if (isAdjacent(enemy, state.player)) {
    attackPlayer(state, enemy, events);
    return;
  }
  tryChaseMove(state, enemy, state.player, occupied, events, canSlimeEnter);
};

const runBatTurn = (
  state: GameState,
  enemy: EnemyInstance,
  events: GameEvent[],
  occupied: Set<string>,
): void => {
  if (isAdjacent(enemy, state.player)) {
    attackPlayer(state, enemy, events);
    return;
  }
  for (let step = 0; step < 2; step += 1) {
    if (!tryChaseMove(state, enemy, state.player, occupied, events, canSlimeEnter)) {
      break;
    }
  }
};

const runShellTurn = (
  state: GameState,
  enemy: EnemyInstance,
  events: GameEvent[],
): void => {
  if (isAdjacent(enemy, state.player)) {
    attackPlayer(state, enemy, events);
    return;
  }
  events.push(
    makeEvent(state.turn, 'enemy_wait', `${enemy.label} holds its ground.`, enemy, {
      reason: 'not_adjacent',
    }),
  );
};

const runThiefTurn = (
  state: GameState,
  enemy: EnemyInstance,
  events: GameEvent[],
  occupied: Set<string>,
): void => {
  const itemIndex = state.items.findIndex((item) => samePosition(item, enemy));
  if (itemIndex >= 0) {
    const stolen = state.items[itemIndex];
    state.items.splice(itemIndex, 1);
    events.push(
      makeEvent(state.turn, 'enemy_steal', `${enemy.label} steals ${stolen.label}.`, enemy, {
        itemId: stolen.id,
        itemType: stolen.type,
        x: enemy.x,
        y: enemy.y,
        reason: 'on_item',
      }),
    );
    return;
  }

  const targetItem = nearestItem(enemy, state.items);
  if (targetItem) {
    tryChaseMove(state, enemy, targetItem, occupied, events, canSlimeEnter);
    return;
  }

  if (isAdjacent(enemy, state.player)) {
    attackPlayer(state, enemy, events);
    return;
  }

  tryChaseMove(state, enemy, state.player, occupied, events, canSlimeEnter);
};

const runGhostTurn = (
  state: GameState,
  enemy: EnemyInstance,
  events: GameEvent[],
  occupied: Set<string>,
): void => {
  if (isAdjacent(enemy, state.player)) {
    attackPlayer(state, enemy, events);
    return;
  }

  const candidates: Position[] = [{ x: enemy.x, y: enemy.y }];
  for (const direction of DIRECTIONS) {
    candidates.push({
      x: enemy.x + direction.dx,
      y: enemy.y + direction.dy,
    });
  }

  const enterable = candidates.filter((candidate) =>
    canGhostEnter(state, candidate, occupied),
  );
  if (enterable.length === 0) {
    events.push(
      makeEvent(state.turn, 'enemy_wait', `${enemy.label} drifts in place.`, enemy, {
        reason: 'blocked',
      }),
    );
    return;
  }

  enterable.sort((a, b) => {
    const distanceDiff =
      manhattanDistance(a, state.player) - manhattanDistance(b, state.player);
    if (distanceDiff !== 0) {
      return distanceDiff;
    }
    if (a.x !== b.x) {
      return a.x - b.x;
    }
    return a.y - b.y;
  });

  const destination = enterable[0];
  if (samePosition(destination, enemy)) {
    events.push(
      makeEvent(state.turn, 'enemy_wait', `${enemy.label} drifts in place.`, enemy, {
        reason: 'blocked',
      }),
    );
    return;
  }

  enemy.x = destination.x;
  enemy.y = destination.y;
  const onWall = isInteriorWall(state.map, destination);
  events.push(
    makeEvent(
      state.turn,
      onWall ? 'enemy_phase' : 'enemy_move',
      onWall
        ? `${enemy.label} phases through stone.`
        : `${enemy.label} glides closer.`,
      enemy,
      {
        x: enemy.x,
        y: enemy.y,
        reason: onWall ? 'phase' : 'chase',
      },
    ),
  );
};

const runEnemyTurn = (
  state: GameState,
  enemy: EnemyInstance,
  events: GameEvent[],
  occupied: Set<string>,
): void => {
  switch (enemy.behavior) {
    case 'chase':
      runChaseTurn(state, enemy, events, occupied);
      break;
    case 'bat':
      runBatTurn(state, enemy, events, occupied);
      break;
    case 'shell':
      runShellTurn(state, enemy, events);
      break;
    case 'thief':
      runThiefTurn(state, enemy, events, occupied);
      break;
    case 'ghost':
      runGhostTurn(state, enemy, events, occupied);
      break;
  }
};

export const runEnemyTurns = (state: GameState, events: GameEvent[]): void => {
  const occupied = new Set(state.enemies.map((enemy) => positionKey(enemy)));

  for (const enemy of state.enemies) {
    occupied.delete(positionKey(enemy));
    runEnemyTurn(state, enemy, events, occupied);
    occupied.add(positionKey(enemy));
  }
};
