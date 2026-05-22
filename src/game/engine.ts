import {
  loadGameContent,
  POTION_ITEM_ID,
  type EnemyDefinition,
  type FloorRuleDefinition,
  type ItemDefinition,
} from './content.js';
import { createSeededRng } from './rng.js';
import type {
  GameConfig,
  GameEvent,
  GameMap,
  GameState,
  ItemInstance,
  PlayerAction,
  Position,
  StepResult,
  Tile,
} from './types.js';

export interface GameEngine {
  start(seed: string, config?: GameConfig): GameState;
  getAvailableActions(state: GameState): PlayerAction[];
  step(state: GameState, action: PlayerAction): StepResult;
  render(state: GameState): string;
  isTerminal(state: GameState): boolean;
}

const DEFAULT_VERSION = '0.3.0-minimal-dungeon';
const DEFAULT_OBJECTIVE = 'Reach the final stairs and escape the dawn dungeon.';
const PLAYER_START: Position = { x: 1, y: 1 };
const PLAYER_MAX_HP = 20;
const PLAYER_ATTACK = 4;
const RECENT_LOG_LIMIT = 8;

const FLOOR_TILE: Tile = {
  type: 'floor',
  glyph: '.',
  walkable: true,
  description: 'plain stone floor',
};

const WALL_TILE: Tile = {
  type: 'wall',
  glyph: '#',
  walkable: false,
  description: 'solid dungeon wall',
};

const STAIRS_TILE: Tile = {
  type: 'stairs',
  glyph: '>',
  walkable: true,
  description: 'stairs to the next floor',
};

const DIRECTIONS = [
  { name: 'north', dx: 0, dy: -1 },
  { name: 'south', dx: 0, dy: 1 },
  { name: 'west', dx: -1, dy: 0 },
  { name: 'east', dx: 1, dy: 0 },
] as const;

const content = loadGameContent();
const floorRules = [...content.floors.floors].sort((a, b) => a.floor - b.floor);

const cloneState = (state: GameState): GameState =>
  JSON.parse(JSON.stringify(state)) as GameState;

const positionKey = (position: Position): string => `${position.x},${position.y}`;

const samePosition = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

const manhattanDistance = (a: Position, b: Position): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const getFloorRule = (floor: number): FloorRuleDefinition => {
  const rule = floorRules.find((candidate) => candidate.floor === floor);
  if (!rule) {
    throw new Error(`Missing floor rule for floor ${floor}`);
  }
  return rule;
};

const getEnemyDefinition = (id: string): EnemyDefinition => {
  const enemy = content.enemies.enemies.find((candidate) => candidate.id === id);
  if (!enemy) {
    throw new Error(`Missing enemy content: ${id}`);
  }
  return enemy;
};

const getItemDefinition = (id: string): ItemDefinition => {
  const item = content.items.items.find((candidate) => candidate.id === id);
  if (!item) {
    throw new Error(`Missing item content: ${id}`);
  }
  return item;
};

const defaultMaxTurns = (): number =>
  floorRules.reduce((total, rule) => total + rule.maxTurns, 0);

const normalizePositiveInteger = (
  value: number | undefined,
  fallback: number,
): number => {
  if (Number.isInteger(value) && value !== undefined && value > 0) {
    return value;
  }

  return fallback;
};

const createMap = (rule: FloorRuleDefinition): GameMap => {
  const stairs = getStairsPosition(rule);
  const tiles = Array.from({ length: rule.height }, (_, y) =>
    Array.from({ length: rule.width }, (_, x): Tile => {
      if (x === 0 || y === 0 || x === rule.width - 1 || y === rule.height - 1) {
        return { ...WALL_TILE };
      }
      if (x === stairs.x && y === stairs.y) {
        return { ...STAIRS_TILE };
      }
      return { ...FLOOR_TILE };
    }),
  );

  return {
    width: rule.width,
    height: rule.height,
    tiles,
  };
};

const getStairsPosition = (rule: FloorRuleDefinition): Position => ({
  x: rule.width - 2,
  y: rule.height - 2,
});

const getTile = (map: GameMap, position: Position): Tile | undefined =>
  map.tiles[position.y]?.[position.x];

