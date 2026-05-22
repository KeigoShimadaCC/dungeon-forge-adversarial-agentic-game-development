import scenarioPacksManifestJson from '../../content/scenario-packs.json' with { type: 'json' };
import shrineTrialPackJson from '../../content/packs/shrine-trial.json' with { type: 'json' };

import {
  mergeGameConfig,
  resolveGameConfigForRun as resolveChallengeGameConfig,
} from './challenge-modes.js';
import {
  loadGameContent,
  validateContentReferences,
  validateEnemiesBundle,
  validateEventsBundle,
  validateFloorRulesBundle,
  validateItemsBundle,
  validateTrapsBundle,
  type EnemiesContentBundle,
  type EventsContentBundle,
  type FloorRuleDefinition,
  type FloorRulesContentBundle,
  type GameContent,
  type ItemsContentBundle,
  type TrapsContentBundle,
} from './content.js';
import type { GameConfig } from './types.js';

export const SCENARIO_PACKS_SCHEMA_VERSION = '16C' as const;
export const SCENARIO_PACK_CONTENT_SCHEMA_VERSION = '16C' as const;

export const DEFAULT_SCENARIO_PACK_ID = 'default' as const;

const PACK_CONTENT_BY_FILE: Record<string, unknown> = {
  'packs/shrine-trial.json': shrineTrialPackJson,
};

export interface ScenarioPackManifestEntry {
  id: string;
  label: string;
  description: string;
  recommendedSeeds?: readonly string[];
  contentFile: string;
  gameConfig?: GameConfig;
}

export interface ScenarioPacksManifest {
  schemaVersion: string;
  packs: ScenarioPackManifestEntry[];
}

export interface ScenarioPackFloorOverlay {
  replace?: FloorRuleDefinition[];
}

export interface ScenarioPackEventsOverlay {
  floorEvents?: { add?: unknown[] };
  npcs?: { replace?: unknown[] };
  dialogueTrees?: { add?: unknown[] };
}

export interface ScenarioPackContentOverlay {
  schemaVersion: string;
  items?: { add?: unknown[] };
  enemies?: { add?: unknown[] };
  traps?: { add?: unknown[] };
  floors?: ScenarioPackFloorOverlay;
  events?: ScenarioPackEventsOverlay;
}

export class ScenarioPackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioPackValidationError';
  }
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => isNonEmptyString(entry));

const stableJson = (value: unknown): string => JSON.stringify(value);

const validateGameConfigOverlay = (value: unknown, path: string): GameConfig => {
  if (value === undefined) {
    return {};
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ScenarioPackValidationError(`${path} must be an object`);
  }

  const record = value as Record<string, unknown>;
  const overlay: GameConfig = {};

  for (const field of ['totalFloors', 'maxTurns'] as const) {
    const fieldValue = record[field];
    if (fieldValue === undefined) {
      continue;
    }
    if (!Number.isInteger(fieldValue) || (fieldValue as number) <= 0) {
      throw new ScenarioPackValidationError(`${path}.${field} must be a positive integer`);
    }
    overlay[field] = fieldValue as number;
  }

  if (record.objective !== undefined) {
    if (!isNonEmptyString(record.objective)) {
      throw new ScenarioPackValidationError(`${path}.objective must be a non-empty string`);
    }
    overlay.objective = record.objective;
  }

  for (const listField of ['allowedEnemyIds', 'allowedItemIds', 'initialInventory', 'openingLog'] as const) {
    const fieldValue = record[listField];
    if (fieldValue === undefined) {
      continue;
    }
    if (!isStringArray(fieldValue) || fieldValue.length === 0) {
      throw new ScenarioPackValidationError(`${path}.${listField} must be a non-empty string array`);
    }
    overlay[listField] = fieldValue;
  }

  return overlay;
};

