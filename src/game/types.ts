export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export interface JsonObject {
  [key: string]: JsonValue;
}

export type JsonArray = JsonValue[];

export const TERMINAL_STATUSES = ['ACTIVE', 'WIN', 'LOSS', 'ABORTED'] as const;

export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

export type PlayerActionType =
  | 'move'
  | 'attack'
  | 'wait'
  | 'use_item'
  | 'pickup'
  | 'descend'
  | 'talk'
  | 'inspect';

export interface Position {
  x: number;
  y: number;
}

export type TileType = 'floor' | 'wall' | 'stairs';

export interface Tile {
  type: TileType;
  glyph: string;
  walkable: boolean;
  description: string;
}

export interface PlayerState extends Position {
  hp: number;
  maxHp: number;
  hunger?: number;
  inventory: string[];
}

export interface GameMap {
  width: number;
  height: number;
  tiles: Tile[][];
}

export type EnemyBehavior = 'chase' | 'bat' | 'shell' | 'thief' | 'ghost';

export interface EnemyInstance extends Position {
  id: string;
  type: string;
  label: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  behavior: EnemyBehavior;
  glyph: string;
}

export interface ItemInstance extends Position {
  id: string;
  type: string;
  label: string;
  glyph: string;
}

export interface TacticalEffects {
  /** Enemies stop pursuit while `turn < enemyTrackingDisabledUntilTurn`. */
  enemyTrackingDisabledUntilTurn: number;
}

export interface NpcInstance extends Position {
  id: string;
  npcId: string;
  label: string;
  glyph: string;
}

export interface DialogueState {
  active: boolean;
  npcId: string;
  npcInstanceId: string;
  treeId: string;
  nodeId: string;
}

export interface NarrativeState {
  seenFloorEvents: string[];
}

export interface GameState {
  version: string;
  seed: string;
  turn: number;
  floor: number;
  terminalStatus: TerminalStatus;
  player: PlayerState;
  map: GameMap;
  enemies: EnemyInstance[];
  items: ItemInstance[];
  log: string[];
  npcs: NpcInstance[];
  dialogue?: DialogueState;
  narrative: NarrativeState;
  tactical?: TacticalEffects;
  meta: {
    maxTurns: number;
    objective: string;
    totalFloors: number;
  };
}

export interface PlayerAction {
  id: string;
  type: PlayerActionType;
  label: string;
  payload?: JsonObject;
}

export interface GameEvent {
  id: string;
  type: string;
  message: string;
  turn: number;
  payload?: JsonObject;
}

export interface StepResult {
  state: GameState;
  events: GameEvent[];
  valid: boolean;
  error?: string;
}

export interface GameConfig {
  version?: string;
  width?: number;
  height?: number;
  maxTurns?: number;
  objective?: string;
  /** Caps playable floors for bounded demo profiles (defaults to full content). */
  totalFloors?: number;
  /** Restricts spawned enemies to this allow-list when set. */
  allowedEnemyIds?: readonly string[];
  /** Restricts spawned items to this allow-list when set. */
  allowedItemIds?: readonly string[];
  /** Adds deterministic starting inventory for bounded demo profiles. */
  initialInventory?: readonly string[];
  /** Adds deterministic opening log lines for bounded demo profiles. */
  openingLog?: readonly string[];
}