const isWalkable = (map: GameMap, position: Position): boolean =>
  getTile(map, position)?.walkable === true;

const interiorPositions = (rule: FloorRuleDefinition): Position[] => {
  const positions: Position[] = [];
  const stairs = getStairsPosition(rule);
  for (let y = 1; y < rule.height - 1; y += 1) {
    for (let x = 1; x < rule.width - 1; x += 1) {
      const position = { x, y };
      if (!samePosition(position, PLAYER_START) && !samePosition(position, stairs)) {
        positions.push(position);
      }
    }
  }
  return positions;
};

const choosePositions = (
  seed: string,
  floor: number,
  rule: FloorRuleDefinition,
  count: number,
  occupied: Set<string>,
  options: { safeFromPlayer?: boolean } = {},
): Position[] => {
  const rng = createSeededRng(`${seed}:floor:${floor}:${occupied.size}:${count}`);
  const allCandidates = interiorPositions(rule).filter(
    (position) => !occupied.has(positionKey(position)),
  );
  const preferredCandidates = options.safeFromPlayer
    ? allCandidates.filter(
        (position) => manhattanDistance(position, PLAYER_START) > 2,
      )
    : allCandidates;
  const candidates =
    preferredCandidates.length >= count ? preferredCandidates : allCandidates;
  return rng.shuffle(candidates).slice(0, count);
};

const placeEnemies = (
  seed: string,
  floor: number,
  rule: FloorRuleDefinition,
  occupied: Set<string>,
): GameState['enemies'] => {
  if (rule.enemyIds.length === 0 || rule.enemySpawnCount === 0) {
    return [];
  }

  const positions = choosePositions(seed, floor, rule, rule.enemySpawnCount, occupied, {
    safeFromPlayer: true,
  });

  return positions.map((position, index) => {
    const definition = getEnemyDefinition(rule.enemyIds[index % rule.enemyIds.length]);
    occupied.add(positionKey(position));

    return {
      id: `${definition.id}-${floor}-${index + 1}`,
      type: definition.id,
      label: definition.displayName,
      hp: definition.hp,
      maxHp: definition.hp,
      attack: definition.attack,
      glyph: 's',
      ...position,
    };
  });
};

const placeItems = (
  seed: string,
  floor: number,
  rule: FloorRuleDefinition,
  occupied: Set<string>,
): ItemInstance[] => {
  if (rule.itemIds.length === 0 || rule.itemSpawnCount === 0) {
    return [];
  }

  const positions = choosePositions(seed, floor, rule, rule.itemSpawnCount, occupied);

  return positions.map((position, index) => {
    const definition = getItemDefinition(rule.itemIds[index % rule.itemIds.length]);
    occupied.add(positionKey(position));

    return {
      id: `${definition.id}-${floor}-${index + 1}`,
      type: definition.id,
      label: definition.displayName,
      glyph: '!',
      ...position,
    };
  });
};

const createFloorState = (params: {
  seed: string;
  version: string;
  floor: number;
  turn: number;
  maxTurns: number;
  objective: string;
  playerHp?: number;
  inventory?: string[];
  log: string[];
}): GameState => {
  const rule = getFloorRule(params.floor);
  const occupied = new Set<string>([positionKey(PLAYER_START), positionKey(getStairsPosition(rule))]);
  const enemies = placeEnemies(params.seed, params.floor, rule, occupied);
  const items = placeItems(params.seed, params.floor, rule, occupied);

  return {
    version: params.version,
    seed: params.seed,
    turn: params.turn,
    floor: params.floor,
    terminalStatus: 'ACTIVE',
    player: {
      ...PLAYER_START,
      hp: params.playerHp ?? PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      inventory: [...(params.inventory ?? [])],
    },
    map: createMap(rule),
    enemies,
    items,
    log: [...params.log],
    meta: {
      maxTurns: params.maxTurns,
      objective: params.objective,
      totalFloors: floorRules.length,
    },
  };
};

export const start = (seed: string, config: GameConfig = {}): GameState =>
  createFloorState({
    seed,
    version: config.version ?? DEFAULT_VERSION,
    floor: 1,
    turn: 0,
    maxTurns: normalizePositiveInteger(config.maxTurns, defaultMaxTurns()),
    objective: config.objective ?? DEFAULT_OBJECTIVE,
    log: ['You enter Seven Floors to Dawn.'],
  });