const assertNoConflictingDefinitions = <T extends { id: string }>(
  path: string,
  base: readonly T[],
  incoming: readonly T[],
): void => {
  const baseById = new Map(base.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    const existing = baseById.get(entry.id);
    if (existing && stableJson(existing) !== stableJson(entry)) {
      throw new ScenarioPackValidationError(
        `${path}: id "${entry.id}" conflicts with base content definition`,
      );
    }
  }
};

const mergeById = <T extends { id: string }>(
  base: readonly T[],
  replacements: readonly T[],
  additions: readonly T[],
): T[] => {
  const map = new Map(base.map((entry) => [entry.id, entry]));
  for (const entry of replacements) {
    map.set(entry.id, entry);
  }
  for (const entry of additions) {
    if (!map.has(entry.id)) {
      map.set(entry.id, entry);
    }
  }
  return [...map.values()];
};

const mergeFloorsByFloorNumber = (
  base: readonly FloorRuleDefinition[],
  replacements: readonly FloorRuleDefinition[],
): FloorRuleDefinition[] => {
  const byFloor = new Map(base.map((floor) => [floor.floor, floor]));
  for (const floor of replacements) {
    byFloor.set(floor.floor, floor);
  }
  return [...byFloor.values()].sort((a, b) => a.floor - b.floor);
};

export const validateScenarioPackContentOverlay = (
  raw: unknown,
  path: string,
): ScenarioPackContentOverlay => {
  if (!raw || typeof raw !== 'object') {
    throw new ScenarioPackValidationError(`${path} must be an object`);
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== SCENARIO_PACK_CONTENT_SCHEMA_VERSION) {
    throw new ScenarioPackValidationError(
      `${path}.schemaVersion must be "${SCENARIO_PACK_CONTENT_SCHEMA_VERSION}"`,
    );
  }
  return record as unknown as ScenarioPackContentOverlay;
};

export const mergeScenarioPackContent = (
  base: GameContent,
  overlay: ScenarioPackContentOverlay,
  packPath: string,
): GameContent => {
  const itemsAdd = overlay.items?.add ?? [];
  const enemiesAdd = overlay.enemies?.add ?? [];
  const trapsAdd = overlay.traps?.add ?? [];

  assertNoConflictingDefinitions(
    `${packPath}.items.add`,
    base.items.items,
    validateItemsBundle({ schemaVersion: base.items.schemaVersion, items: itemsAdd }).items,
  );
  assertNoConflictingDefinitions(
    `${packPath}.enemies.add`,
    base.enemies.enemies,
    validateEnemiesBundle({ schemaVersion: base.enemies.schemaVersion, enemies: enemiesAdd })
      .enemies,
  );
  assertNoConflictingDefinitions(
    `${packPath}.traps.add`,
    base.traps.traps,
    validateTrapsBundle({ schemaVersion: base.traps.schemaVersion, traps: trapsAdd }).traps,
  );

  const mergedItems: ItemsContentBundle = {
    schemaVersion: base.items.schemaVersion,
    items: mergeById(
      base.items.items,
      [],
      validateItemsBundle({ schemaVersion: base.items.schemaVersion, items: itemsAdd }).items,
    ),
  };

  const mergedEnemies: EnemiesContentBundle = {
    schemaVersion: base.enemies.schemaVersion,
    enemies: mergeById(
      base.enemies.enemies,
      [],
      validateEnemiesBundle({
        schemaVersion: base.enemies.schemaVersion,
        enemies: enemiesAdd,
      }).enemies,
    ),
  };

  const mergedTraps: TrapsContentBundle = {
    schemaVersion: base.traps.schemaVersion,
    traps: mergeById(
      base.traps.traps,
      [],
      validateTrapsBundle({ schemaVersion: base.traps.schemaVersion, traps: trapsAdd }).traps,
    ),
  };

  const floorReplacements = overlay.floors?.replace ?? [];
  const mergedFloors: FloorRulesContentBundle = {
    schemaVersion: base.floors.schemaVersion,
    floors: mergeFloorsByFloorNumber(
      base.floors.floors,
      validateFloorRulesBundle({
        schemaVersion: base.floors.schemaVersion,
        floors: floorReplacements,
      }).floors,
    ),
  };

  const eventsOverlay = overlay.events ?? {};
  const floorEventsAdd = eventsOverlay.floorEvents?.add ?? [];
  const npcsReplace = eventsOverlay.npcs?.replace ?? [];
  const dialogueTreesAdd = eventsOverlay.dialogueTrees?.add ?? [];

  const addedFloorEvents =
    floorEventsAdd.length > 0
      ? validateEventsBundle({
          schemaVersion: base.events.schemaVersion,
          opening: base.events.opening,
          ending: base.events.ending,
          floorEvents: floorEventsAdd,
          npcs: [],
          dialogueTrees: [],
        }).floorEvents
      : [];

  const replacedNpcs =
    npcsReplace.length > 0
      ? validateEventsBundle({
          schemaVersion: base.events.schemaVersion,
          opening: base.events.opening,
          ending: base.events.ending,
          floorEvents: [],
          npcs: npcsReplace,
          dialogueTrees: [],
        }).npcs
      : [];

  const addedDialogueTrees =
    dialogueTreesAdd.length > 0
      ? validateEventsBundle({
          schemaVersion: base.events.schemaVersion,
          opening: base.events.opening,
          ending: base.events.ending,
          floorEvents: [],
          npcs: [],
          dialogueTrees: dialogueTreesAdd,
        }).dialogueTrees
      : [];

  const mergedEvents: EventsContentBundle = {
    ...base.events,
    floorEvents: mergeById(base.events.floorEvents, [], addedFloorEvents),
    npcs: mergeById(base.events.npcs, replacedNpcs, []),
    dialogueTrees: mergeById(base.events.dialogueTrees, [], addedDialogueTrees),
  };

  const merged: GameContent = {
    items: mergedItems,
    enemies: mergedEnemies,
    floors: mergedFloors,
    traps: mergedTraps,
    events: mergedEvents,
  };

  validateContentReferences(merged);
  return merged;
};

