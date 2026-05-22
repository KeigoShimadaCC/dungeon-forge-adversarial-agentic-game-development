import enemiesJson from '../../content/enemies.json' with { type: 'json' };
import eventsJson from '../../content/events.json' with { type: 'json' };
import floorRulesJson from '../../content/floor-rules.json' with { type: 'json' };
import itemsJson from '../../content/items.json' with { type: 'json' };
import trapsJson from '../../content/traps.json' with { type: 'json' };

export const CONTENT_SCHEMA_VERSION = '02C' as const;
export const TRAPS_SCHEMA_VERSION = '16A' as const;
export const EVENTS_SCHEMA_VERSION = '10A' as const;
export const SHRINE_KEEPER_NPC_ID = 'shrine_keeper' as const;

export const POTION_ITEM_ID = 'potion' as const;
export const SMOKE_BOMB_ITEM_ID = 'smoke_bomb' as const;
export const SWAP_SCROLL_ITEM_ID = 'swap_scroll' as const;
export const FIRE_SEED_ITEM_ID = 'fire_seed' as const;
export const WARP_FEATHER_ITEM_ID = 'warp_feather' as const;

export const ITEM_EFFECTS = [
  'heal',
  'blind_enemies',
  'swap_position',
  'area_damage',
  'warp',
] as const;
export type ItemEffectId = (typeof ITEM_EFFECTS)[number];

export const PHASE_09A_ITEM_IDS = [
  SMOKE_BOMB_ITEM_ID,
  SWAP_SCROLL_ITEM_ID,
  FIRE_SEED_ITEM_ID,
  WARP_FEATHER_ITEM_ID,
] as const;
export const SLIME_ENEMY_ID = 'slime' as const;
export const BAT_ENEMY_ID = 'bat' as const;
export const SHELL_ENEMY_ID = 'shell' as const;
export const THIEF_ENEMY_ID = 'thief' as const;
export const GHOST_ENEMY_ID = 'ghost' as const;
export const SPIKE_TRAP_ID = 'spike' as const;
export const NEEDLE_TRAP_ID = 'needle' as const;
export const PHASE_16A_TRAP_IDS = [SPIKE_TRAP_ID, NEEDLE_TRAP_ID] as const;

export const ENEMY_BEHAVIORS = ['chase', 'bat', 'shell', 'thief', 'ghost'] as const;
export type EnemyBehaviorId = (typeof ENEMY_BEHAVIORS)[number];

export const PHASE_09B_ENEMY_IDS = [
  SLIME_ENEMY_ID,
  BAT_ENEMY_ID,
  SHELL_ENEMY_ID,
  THIEF_ENEMY_ID,
  GHOST_ENEMY_ID,
] as const;

export interface ItemDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  kind: string;
  effect: ItemEffectId;
  validUse: string;
  stackable: boolean;
  glyph: string;
  healAmount?: number;
  duration?: number;
  damage?: number;
  damageRange?: number;
  swapRange?: number;
  warpRange?: number;
}

export interface EnemyDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  glyph: string;
  behavior: EnemyBehaviorId;
  hp: number;
  attack: number;
  defense: number;
  xp: number;
  goldReward: number;
  itemDropIds: string[];
}

export interface TrapDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  glyph: string;
  damage: number;
}

export interface TrapsContentBundle {
  schemaVersion: string;
  traps: TrapDefinition[];
}

export interface FloorRuleDefinition {
  id: string;
  floor: number;
  width: number;
  height: number;
  enemyIds: string[];
  itemIds: string[];
  enemySpawnCount: number;
  itemSpawnCount: number;
  trapIds?: string[];
  trapSpawnCount?: number;
  maxTurns: number;
}

export interface ItemsContentBundle {
  schemaVersion: string;
  items: ItemDefinition[];
}

export interface EnemiesContentBundle {
  schemaVersion: string;
  enemies: EnemyDefinition[];
}

export interface FloorRulesContentBundle {
  schemaVersion: string;
  floors: FloorRuleDefinition[];
}