export const isTerminal = (state: GameState): boolean =>
  state.terminalStatus !== 'ACTIVE';

const enemyAt = (state: GameState, position: Position): GameState['enemies'][number] | undefined =>
  state.enemies.find((enemy) => samePosition(enemy, position));

const itemsAt = (state: GameState, position: Position): ItemInstance[] =>
  state.items.filter((item) => samePosition(item, position));

const canMoveTo = (state: GameState, position: Position): boolean =>
  isWalkable(state.map, position) && enemyAt(state, position) === undefined;

export const getAvailableActions = (state: GameState): PlayerAction[] => {
  if (isTerminal(state)) {
    return [];
  }

  const actions: PlayerAction[] = [];

  for (const direction of DIRECTIONS) {
    const destination = {
      x: state.player.x + direction.dx,
      y: state.player.y + direction.dy,
    };
    if (canMoveTo(state, destination)) {
      actions.push({
        id: `move_${direction.name}`,
        type: 'move',
        label: `Move ${direction.name}`,
        payload: { dx: direction.dx, dy: direction.dy },
      });
    }
  }

  for (const enemy of state.enemies) {
    if (manhattanDistance(state.player, enemy) === 1) {
      actions.push({
        id: `attack_${enemy.id}`,
        type: 'attack',
        label: `Attack ${enemy.label}`,
        payload: { targetId: enemy.id },
      });
    }
  }

  for (const item of itemsAt(state, state.player)) {
    actions.push({
      id: `pickup_${item.id}`,
      type: 'pickup',
      label: `Pick up ${item.label}`,
      payload: { itemId: item.id },
    });
  }

  if (state.player.inventory.includes(POTION_ITEM_ID)) {
    actions.push({
      id: `use_${POTION_ITEM_ID}`,
      type: 'use_item',
      label: 'Use Healing Potion',
      payload: { itemType: POTION_ITEM_ID },
    });
  }

  const tile = getTile(state.map, state.player);
  if (tile?.type === 'stairs') {
    actions.push({
      id: 'descend_stairs',
      type: 'descend',
      label:
        state.floor >= state.meta.totalFloors
          ? 'Escape through the final stairs'
          : 'Descend stairs',
      payload: { floor: state.floor + 1 },
    });
  }

  actions.push(
    {
      id: 'wait',
      type: 'wait',
      label: 'Wait',
      payload: { turns: 1 },
    },
    {
      id: 'inspect_status',
      type: 'inspect',
      label: 'Inspect status',
      payload: { subject: 'status' },
    },
  );

  return actions;
};

const findMatchingAction = (
  availableActions: PlayerAction[],
  action: PlayerAction,
): PlayerAction | undefined =>
  availableActions.find(
    (availableAction) =>
      availableAction.id === action.id && availableAction.type === action.type,
  );

const event = (
  turn: number,
  type: string,
  message: string,
  payload: Record<string, string | number | boolean | null> = {},
): GameEvent => ({
  id: `turn-${turn}-${type}`,
  type,
  message,
  turn,
  payload,
});

const directionFromAction = (action: PlayerAction): Position => {
  const dx = action.payload?.dx;
  const dy = action.payload?.dy;
  return {
    x: typeof dx === 'number' ? dx : 0,
    y: typeof dy === 'number' ? dy : 0,
  };
};

const appendEventsToLog = (state: GameState, events: GameEvent[]): void => {
  state.log = [...state.log, ...events.map((entry) => entry.message)].slice(
    -RECENT_LOG_LIMIT,
  );
};

const removeFirstInventoryItem = (inventory: string[], itemType: string): string[] => {
  const nextInventory = [...inventory];
  const index = nextInventory.indexOf(itemType);
  if (index >= 0) {
    nextInventory.splice(index, 1);
  }
  return nextInventory;
};