export const validateScenarioPacksManifest = (raw: unknown): ScenarioPacksManifest => {
  if (!raw || typeof raw !== 'object') {
    throw new ScenarioPackValidationError('scenario-packs.json must be an object');
  }

  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== SCENARIO_PACKS_SCHEMA_VERSION) {
    throw new ScenarioPackValidationError(
      `scenario-packs.json schemaVersion must be "${SCENARIO_PACKS_SCHEMA_VERSION}"`,
    );
  }

  if (!Array.isArray(record.packs) || record.packs.length === 0) {
    throw new ScenarioPackValidationError('scenario-packs.json packs must be a non-empty array');
  }

  const seen = new Set<string>();
  const packs: ScenarioPackManifestEntry[] = [];

  for (const [index, entry] of record.packs.entries()) {
    const path = `scenario-packs.json.packs[${index}]`;
    if (!entry || typeof entry !== 'object') {
      throw new ScenarioPackValidationError(`${path} must be an object`);
    }
    const pack = entry as Record<string, unknown>;
    if (!isNonEmptyString(pack.id)) {
      throw new ScenarioPackValidationError(`${path}.id must be a non-empty string`);
    }
    if (seen.has(pack.id)) {
      throw new ScenarioPackValidationError(`${path}.id duplicates pack "${pack.id}"`);
    }
    seen.add(pack.id);

    if (!isNonEmptyString(pack.label)) {
      throw new ScenarioPackValidationError(`${path}.label must be a non-empty string`);
    }
    if (!isNonEmptyString(pack.description)) {
      throw new ScenarioPackValidationError(`${path}.description must be a non-empty string`);
    }
    if (!isNonEmptyString(pack.contentFile)) {
      throw new ScenarioPackValidationError(`${path}.contentFile must be a non-empty string`);
    }
    if (!PACK_CONTENT_BY_FILE[pack.contentFile]) {
      throw new ScenarioPackValidationError(
        `${path}.contentFile "${pack.contentFile}" is not registered in the scenario pack loader`,
      );
    }
    if (pack.recommendedSeeds !== undefined && !isStringArray(pack.recommendedSeeds)) {
      throw new ScenarioPackValidationError(`${path}.recommendedSeeds must be a string array`);
    }

    packs.push({
      id: pack.id,
      label: pack.label,
      description: pack.description,
      contentFile: pack.contentFile,
      ...(pack.recommendedSeeds ? { recommendedSeeds: pack.recommendedSeeds } : {}),
      ...(pack.gameConfig
        ? { gameConfig: validateGameConfigOverlay(pack.gameConfig, `${path}.gameConfig`) }
        : {}),
    });
  }

  return {
    schemaVersion: SCENARIO_PACKS_SCHEMA_VERSION,
    packs,
  };
};

