import challengeModesJson from '../../content/challenge-modes.json' with { type: 'json' };

import { resolveGameConfigForVersion } from './version-profiles.js';
import type { GameConfig } from './types.js';

export const CHALLENGE_MODES_SCHEMA_VERSION = '16B' as const;

export const DEFAULT_CHALLENGE_MODE_ID = 'default' as const;

export interface ChallengeModePreset {
  id: string;
  label: string;
  description: string;
  recommendedSeeds?: readonly string[];
  gameConfig: GameConfig;
}

export interface ChallengeModesContentBundle {
  schemaVersion: string;
  presets: ChallengeModePreset[];
}

export class ChallengeModeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChallengeModeValidationError';
  }
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => isNonEmptyString(entry));

const validateGameConfigOverlay = (config: unknown, path: string): GameConfig => {
  if (!config || typeof config !== 'object') {
    throw new ChallengeModeValidationError(`${path}.gameConfig must be an object`);
  }

  const record = config as Record<string, unknown>;
  const overlay: GameConfig = {};

  if (record.totalFloors !== undefined) {
    if (!Number.isInteger(record.totalFloors) || (record.totalFloors as number) <= 0) {
      throw new ChallengeModeValidationError(`${path}.gameConfig.totalFloors must be a positive integer`);
    }
    overlay.totalFloors = record.totalFloors as number;
  }

  if (record.maxTurns !== undefined) {
    if (!Number.isInteger(record.maxTurns) || (record.maxTurns as number) <= 0) {
      throw new ChallengeModeValidationError(`${path}.gameConfig.maxTurns must be a positive integer`);
    }
    overlay.maxTurns = record.maxTurns as number;
  }

  if (record.objective !== undefined) {
    if (!isNonEmptyString(record.objective)) {
      throw new ChallengeModeValidationError(`${path}.gameConfig.objective must be a non-empty string`);
    }
    overlay.objective = record.objective;
  }

  for (const listField of ['allowedEnemyIds', 'allowedItemIds', 'initialInventory', 'openingLog'] as const) {
    const value = record[listField];
    if (value === undefined) {
      continue;
    }
    if (!isStringArray(value) || value.length === 0) {
      throw new ChallengeModeValidationError(`${path}.gameConfig.${listField} must be a non-empty string array`);
    }
    overlay[listField] = value;
  }

  return overlay;
};

export const validateChallengeModesBundle = (raw: unknown): ChallengeModesContentBundle => {
  if (!raw || typeof raw !== 'object') {
    throw new ChallengeModeValidationError('challenge-modes.json must be an object');
  }

  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== CHALLENGE_MODES_SCHEMA_VERSION) {
    throw new ChallengeModeValidationError(
      `challenge-modes.json schemaVersion must be "${CHALLENGE_MODES_SCHEMA_VERSION}"`,
    );
  }

  if (!Array.isArray(record.presets) || record.presets.length === 0) {
    throw new ChallengeModeValidationError('challenge-modes.json presets must be a non-empty array');
  }

  const seen = new Set<string>();
  const presets: ChallengeModePreset[] = [];

  for (const [index, entry] of record.presets.entries()) {
    const path = `challenge-modes.json.presets[${index}]`;
    if (!entry || typeof entry !== 'object') {
      throw new ChallengeModeValidationError(`${path} must be an object`);
    }
    const preset = entry as Record<string, unknown>;
    if (!isNonEmptyString(preset.id)) {
      throw new ChallengeModeValidationError(`${path}.id must be a non-empty string`);
    }
    if (seen.has(preset.id)) {
      throw new ChallengeModeValidationError(`${path}.id duplicates preset "${preset.id}"`);
    }
    seen.add(preset.id);

    if (!isNonEmptyString(preset.label)) {
      throw new ChallengeModeValidationError(`${path}.label must be a non-empty string`);
    }
    if (!isNonEmptyString(preset.description)) {
      throw new ChallengeModeValidationError(`${path}.description must be a non-empty string`);
    }

    if (preset.recommendedSeeds !== undefined && !isStringArray(preset.recommendedSeeds)) {
      throw new ChallengeModeValidationError(`${path}.recommendedSeeds must be a string array`);
    }

    const gameConfig = validateGameConfigOverlay(preset.gameConfig, path);
    if (!gameConfig.totalFloors) {
      throw new ChallengeModeValidationError(`${path}.gameConfig.totalFloors is required for finite presets`);
    }

    presets.push({
      id: preset.id,
      label: preset.label,
      description: preset.description,
      ...(preset.recommendedSeeds ? { recommendedSeeds: preset.recommendedSeeds } : {}),
      gameConfig,
    });
  }

  return {
    schemaVersion: CHALLENGE_MODES_SCHEMA_VERSION,
    presets,
  };
};

let cachedBundle: ChallengeModesContentBundle | undefined;

export const loadChallengeModes = (): ChallengeModesContentBundle => {
  if (!cachedBundle) {
    cachedBundle = validateChallengeModesBundle(challengeModesJson);
  }
  return cachedBundle;
};

export const listChallengeModeIds = (): readonly string[] =>
  loadChallengeModes().presets.map((preset) => preset.id);

export const getChallengeModePreset = (challengeModeId: string): ChallengeModePreset | undefined => {
  if (challengeModeId === DEFAULT_CHALLENGE_MODE_ID) {
    return undefined;
  }
  return loadChallengeModes().presets.find((preset) => preset.id === challengeModeId);
};

export const assertChallengeModeId = (challengeModeId: string): ChallengeModePreset => {
  const preset = getChallengeModePreset(challengeModeId);
  if (!preset) {
    const known = listChallengeModeIds().join(', ');
    throw new Error(
      `Unknown challenge mode "${challengeModeId}". Expected one of: ${known} (or omit for default).`,
    );
  }
  return preset;
};

export const mergeGameConfig = (base: GameConfig, overlay: GameConfig): GameConfig => ({
  ...base,
  ...overlay,
  ...(overlay.allowedEnemyIds ? { allowedEnemyIds: [...overlay.allowedEnemyIds] } : {}),
  ...(overlay.allowedItemIds ? { allowedItemIds: [...overlay.allowedItemIds] } : {}),
  ...(overlay.initialInventory ? { initialInventory: [...overlay.initialInventory] } : {}),
  ...(overlay.openingLog
    ? {
        openingLog: [...(base.openingLog ?? []), ...overlay.openingLog],
      }
    : {}),
});

/** Resolves version profile config with an optional explicit challenge mode overlay. */
export const resolveGameConfigForRun = (
  version: string,
  challengeModeId?: string,
): GameConfig => {
  const base = resolveGameConfigForVersion(version);
  const normalizedChallengeModeId = normalizeChallengeModeId(challengeModeId);
  if (!normalizedChallengeModeId) {
    return base;
  }
  const preset = assertChallengeModeId(normalizedChallengeModeId);
  return mergeGameConfig(base, preset.gameConfig);
};

export const normalizeChallengeModeId = (
  challengeModeId: string | undefined,
): string | undefined => {
  if (!challengeModeId || challengeModeId === DEFAULT_CHALLENGE_MODE_ID) {
    return undefined;
  }
  return challengeModeId;
};