export interface NarrativeTextDefinition {
  id: string;
  text: string;
}

export interface FloorEventDefinition {
  id: string;
  floor: number;
  trigger: 'on_enter';
  text: string;
}

export interface NpcDefinition {
  id: string;
  displayName: string;
  glyph: string;
  floor: number;
  dialogueTreeId: string;
}

export interface DialogueChoiceDefinition {
  id: string;
  label: string;
  nextNodeId?: string;
  exit?: boolean;
}

export interface DialogueNodeDefinition {
  id: string;
  text: string;
  choices: DialogueChoiceDefinition[];
}

export interface DialogueTreeDefinition {
  id: string;
  startNodeId: string;
  nodes: DialogueNodeDefinition[];
}

export interface EventsContentBundle {
  schemaVersion: string;
  opening: NarrativeTextDefinition;
  ending: NarrativeTextDefinition;
  floorEvents: FloorEventDefinition[];
  npcs: NpcDefinition[];
  dialogueTrees: DialogueTreeDefinition[];
}

export interface GameContent {
  items: ItemsContentBundle;
  enemies: EnemiesContentBundle;
  floors: FloorRulesContentBundle;
  traps: TrapsContentBundle;
  events: EventsContentBundle;
}

export class ContentValidationError extends Error {
  readonly name = 'ContentValidationError';

  constructor(message: string) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(path: string, message: string): never {
  throw new ContentValidationError(`${path}: ${message}`);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(path, 'expected an object');
  }
  return value;
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    fail(path, `${key} must be a non-empty string`);
  }
  return value;
}

function requireNumber(
  record: Record<string, unknown>,
  key: string,
  path: string,
  options?: { integer?: boolean; min?: number },
): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(path, `${key} must be a finite number`);
  }
  if (options?.integer && !Number.isInteger(value)) {
    fail(path, `${key} must be an integer`);
  }
  if (options?.min !== undefined && value < options.min) {
    fail(path, `${key} must be >= ${options.min}`);
  }
  return value;
}

function requireBoolean(
  record: Record<string, unknown>,
  key: string,
  path: string,
): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') {
    fail(path, `${key} must be a boolean`);
  }
  return value;
}

function requireStringArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    fail(path, `${key} must be an array`);
  }
  const result: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (typeof entry !== 'string' || entry.trim() === '') {
      fail(`${path}.${key}[${index}]`, 'must be a non-empty string');
    }
    result.push(entry);
  }
  return result;
}

function requireArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    fail(path, `${key} must be an array`);
  }
  return value;
}

function assertUniqueIds(ids: string[], path: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      fail(path, `duplicate id "${id}"`);
    }
    seen.add(id);
  }
}

function optionalNumber(
  record: Record<string, unknown>,
  key: string,
  path: string,
  options?: { integer?: boolean; min?: number },
): number | undefined {
  if (!(key in record)) {
    return undefined;
  }
  return requireNumber(record, key, path, options);
}

