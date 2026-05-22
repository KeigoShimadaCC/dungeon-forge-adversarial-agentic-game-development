import { calcPlayerDamageToEnemy } from './combat.js';
import {
  getItemDefinition,
  loadGameContent,
  type EnemyDefinition,
  type FloorRuleDefinition,
} from './content.js';
import {
  applyItemEffect,
  buildInventoryUseItemActions,
  defaultTacticalEffects,
} from './item-effects.js';
import {
  chooseEntityPositions,
  generateFloorLayout,
  getTile as getMapTile,
  isWalkableTile,
} from './map.js';
import {
  applyFloorEnterEvents,
  applyTalkAction,
  buildDialogueActions,
  buildNpcTalkActions,
  getDialogueInvalidReason,
  getEndingText,
  getNpcInvalidReason,
  getOpeningText,
  isInDialogue,
  placeNpcsForFloor,
  defaultNarrativeState,
} from './dialogue.js';
import { runEnemyTurns } from './enemy-ai.js';
import { render } from './render.js';
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
const PLAYER_MAX_HP = 20;
const PLAYER_ATTACK = 4;
const RECENT_LOG_LIMIT = 8;

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

const getTile = (map: GameMap, position: Position): Tile | undefined =>
  getMapTile(map, position);

const isWalkable = (map: GameMap, position: Position): boolean =>
  isWalkableTile(map, position);

const placeEnemies = (
  seed: string,
  floor: number,
  rule: FloorRuleDefinition,
  layout: ReturnType<typeof generateFloorLayout>,
  occupied: Set<string>,
): GameState['enemies'] => {
  if (rule.enemyIds.length === 0 || rule.enemySpawnCount === 0) {
    return [];
  }

  const positions = chooseEntityPositions({
    seed,
    floor,
    layout,
    count: rule.enemySpawnCount,
    occupied,
    slot: 'enemy',
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
      defense: definition.defense,
      behavior: definition.behavior,
      glyph: definition.glyph,
      ...position,
    };
  });
};

