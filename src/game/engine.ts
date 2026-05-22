import type {
  GameConfig,
  GameEvent,
  GameMap,
  GameState,
  PlayerAction,
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

const DEFAULT_VERSION = '0.2.0-contract';
const DEFAULT_WIDTH = 3;
const DEFAULT_HEIGHT = 3;
const DEFAULT_MAX_TURNS = 20;
const DEFAULT_OBJECTIVE = 'Verify the stable game protocol.';

const FLOOR_TILE: Tile = {
  type: 'floor',
  glyph: '.',
  walkable: true,
  description: 'plain stone floor',
};

const STAIRS_TILE: Tile = {
  type: 'stairs',
  glyph: '>',
  walkable: true,
  description: 'future dungeon stairs',
};

const WAIT_ACTION: PlayerAction = {
  id: 'wait',
  type: 'wait',
  label: 'Wait',
  payload: { turns: 1 },
};

const INSPECT_ACTION: PlayerAction = {
  id: 'inspect_status',
  type: 'inspect',
  label: 'Inspect status',
  payload: { subject: 'status' },
};

const cloneState = (state: GameState): GameState =>
  JSON.parse(JSON.stringify(state)) as GameState;

const normalizePositiveInteger = (
  value: number | undefined,
  fallback: number,
): number => {
  if (Number.isInteger(value) && value !== undefined && value > 0) {
    return value;
  }

  return fallback;
};

const buildMap = (width: number, height: number): GameMap => {
  const tiles = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      x === width - 1 && y === height - 1 ? { ...STAIRS_TILE } : { ...FLOOR_TILE },
    ),
  );

  return {
    width,
    height,
    tiles,
  };
};

export const start = (seed: string, config: GameConfig = {}): GameState => {
  const width = normalizePositiveInteger(config.width, DEFAULT_WIDTH);
  const height = normalizePositiveInteger(config.height, DEFAULT_HEIGHT);

  return {
    version: config.version ?? DEFAULT_VERSION,
    seed,
    turn: 0,
    floor: 1,
    terminalStatus: 'ACTIVE',
    player: {
      x: 0,
      y: 0,
      hp: 10,
      maxHp: 10,
      inventory: [],
    },
    map: buildMap(width, height),
    enemies: [],
    items: [],
    log: ['The contract test chamber is ready.'],
    meta: {
      maxTurns: normalizePositiveInteger(config.maxTurns, DEFAULT_MAX_TURNS),
      objective: config.objective ?? DEFAULT_OBJECTIVE,
    },
  };
};

export const isTerminal = (state: GameState): boolean =>
  state.terminalStatus !== 'ACTIVE';

export const getAvailableActions = (state: GameState): PlayerAction[] => {
  if (isTerminal(state)) {
    return [];
  }

  return [
    { ...WAIT_ACTION, payload: { ...WAIT_ACTION.payload } },
    { ...INSPECT_ACTION, payload: { ...INSPECT_ACTION.payload } },
  ];
};

const hasMatchingAction = (
  availableActions: PlayerAction[],
  action: PlayerAction,
): boolean =>
  availableActions.some(
    (availableAction) =>
      availableAction.id === action.id && availableAction.type === action.type,
  );

const eventForAction = (
  action: PlayerAction,
  nextTurn: number,
  terminalStatus: GameState['terminalStatus'],
): GameEvent => {
  if (terminalStatus === 'ABORTED') {
    return {
      id: `turn-${nextTurn}-aborted`,
      type: 'system',
      message: 'The run aborted after reaching the maximum turn limit.',
      turn: nextTurn,
      payload: { terminalStatus },
    };
  }

  if (action.type === 'inspect') {
    return {
      id: `turn-${nextTurn}-inspect`,
      type: 'inspect',
      message: 'You inspect the stable protocol state.',
      turn: nextTurn,
      payload: { actionId: action.id },
    };
  }

  return {
    id: `turn-${nextTurn}-wait`,
    type: 'wait',
    message: 'You wait for one turn.',
    turn: nextTurn,
    payload: { actionId: action.id },
  };
};

export const step = (state: GameState, action: PlayerAction): StepResult => {
  const availableActions = getAvailableActions(state);

  if (!hasMatchingAction(availableActions, action)) {
    return {
      state: cloneState(state),
      events: [],
      valid: false,
      error: `Action is not available: ${action.id}`,
    };
  }

  const nextState = cloneState(state);
  nextState.turn += 1;

  if (nextState.turn >= nextState.meta.maxTurns) {
    nextState.terminalStatus = 'ABORTED';
  }

  const event = eventForAction(action, nextState.turn, nextState.terminalStatus);
  nextState.log = [...nextState.log, event.message];

  return {
    state: nextState,
    events: [event],
    valid: true,
  };
};

export const render = (state: GameState): string => {
  const renderedRows = state.map.tiles.map((row, y) =>
    row
      .map((tile, x) =>
        state.player.x === x && state.player.y === y ? '@' : tile.glyph,
      )
      .join(''),
  );

  return [
    `Dungeon Forge ${state.version}`,
    `Seed: ${state.seed} | Floor: ${state.floor} | Turn: ${state.turn}`,
    `Status: ${state.terminalStatus} | HP: ${state.player.hp}/${state.player.maxHp}`,
    `Objective: ${state.meta.objective}`,
    ...renderedRows,
    `Log: ${state.log.at(-1) ?? 'No events yet.'}`,
  ].join('\n');
};

export const gameEngine: GameEngine = {
  start,
  getAvailableActions,
  step,
  render,
  isTerminal,
};