function parseItemDefinition(value: unknown, path: string): ItemDefinition {
  const record = requireRecord(value, path);
  const id = requireString(record, 'id', path);
  const name = requireString(record, 'name', path);
  const displayName = requireString(record, 'displayName', path);
  const description = requireString(record, 'description', path);
  const kind = requireString(record, 'kind', path);
  const effect = requireString(record, 'effect', path);
  if (!ITEM_EFFECTS.includes(effect as ItemEffectId)) {
    fail(path, `effect must be one of: ${ITEM_EFFECTS.join(', ')}`);
  }
  const validUse = requireString(record, 'validUse', path);
  const stackable = requireBoolean(record, 'stackable', path);
  const glyph = requireString(record, 'glyph', path);
  if (glyph.length !== 1) {
    fail(path, 'glyph must be a single character');
  }
  const item: ItemDefinition = {
    id,
    name,
    displayName,
    description,
    kind,
    effect: effect as ItemEffectId,
    validUse,
    stackable,
    glyph,
    healAmount: optionalNumber(record, 'healAmount', path, {
      integer: true,
      min: 1,
    }),
    duration: optionalNumber(record, 'duration', path, {
      integer: true,
      min: 1,
    }),
    damage: optionalNumber(record, 'damage', path, {
      integer: true,
      min: 1,
    }),
    damageRange: optionalNumber(record, 'damageRange', path, {
      integer: true,
      min: 1,
    }),
    swapRange: optionalNumber(record, 'swapRange', path, {
      integer: true,
      min: 1,
    }),
    warpRange: optionalNumber(record, 'warpRange', path, {
      integer: true,
      min: 1,
    }),
  };

  switch (item.effect) {
    case 'heal':
      if (item.healAmount === undefined) {
        fail(path, 'healAmount is required for heal items');
      }
      break;
    case 'blind_enemies':
      if (item.duration === undefined) {
        fail(path, 'duration is required for blind_enemies items');
      }
      break;
    case 'area_damage':
      if (item.damage === undefined || item.damageRange === undefined) {
        fail(path, 'damage and damageRange are required for area_damage items');
      }
      break;
    case 'swap_position':
      if (item.swapRange === undefined) {
        fail(path, 'swapRange is required for swap_position items');
      }
      break;
    case 'warp':
      if (item.warpRange === undefined) {
        fail(path, 'warpRange is required for warp items');
      }
      break;
    default:
      break;
  }

  return item;
}

export function getItemDefinition(id: string): ItemDefinition {
  const item = loadGameContent().items.items.find((candidate) => candidate.id === id);
  if (!item) {
    throw new Error(`Missing item content: ${id}`);
  }
  return item;
}

function parseEnemyDefinition(value: unknown, path: string): EnemyDefinition {
  const record = requireRecord(value, path);
  const glyph = requireString(record, 'glyph', path);
  if (glyph.length !== 1) {
    fail(path, 'glyph must be a single character');
  }
  const behavior = requireString(record, 'behavior', path);
  if (!ENEMY_BEHAVIORS.includes(behavior as EnemyBehaviorId)) {
    fail(
      path,
      `behavior must be one of: ${ENEMY_BEHAVIORS.join(', ')}`,
    );
  }
  return {
    id: requireString(record, 'id', path),
    name: requireString(record, 'name', path),
    displayName: requireString(record, 'displayName', path),
    description: requireString(record, 'description', path),
    glyph,
    behavior: behavior as EnemyBehaviorId,
    hp: requireNumber(record, 'hp', path, { integer: true, min: 1 }),
    attack: requireNumber(record, 'attack', path, { integer: true, min: 0 }),
    defense: requireNumber(record, 'defense', path, { integer: true, min: 0 }),
    xp: requireNumber(record, 'xp', path, { integer: true, min: 0 }),
    goldReward: requireNumber(record, 'goldReward', path, {
      integer: true,
      min: 0,
    }),
    itemDropIds: requireStringArray(record, 'itemDropIds', path),
  };
}

function parseTrapDefinition(value: unknown, path: string): TrapDefinition {
  const record = requireRecord(value, path);
  const glyph = requireString(record, 'glyph', path);
  if (glyph.length !== 1) {
    fail(path, 'glyph must be a single character');
  }
  return {
    id: requireString(record, 'id', path),
    name: requireString(record, 'name', path),
    displayName: requireString(record, 'displayName', path),
    description: requireString(record, 'description', path),
    glyph,
    damage: requireNumber(record, 'damage', path, { integer: true, min: 1 }),
  };
}