const moveSlimes = (state: GameState, events: GameEvent[]): void => {
  const occupied = new Set(
    state.enemies.map((enemy) => positionKey(enemy)),
  );

  for (const enemy of state.enemies) {
    occupied.delete(positionKey(enemy));

    if (manhattanDistance(enemy, state.player) === 1) {
      state.player.hp = Math.max(0, state.player.hp - enemy.attack);
      events.push(
        event(state.turn, 'enemy_attack', `${enemy.label} hits you for ${enemy.attack}.`, {
          enemyId: enemy.id,
          damage: enemy.attack,
        }),
      );
      occupied.add(positionKey(enemy));
      continue;
    }

    const horizontalStep = Math.sign(state.player.x - enemy.x);
    const verticalStep = Math.sign(state.player.y - enemy.y);
    const preferredMoves =
      Math.abs(state.player.x - enemy.x) >= Math.abs(state.player.y - enemy.y)
        ? [
            { x: horizontalStep, y: 0 },
            { x: 0, y: verticalStep },
          ]
        : [
            { x: 0, y: verticalStep },
            { x: horizontalStep, y: 0 },
          ];

    for (const move of preferredMoves) {
      if (move.x === 0 && move.y === 0) {
        continue;
      }
      const destination = { x: enemy.x + move.x, y: enemy.y + move.y };
      if (
        isWalkable(state.map, destination) &&
        !samePosition(destination, state.player) &&
        !occupied.has(positionKey(destination))
      ) {
        enemy.x = destination.x;
        enemy.y = destination.y;
        events.push(
          event(state.turn, 'enemy_move', `${enemy.label} shuffles closer.`, {
            enemyId: enemy.id,
            x: enemy.x,
            y: enemy.y,
          }),
        );
        break;
      }
    }

    occupied.add(positionKey(enemy));
  }
};

const finalizeTerminalState = (state: GameState, events: GameEvent[]): void => {
  if (state.terminalStatus !== 'ACTIVE') {
    return;
  }

  if (state.player.hp <= 0) {
    state.terminalStatus = 'LOSS';
    events.push(
      event(state.turn, 'loss', 'You collapse in the dungeon.', {
        terminalStatus: 'LOSS',
      }),
    );
    return;
  }

  if (state.turn >= state.meta.maxTurns) {
    state.terminalStatus = 'ABORTED';
    events.push(
      event(state.turn, 'aborted', 'The run aborted after reaching the maximum turn limit.', {
        terminalStatus: 'ABORTED',
      }),
    );
  }
};

const descend = (state: GameState, events: GameEvent[]): GameState => {
  if (state.floor >= state.meta.totalFloors) {
    state.terminalStatus = 'WIN';
    events.push(
      event(state.turn, 'win', 'You escape through the final stairs.', {
        terminalStatus: 'WIN',
      }),
    );
    appendEventsToLog(state, events);
    return state;
  }

  events.push(
    event(state.turn, 'descend', `You descend to floor ${state.floor + 1}.`, {
      floor: state.floor + 1,
    }),
  );
  appendEventsToLog(state, events);

  return createFloorState({
    seed: state.seed,
    version: state.version,
    floor: state.floor + 1,
    turn: state.turn,
    maxTurns: state.meta.maxTurns,
    objective: state.meta.objective,
    playerHp: state.player.hp,
    inventory: state.player.inventory,
    log: state.log,
  });
};

