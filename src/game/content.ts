import enemiesJson from '../../content/enemies.json' with { type: 'json' };
import floorRulesJson from '../../content/floor-rules.json' with { type: 'json' };
import itemsJson from '../../content/items.json' with { type: 'json' };

export const CONTENT_SCHEMA_VERSION = '02C' as const;

export const POTION_ITEM_ID = 'potion' as const;
export const SLIME_ENEMY_ID = 'slime' as const;

export interface ItemDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  kind: string;
  effect: string;
  healAmount: number;
  stackable: boolean;
}

export interface EnemyDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  hp: number;
  attack: number;
  defense: number;
  xp: number;
  goldReward: number;
  itemDropIds: string[];
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

export interface GameContent {
  items: ItemsContentBundle;
  enemies: EnemiesContentBundle;
  floors: FloorRulesContentBundle;
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

function parseItemDefinition(value: unknown, path: string): ItemDefinition {
  const record = requireRecord(value, path);
  return {
    id: requireString(record, 'id', path),
    name: requireString(record, 'name', path),
    displayName: requireString(record, 'displayName', path),
    description: requireString(record, 'description', path),
    kind: requireString(record, 'kind', path),
    effect: requireString(record, 'effect', path),
    healAmount: requireNumber(record, 'healAmount', path, {
      integer: true,
      min: 1,
    }),
    stackable: requireBoolean(record, 'stackable', path),
  };
}

function parseEnemyDefinition(value: unknown, path: string): EnemyDefinition {
  const record = requireRecord(value, path);
  return {
    id: requireString(record, 'id', path),
    name: requireString(record, 'name', path),
    displayName: requireString(record, 'displayName', path),
    description: requireString(record, 'description', path),
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

function parseFloorRuleDefinition(
  value: unknown,
  path: string,
): FloorRuleDefinition {
  const record = requireRecord(value, path);
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
    maxTurns: requireNumber(record, 'maxTurns', path, {
      integer: true,
      min: 1,
    }),
  };
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
  const content: GameContent = { items, enemies, floors };
  validateContentReferences(content);
  return content;
}