function parseFloorRuleDefinition(
  value: unknown,
  path: string,
): FloorRuleDefinition {
  const record = requireRecord(value, path);
  const trapSpawnCount = optionalNumber(record, 'trapSpawnCount', path, {
    integer: true,
    min: 0,
  });
  const trapIds =
    'trapIds' in record ? requireStringArray(record, 'trapIds', path) : undefined;
  if ((trapSpawnCount ?? 0) > 0 && (!trapIds || trapIds.length === 0)) {
    fail(path, 'trapIds is required when trapSpawnCount is greater than zero');
  }
  if (trapIds && trapIds.length > 0 && (trapSpawnCount ?? 0) === 0) {
    fail(path, 'trapSpawnCount must be greater than zero when trapIds are set');
  }
  return {
    id: requireString(record, 'id', path),
    floor: requireNumber(record, 'floor', path, { integer: true, min: 1 }),
    width: requireNumber(record, 'width', path, { integer: true, min: 1 }),
    height: requireNumber(record, 'height', path, { integer: true, min: 1 }),
    enemyIds: requireStringArray(record, 'enemyIds', path),
    itemIds: requireStringArray(record, 'itemIds', path),
    enemySpawnCount: requireNumber(record, 'enemySpawnCount', path, {
      integer: true,
      min: 0,
    }),
    itemSpawnCount: requireNumber(record, 'itemSpawnCount', path, {
      integer: true,
      min: 0,
    }),
    trapIds,
    trapSpawnCount,
    maxTurns: requireNumber(record, 'maxTurns', path, {
      integer: true,
      min: 1,
    }),
  };
}

export function validateTrapsBundle(raw: unknown): TrapsContentBundle {
  const root = requireRecord(raw, 'traps.json');
  const schemaVersion = requireString(root, 'schemaVersion', 'traps.json');
  if (schemaVersion !== TRAPS_SCHEMA_VERSION) {
    fail('traps.json', `schemaVersion must be ${TRAPS_SCHEMA_VERSION}`);
  }
  const trapsRaw = requireArray(root, 'traps', 'traps.json');
  const traps = trapsRaw.map((entry, index) =>
    parseTrapDefinition(entry, `traps.json.traps[${index}]`),
  );
  assertUniqueIds(
    traps.map((trap) => trap.id),
    'traps.json.traps',
  );
  return { schemaVersion, traps };
}

export function getTrapDefinition(id: string): TrapDefinition {
  const trap = loadGameContent().traps.traps.find((candidate) => candidate.id === id);
  if (!trap) {
    throw new Error(`Missing trap content: ${id}`);
  }
  return trap;
}

export function validateItemsBundle(raw: unknown): ItemsContentBundle {
  const root = requireRecord(raw, 'items.json');
  const schemaVersion = requireString(root, 'schemaVersion', 'items.json');
  const itemsRaw = requireArray(root, 'items', 'items.json');
  const items = itemsRaw.map((entry, index) =>
    parseItemDefinition(entry, `items.json.items[${index}]`),
  );
  assertUniqueIds(
    items.map((item) => item.id),
    'items.json.items',
  );
  return { schemaVersion, items };
}

export function validateEnemiesBundle(raw: unknown): EnemiesContentBundle {
  const root = requireRecord(raw, 'enemies.json');
  const schemaVersion = requireString(root, 'schemaVersion', 'enemies.json');
  const enemiesRaw = requireArray(root, 'enemies', 'enemies.json');
  const enemies = enemiesRaw.map((entry, index) =>
    parseEnemyDefinition(entry, `enemies.json.enemies[${index}]`),
  );
  assertUniqueIds(
    enemies.map((enemy) => enemy.id),
    'enemies.json.enemies',
  );
  return { schemaVersion, enemies };
}

function parseNarrativeText(value: unknown, path: string): NarrativeTextDefinition {
  const record = requireRecord(value, path);
  return {
    id: requireString(record, 'id', path),
    text: requireString(record, 'text', path),
  };
}

function parseDialogueChoice(
  value: unknown,
  path: string,
): DialogueChoiceDefinition {
  const record = requireRecord(value, path);
  const exit = 'exit' in record ? requireBoolean(record, 'exit', path) : false;
  const nextNodeId =
    'nextNodeId' in record ? requireString(record, 'nextNodeId', path) : undefined;
  if (!exit && !nextNodeId) {
    fail(path, 'choice must set exit: true or a nextNodeId');
  }
  if (exit && nextNodeId) {
    fail(path, 'choice cannot set both exit and nextNodeId');
  }
  return {
    id: requireString(record, 'id', path),
    label: requireString(record, 'label', path),
    nextNodeId,
    exit: exit || undefined,
  };
}