export const step = (state: GameState, action: PlayerAction): StepResult => {
  const availableActions = getAvailableActions(state);
  const matchedAction = findMatchingAction(availableActions, action);

  if (!matchedAction) {
    return {
      state: cloneState(state),
      events: [],
      valid: false,
      error: `Action is not available: ${action.id}`,
    };
  }

  let nextState = cloneState(state);
  const events: GameEvent[] = [];
  nextState.turn += 1;

  if (matchedAction.type === 'move') {
    const movement = directionFromAction(matchedAction);
    nextState.player.x += movement.x;
    nextState.player.y += movement.y;
    events.push(
      event(nextState.turn, 'move', `You move to ${nextState.player.x},${nextState.player.y}.`, {
        x: nextState.player.x,
        y: nextState.player.y,
      }),
    );
  } else if (matchedAction.type === 'attack') {
    const targetId = matchedAction.payload?.targetId;
    const enemyIndex = nextState.enemies.findIndex((enemy) => enemy.id === targetId);
    const enemy = nextState.enemies[enemyIndex];
    if (enemy) {
      enemy.hp = Math.max(0, enemy.hp - PLAYER_ATTACK);
      events.push(
        event(nextState.turn, 'attack', `You hit ${enemy.label} for ${PLAYER_ATTACK}.`, {
          targetId: enemy.id,
          damage: PLAYER_ATTACK,
        }),
      );
      if (enemy.hp <= 0) {
        nextState.enemies.splice(enemyIndex, 1);
        events.push(
          event(nextState.turn, 'enemy_defeated', `${enemy.label} dissolves.`, {
            targetId: enemy.id,
          }),
        );
      }
    }
  } else if (matchedAction.type === 'pickup') {
    const itemId = matchedAction.payload?.itemId;
    const itemIndex = nextState.items.findIndex((item) => item.id === itemId);
    const item = nextState.items[itemIndex];
    if (item) {
      nextState.items.splice(itemIndex, 1);
      nextState.player.inventory = [...nextState.player.inventory, item.type];
      events.push(
        event(nextState.turn, 'pickup', `You pick up ${item.label}.`, {
          itemId: item.id,
          itemType: item.type,
        }),
      );
    }
  } else if (matchedAction.type === 'use_item') {
    const potion = getItemDefinition(POTION_ITEM_ID);
    const before = nextState.player.hp;
    nextState.player.hp = Math.min(
      nextState.player.maxHp,
      nextState.player.hp + potion.healAmount,
    );
    nextState.player.inventory = removeFirstInventoryItem(
      nextState.player.inventory,
      POTION_ITEM_ID,
    );
    events.push(
      event(nextState.turn, 'use_item', `You use ${potion.displayName}.`, {
        itemType: POTION_ITEM_ID,
        healed: nextState.player.hp - before,
      }),
    );
  } else if (matchedAction.type === 'descend') {
    nextState = descend(nextState, events);
    return {
      state: nextState,
      events,
      valid: true,
    };
  } else if (matchedAction.type === 'inspect') {
    events.push(
      event(nextState.turn, 'inspect', 'You inspect the dungeon state.', {
        floor: nextState.floor,
        hp: nextState.player.hp,
      }),
    );
  } else {
    events.push(event(nextState.turn, 'wait', 'You wait for one turn.'));
  }

  if (nextState.terminalStatus === 'ACTIVE') {
    moveSlimes(nextState, events);
  }

  finalizeTerminalState(nextState, events);
  appendEventsToLog(nextState, events);

  return {
    state: nextState,
    events,
    valid: true,
  };
};

const inventoryLabel = (inventory: string[]): string => {
  if (inventory.length === 0) {
    return '(empty)';
  }
  return inventory
    .map((itemType) => getItemDefinition(itemType).displayName)
    .join(', ');
};

export const render = (state: GameState): string => {
  const renderedRows = state.map.tiles.map((row, y) =>
    row
      .map((tile, x) => {
        const position = { x, y };
        if (samePosition(state.player, position)) {
          return '@';
        }
        const enemy = enemyAt(state, position);
        if (enemy) {
          return enemy.glyph;
        }
        const item = itemsAt(state, position)[0];
        if (item) {
          return item.glyph;
        }
        return tile.glyph;
      })
      .join(''),
  );

  return [
    `Seven Floors to Dawn ${state.version}`,
    `Seed: ${state.seed} | Floor: ${state.floor}/${state.meta.totalFloors} | Turn: ${state.turn}/${state.meta.maxTurns}`,
    `Status: ${state.terminalStatus} | HP: ${state.player.hp}/${state.player.maxHp}`,
    `Objective: ${state.meta.objective}`,
    ...renderedRows,
    `Inventory: ${inventoryLabel(state.player.inventory)}`,
    'Legend: @ You, s Slime, ! Potion, > Stairs, # Wall, . Floor',
    'Log:',
    ...state.log.slice(-3).map((entry) => `- ${entry}`),
  ].join('\n');
};

export const gameEngine: GameEngine = {
  start,
  getAvailableActions,
  step,
  render,
  isTerminal,
};