let cachedManifest: ScenarioPacksManifest | undefined;
const mergedContentCache = new Map<string, GameContent>();

export const loadScenarioPacksManifest = (): ScenarioPacksManifest => {
  if (!cachedManifest) {
    cachedManifest = validateScenarioPacksManifest(scenarioPacksManifestJson);
  }
  return cachedManifest;
};

export const listScenarioPackIds = (): readonly string[] =>
  loadScenarioPacksManifest().packs.map((pack) => pack.id);

export const getScenarioPackManifestEntry = (
  scenarioPackId: string,
): ScenarioPackManifestEntry | undefined => {
  if (scenarioPackId === DEFAULT_SCENARIO_PACK_ID) {
    return undefined;
  }
  return loadScenarioPacksManifest().packs.find((pack) => pack.id === scenarioPackId);
};

export const assertScenarioPackId = (scenarioPackId: string): ScenarioPackManifestEntry => {
  const pack = getScenarioPackManifestEntry(scenarioPackId);
  if (!pack) {
    const known = listScenarioPackIds().join(', ');
    throw new Error(
      `Unknown scenario pack "${scenarioPackId}". Expected one of: ${known} (or omit for default).`,
    );
  }
  return pack;
};

export const loadScenarioPackContent = (scenarioPackId: string): GameContent => {
  const pack = assertScenarioPackId(scenarioPackId);
  const cached = mergedContentCache.get(pack.id);
  if (cached) {
    return cached;
  }

  const rawOverlay = PACK_CONTENT_BY_FILE[pack.contentFile];
  if (!rawOverlay) {
    throw new ScenarioPackValidationError(
      `Missing registered content for scenario pack file "${pack.contentFile}"`,
    );
  }

  const overlay = validateScenarioPackContentOverlay(rawOverlay, pack.contentFile);
  const merged = mergeScenarioPackContent(loadGameContent(), overlay, pack.contentFile);
  mergedContentCache.set(pack.id, merged);
  return merged;
};

export const getScenarioPackLabel = (scenarioPackId: string): string | undefined =>
  getScenarioPackManifestEntry(scenarioPackId)?.label;

export const normalizeScenarioPackId = (
  scenarioPackId: string | undefined,
): string | undefined => {
  if (!scenarioPackId || scenarioPackId === DEFAULT_SCENARIO_PACK_ID) {
    return undefined;
  }
  return scenarioPackId;
};

/** Resolves version + challenge + scenario pack overlays into one bounded run config. */
export const resolveGameConfigForRun = (
  version: string,
  challengeModeId?: string,
  scenarioPackId?: string,
): GameConfig => {
  let config = resolveChallengeGameConfig(version, challengeModeId);
  const normalizedPackId = normalizeScenarioPackId(scenarioPackId);
  if (!normalizedPackId) {
    return config;
  }

  const pack = assertScenarioPackId(normalizedPackId);
  if (pack.gameConfig) {
    config = mergeGameConfig(config, pack.gameConfig);
  }
  return {
    ...config,
    scenarioPackId: pack.id,
  };
};

export const getGameContentForRun = (scenarioPackId?: string): GameContent => {
  const normalized = normalizeScenarioPackId(scenarioPackId);
  if (!normalized) {
    return loadGameContent();
  }
  return loadScenarioPackContent(normalized);
};