function parseDialogueNode(value: unknown, path: string): DialogueNodeDefinition {
  const record = requireRecord(value, path);
  const choicesRaw = requireArray(record, 'choices', path);
  const choices = choicesRaw.map((entry, index) =>
    parseDialogueChoice(entry, `${path}.choices[${index}]`),
  );
  if (choices.length === 0) {
    fail(path, 'dialogue node must have at least one choice');
  }
  return {
    id: requireString(record, 'id', path),
    text: requireString(record, 'text', path),
    choices,
  };
}

function parseDialogueTree(value: unknown, path: string): DialogueTreeDefinition {
  const record = requireRecord(value, path);
  const startNodeId = requireString(record, 'startNodeId', path);
  const nodesRaw = requireArray(record, 'nodes', path);
  const nodes = nodesRaw.map((entry, index) =>
    parseDialogueNode(entry, `${path}.nodes[${index}]`),
  );
  assertUniqueIds(
    nodes.map((node) => node.id),
    `${path}.nodes`,
  );
  if (!nodes.some((node) => node.id === startNodeId)) {
    fail(path, `startNodeId "${startNodeId}" is not defined in nodes`);
  }
  return {
    id: requireString(record, 'id', path),
    startNodeId,
    nodes,
  };
}

function parseFloorEventDefinition(
  value: unknown,
  path: string,
): FloorEventDefinition {
  const record = requireRecord(value, path);
  const trigger = requireString(record, 'trigger', path);
  if (trigger !== 'on_enter') {
    fail(path, 'trigger must be "on_enter"');
  }
  return {
    id: requireString(record, 'id', path),
    floor: requireNumber(record, 'floor', path, { integer: true, min: 1 }),
    trigger: 'on_enter',
    text: requireString(record, 'text', path),
  };
}

function parseNpcDefinition(value: unknown, path: string): NpcDefinition {
  const record = requireRecord(value, path);
  const glyph = requireString(record, 'glyph', path);
  if (glyph.length !== 1) {
    fail(path, 'glyph must be a single character');
  }
  return {
    id: requireString(record, 'id', path),
    displayName: requireString(record, 'displayName', path),
    glyph,
    floor: requireNumber(record, 'floor', path, { integer: true, min: 1 }),
    dialogueTreeId: requireString(record, 'dialogueTreeId', path),
  };
}

export function validateEventsBundle(raw: unknown): EventsContentBundle {
  const root = requireRecord(raw, 'events.json');
  const schemaVersion = requireString(root, 'schemaVersion', 'events.json');
  if (schemaVersion !== EVENTS_SCHEMA_VERSION) {
    fail('events.json', `schemaVersion must be ${EVENTS_SCHEMA_VERSION}`);
  }
  const opening = parseNarrativeText(root.opening, 'events.json.opening');
  const ending = parseNarrativeText(root.ending, 'events.json.ending');
  const floorEventsRaw = requireArray(root, 'floorEvents', 'events.json');
  const floorEvents = floorEventsRaw.map((entry, index) =>
    parseFloorEventDefinition(entry, `events.json.floorEvents[${index}]`),
  );
  assertUniqueIds(
    floorEvents.map((event) => event.id),
    'events.json.floorEvents',
  );
  const npcsRaw = requireArray(root, 'npcs', 'events.json');
  const npcs = npcsRaw.map((entry, index) =>
    parseNpcDefinition(entry, `events.json.npcs[${index}]`),
  );
  assertUniqueIds(npcs.map((npc) => npc.id), 'events.json.npcs');
  const dialogueTreesRaw = requireArray(root, 'dialogueTrees', 'events.json');
  const dialogueTrees = dialogueTreesRaw.map((entry, index) =>
    parseDialogueTree(entry, `events.json.dialogueTrees[${index}]`),
  );
  assertUniqueIds(
    dialogueTrees.map((tree) => tree.id),
    'events.json.dialogueTrees',
  );
  return {
    schemaVersion,
    opening,
    ending,
    floorEvents,
    npcs,
    dialogueTrees,
  };
}