const placeItems = (
  seed: string,
  floor: number,
  rule: FloorRuleDefinition,
  layout: ReturnType<typeof generateFloorLayout>,
  occupied: Set<string>,
): ItemInstance[] => {
  if (rule.itemIds.length === 0 || rule.itemSpawnCount === 0) {
    return [];
  }

  const positions = chooseEntityPositions({
    seed,
    floor,
    layout,
    count: rule.itemSpawnCount,
    occupied,
    slot: 'item',
  });

  return positions.map((position, index) => {
    const definition = getItemDefinition(rule.itemIds[index % rule.itemIds.length]);
    occupied.add(positionKey(position));

    return {
      id: `${definition.id}-${floor}-${index + 1}`,
      type: definition.id,
      label: definition.displayName,
      glyph: definition.glyph,
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
  narrative?: GameState['narrative'];
  floorEventsOut?: GameEvent[];
}): GameState => {
  const rule = getFloorRule(params.floor);
  const layout = generateFloorLayout({
    seed: params.seed,
    floor: params.floor,
    rule,
  });
  const occupied = new Set<string>([
    positionKey(layout.playerSpawn),
    positionKey(layout.stairs),
  ]);
  const enemies = placeEnemies(params.seed, params.floor, rule, layout, occupied);
  const items = placeItems(params.seed, params.floor, rule, layout, occupied);
  const npcs = placeNpcsForFloor({
    seed: params.seed,
    floor: params.floor,
    layout,
    occupied,
  });

  const state: GameState = {
    version: params.version,
    seed: params.seed,
    turn: params.turn,
    floor: params.floor,
    terminalStatus: 'ACTIVE',
    player: {
      ...layout.playerSpawn,
      hp: params.playerHp ?? PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      inventory: [...(params.inventory ?? [])],
    },
    map: layout.map,
    enemies,
    items,
    npcs,
    log: [...params.log],
    narrative: params.narrative ?? defaultNarrativeState(),
    tactical: defaultTacticalEffects(),
    meta: {
      maxTurns: params.maxTurns,
      objective: params.objective,
      totalFloors: floorRules.length,
    },
  };

  const floorEvents = applyFloorEnterEvents(state, event);
  if (floorEvents.length > 0) {
    params.floorEventsOut?.push(...floorEvents);
    appendEventsToLog(state, floorEvents);
  }

  return state;
};

export const start = (seed: string, config: GameConfig = {}): GameState =>
  createFloorState({
    seed,
    version: config.version ?? DEFAULT_VERSION,
    floor: 1,
    turn: 0,
    maxTurns: normalizePositiveInteger(config.maxTurns, defaultMaxTurns()),
    objective: config.objective ?? DEFAULT_OBJECTIVE,
    log: [getOpeningText()],
  });

export const isTerminal = (state: GameState): boolean =>
  state.terminalStatus !== 'ACTIVE';

const enemyAt = (state: GameState, position: Position): GameState['enemies'][number] | undefined =>
  state.enemies.find((enemy) => samePosition(enemy, position));

const npcAtPosition = (
  state: GameState,
  position: Position,
): GameState['npcs'][number] | undefined =>
  state.npcs.find((npc) => samePosition(npc, position));

const itemsAt = (state: GameState, position: Position): ItemInstance[] =>
  state.items.filter((item) => samePosition(item, position));

const canMoveTo = (state: GameState, position: Position): boolean =>
  isWalkable(state.map, position) &&
  enemyAt(state, position) === undefined &&
  npcAtPosition(state, position) === undefined;

export const getAvailableActions = (state: GameState): PlayerAction[] => {
  if (isTerminal(state)) {
    return [];
  }

  if (isInDialogue(state)) {
    return buildDialogueActions(state);
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

  actions.push(...buildInventoryUseItemActions(state));

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

  actions.push(...buildNpcTalkActions(state));

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

const isKnownItemType = (id: string): boolean =>
  content.items.items.some((candidate) => candidate.id === id);

const getInvalidStateReason = (state: GameState): string | undefined => {
  if (state.floor < 1 || state.floor > state.meta.totalFloors) {
    return `floor ${state.floor} is outside 1-${state.meta.totalFloors}`;
  }

  if (
    state.map.width <= 0 ||
    state.map.height <= 0 ||
    state.map.tiles.length !== state.map.height ||
    state.map.tiles.some((row) => row.length !== state.map.width)
  ) {
    return 'map dimensions do not match tile data';
  }

  if (!isWalkable(state.map, state.player)) {
    return `player is not on a walkable tile at ${positionKey(state.player)}`;
  }

  const occupied = new Set<string>([positionKey(state.player)]);
  for (const enemy of state.enemies) {
    const key = positionKey(enemy);
    if (enemy.hp <= 0 || enemy.maxHp <= 0) {
      return `enemy ${enemy.id} has invalid HP`;
    }
    if (enemy.defense < 0) {
      return `enemy ${enemy.id} has invalid defense`;
    }
    if (!enemy.behavior) {
      return `enemy ${enemy.id} is missing behavior`;
    }
    const tile = getTile(state.map, enemy);
    const onValidTile =
      tile?.walkable === true ||
      (tile?.type === 'wall' && enemy.behavior === 'ghost');
    if (!onValidTile) {
      return `enemy ${enemy.id} is not on a valid tile`;
    }
    if (occupied.has(key)) {
      return `enemy ${enemy.id} overlaps another actor`;
    }
    occupied.add(key);
  }

  for (const item of state.items) {
    if (!isKnownItemType(item.type)) {
      return `item ${item.id} references unknown type ${item.type}`;
    }
    if (!isWalkable(state.map, item)) {
      return `item ${item.id} is not on a walkable tile`;
    }
  }

  for (const itemType of state.player.inventory) {
    if (!isKnownItemType(itemType)) {
      return `inventory references unknown item type ${itemType}`;
    }
  }

  const dialogueReason = getDialogueInvalidReason(state);
  if (dialogueReason) {
    return dialogueReason;
  }

  const npcReason = getNpcInvalidReason(state);
  if (npcReason) {
    return npcReason;
  }

  return undefined;
};

const abortInvalidState = (state: GameState, reason: string): StepResult => {
  const nextState = cloneState(state);
  const nextTurn = nextState.turn + 1;
  const invalidStateEvent = event(
    nextTurn,
    'invalid_state',
    `The run aborted after detecting invalid state: ${reason}.`,
    { terminalStatus: 'ABORTED', reason },
  );

  nextState.turn = nextTurn;
  nextState.terminalStatus = 'ABORTED';
  appendEventsToLog(nextState, [invalidStateEvent]);

  return {
    state: nextState,
    events: [invalidStateEvent],
    valid: true,
  };
};

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
      event(state.turn, 'win', getEndingText(), {
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
    narrative: state.narrative,
    floorEventsOut: events,
  });
};

export const step = (state: GameState, action: PlayerAction): StepResult => {
  const invalidStateReason = getInvalidStateReason(state);
  if (!isTerminal(state) && invalidStateReason) {
    return abortInvalidState(state, invalidStateReason);
  }

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
      const damage = calcPlayerDamageToEnemy(PLAYER_ATTACK, enemy.defense);
      enemy.hp = Math.max(0, enemy.hp - damage);
      events.push(
        event(nextState.turn, 'attack', `You hit ${enemy.label} for ${damage}.`, {
          targetId: enemy.id,
          enemyType: enemy.type,
          damage,
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
      const pickupEvent = event(nextState.turn, 'pickup', `You pick up ${item.label}.`, {
        itemId: item.id,
        itemType: item.type,
      });
      events.push(pickupEvent);
    }
  } else if (matchedAction.type === 'use_item') {
    const itemType = matchedAction.payload?.itemType;
    if (typeof itemType !== 'string') {
      return {
        state: cloneState(state),
        events: [],
        valid: false,
        error: 'use_item action is missing itemType',
      };
    }
    const definition = getItemDefinition(itemType);
    events.push(
      ...applyItemEffect({
        state: nextState,
        definition,
        matchedAction,
        event,
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
  } else if (matchedAction.type === 'talk') {
    events.push(...applyTalkAction(nextState, matchedAction, event));
  } else {
    events.push(event(nextState.turn, 'wait', 'You wait for one turn.'));
  }

  if (nextState.terminalStatus === 'ACTIVE' && !isInDialogue(nextState)) {
    runEnemyTurns(nextState, events);
  }

  finalizeTerminalState(nextState, events);
  appendEventsToLog(nextState, events);

  return {
    state: nextState,
    events,
    valid: true,
  };
};

export { render } from './render.js';

export const gameEngine: GameEngine = {
  start,
  getAvailableActions,
  step,
  render,
  isTerminal,
};