export function validateFloorRulesBundle(raw: unknown): FloorRulesContentBundle {
  const root = requireRecord(raw, 'floor-rules.json');
  const schemaVersion = requireString(root, 'schemaVersion', 'floor-rules.json');
  const floorsRaw = requireArray(root, 'floors', 'floor-rules.json');
  const floors = floorsRaw.map((entry, index) =>
    parseFloorRuleDefinition(entry, `floor-rules.json.floors[${index}]`),
  );
  assertUniqueIds(
    floors.map((floor) => floor.id),
    'floor-rules.json.floors',
  );
  const floorNumbers = floors.map((floor) => floor.floor);
  assertUniqueIds(
    floorNumbers.map((floorNumber) => String(floorNumber)),
    'floor-rules.json.floors.floor',
  );
  return { schemaVersion, floors };
}

export function validateContentReferences(content: GameContent): void {
  const itemIds = new Set(content.items.items.map((item) => item.id));
  const enemyIds = new Set(content.enemies.enemies.map((enemy) => enemy.id));
  const trapIds = new Set(content.traps.traps.map((trap) => trap.id));
  const floorNumbers = new Set(content.floors.floors.map((floor) => floor.floor));
  const treeIds = new Set(content.events.dialogueTrees.map((tree) => tree.id));

  for (const npc of content.events.npcs) {
    const path = `events.json.npcs[id=${npc.id}]`;
    if (!floorNumbers.has(npc.floor)) {
      fail(path, `unknown floor number ${npc.floor}`);
    }
    if (!treeIds.has(npc.dialogueTreeId)) {
      fail(path, `unknown dialogueTreeId "${npc.dialogueTreeId}"`);
    }
  }

  for (const tree of content.events.dialogueTrees) {
    const nodeIds = new Set(tree.nodes.map((node) => node.id));
    for (const node of tree.nodes) {
      const path = `events.json.dialogueTrees[id=${tree.id}].nodes[id=${node.id}]`;
      for (const choice of node.choices) {
        if (choice.nextNodeId && !nodeIds.has(choice.nextNodeId)) {
          fail(path, `choice "${choice.id}" references unknown node "${choice.nextNodeId}"`);
        }
      }
    }
  }

  for (const floorEvent of content.events.floorEvents) {
    if (!floorNumbers.has(floorEvent.floor)) {
      fail(
        `events.json.floorEvents[id=${floorEvent.id}]`,
        `unknown floor number ${floorEvent.floor}`,
      );
    }
  }

  for (const floor of content.floors.floors) {
    const path = `floor-rules.json.floors[id=${floor.id}]`;
    for (const enemyId of floor.enemyIds) {
      if (!enemyIds.has(enemyId)) {
        fail(path, `unknown enemy id "${enemyId}"`);
      }
    }
    for (const itemId of floor.itemIds) {
      if (!itemIds.has(itemId)) {
        fail(path, `unknown item id "${itemId}"`);
      }
    }
    for (const trapId of floor.trapIds ?? []) {
      if (!trapIds.has(trapId)) {
        fail(path, `unknown trap id "${trapId}"`);
      }
    }
  }

  for (const enemy of content.enemies.enemies) {
    for (const itemId of enemy.itemDropIds) {
      if (!itemIds.has(itemId)) {
        fail(
          `enemies.json.enemies[id=${enemy.id}]`,
          `unknown item drop id "${itemId}"`,
        );
      }
    }
  }
}

export function loadGameContent(): GameContent {
  const items = validateItemsBundle(itemsJson);
  const enemies = validateEnemiesBundle(enemiesJson);
  const floors = validateFloorRulesBundle(floorRulesJson);
  const traps = validateTrapsBundle(trapsJson);
  const events = validateEventsBundle(eventsJson);
  const content: GameContent = { items, enemies, floors, traps, events };
  validateContentReferences(content);
  return content;
}
