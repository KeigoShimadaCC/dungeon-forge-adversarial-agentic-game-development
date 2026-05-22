import { describe, expect, it } from 'vitest';

import {
  CONTENT_SCHEMA_VERSION,
  ContentValidationError,
  loadGameContent,
  POTION_ITEM_ID,
  SLIME_ENEMY_ID,
  validateContentReferences,
  validateEnemiesBundle,
  validateFloorRulesBundle,
  validateItemsBundle,
} from '../src/game/content.js';
import { getEnemyById, getSlime } from '../src/game/enemies.js';
import { getItemById, getPotion } from '../src/game/items.js';

describe('Phase 02C content data', () => {
  it('loads bundled JSON with required records', () => {
    const content = loadGameContent();

    expect(content.items.schemaVersion).toBe(CONTENT_SCHEMA_VERSION);
    expect(content.enemies.schemaVersion).toBe(CONTENT_SCHEMA_VERSION);
    expect(content.floors.schemaVersion).toBe(CONTENT_SCHEMA_VERSION);
    expect(content.items.items).toHaveLength(1);
    expect(content.enemies.enemies).toHaveLength(1);
    expect(content.floors.floors).toHaveLength(5);
  });

  it('exposes Potion and Slime by stable id', () => {
    const potion = getPotion();
    const slime = getSlime();

    expect(potion.id).toBe(POTION_ITEM_ID);
    expect(potion.displayName).toBe('Healing Potion');
    expect(potion.healAmount).toBeGreaterThan(0);
    expect(slime.id).toBe(SLIME_ENEMY_ID);
    expect(slime.displayName).toBe('Green Slime');
    expect(slime.hp).toBeGreaterThan(0);

    expect(getItemById(POTION_ITEM_ID)).toEqual(potion);
    expect(getEnemyById(SLIME_ENEMY_ID)).toEqual(slime);
  });

  it('rejects malformed item bundles with clear errors', () => {
    expect(() =>
      validateItemsBundle({
        schemaVersion: CONTENT_SCHEMA_VERSION,
        items: [{ id: 'bad', name: 'Bad' }],
      }),
    ).toThrow(ContentValidationError);

    try {
      validateItemsBundle({
        schemaVersion: CONTENT_SCHEMA_VERSION,
        items: [{ id: 'bad', name: 'Bad' }],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError);
      expect((error as ContentValidationError).message).toContain('displayName');
    }
  });

  it('rejects malformed enemy bundles with clear errors', () => {
    expect(() =>
      validateEnemiesBundle({
        schemaVersion: CONTENT_SCHEMA_VERSION,
        enemies: [{ id: 'slime', name: 'Slime' }],
      }),
    ).toThrow(ContentValidationError);
  });

  it('rejects malformed floor rule bundles with clear errors', () => {
    const validFloor = {
      id: 'floor-1',
      floor: 1,
      width: 8,
      height: 8,
      enemyIds: [SLIME_ENEMY_ID],
      itemIds: [POTION_ITEM_ID],
      enemySpawnCount: 1,
      itemSpawnCount: 1,
      maxTurns: 40,
    };

    expect(() =>
      validateFloorRulesBundle({
        schemaVersion: CONTENT_SCHEMA_VERSION,
        floors: [{ ...validFloor, maxTurns: undefined }],
      }),
    ).toThrow(ContentValidationError);

    try {
      validateFloorRulesBundle({
        schemaVersion: CONTENT_SCHEMA_VERSION,
        floors: [{ ...validFloor, maxTurns: undefined }],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError);
      expect((error as ContentValidationError).message).toContain('maxTurns');
      expect((error as ContentValidationError).message).toContain(
        'floor-rules.json.floors[0]',
      );
    }

    expect(() =>
      validateFloorRulesBundle({
        schemaVersion: CONTENT_SCHEMA_VERSION,
        floors: [{ ...validFloor, width: 'wide' }],
      }),
    ).toThrow(/width must be a finite number/);

    expect(() =>
      validateFloorRulesBundle({
        schemaVersion: CONTENT_SCHEMA_VERSION,
        floors: [{ ...validFloor, enemyIds: SLIME_ENEMY_ID }],
      }),
    ).toThrow(/enemyIds must be an array/);

    expect(() =>
      validateFloorRulesBundle({
        schemaVersion: CONTENT_SCHEMA_VERSION,
        floors: [validFloor, { ...validFloor, floor: 2 }],
      }),
    ).toThrow(/duplicate id "floor-1"/);

    expect(() =>
      validateFloorRulesBundle({
        schemaVersion: CONTENT_SCHEMA_VERSION,
        floors: [
          validFloor,
          { ...validFloor, id: 'floor-1b', floor: 1 },
        ],
      }),
    ).toThrow(/duplicate id "1"/);
  });

  it('asserts loaded floor rules expose expected progression', () => {
    const { floors } = loadGameContent();

    expect(floors.floors.map((rule) => rule.floor)).toEqual([1, 2, 3, 4, 5]);
    expect(floors.floors.every((rule) => rule.width === 8 && rule.height === 8)).toBe(
      true,
    );
    expect(floors.floors.map((rule) => rule.enemyIds)).toEqual([
      [SLIME_ENEMY_ID],
      [SLIME_ENEMY_ID],
      [SLIME_ENEMY_ID],
      [SLIME_ENEMY_ID],
      [SLIME_ENEMY_ID],
    ]);
    expect(floors.floors[2].itemIds).toEqual([]);
    expect(floors.floors[4].itemIds).toEqual([]);
    expect(floors.floors.map((rule) => rule.maxTurns)).toEqual([48, 52, 56, 60, 64]);
    expect(floors.floors.map((rule) => rule.enemySpawnCount)).toEqual([
      1, 2, 2, 3, 2,
    ]);
  });

  it('rejects floor rules that reference unknown content ids', () => {
    const items = validateItemsBundle({
      schemaVersion: CONTENT_SCHEMA_VERSION,
      items: [
        {
          id: POTION_ITEM_ID,
          name: 'Potion',
          displayName: 'Healing Potion',
          description: 'Heal.',
          kind: 'consumable',
          effect: 'heal',
          healAmount: 8,
          stackable: true,
        },
      ],
    });
    const enemies = validateEnemiesBundle({
      schemaVersion: CONTENT_SCHEMA_VERSION,
      enemies: [
        {
          id: SLIME_ENEMY_ID,
          name: 'Slime',
          displayName: 'Green Slime',
          description: 'Blob.',
          hp: 6,
          attack: 2,
          defense: 0,
          xp: 3,
          goldReward: 1,
          itemDropIds: [],
        },
      ],
    });
    const floors = validateFloorRulesBundle({
      schemaVersion: CONTENT_SCHEMA_VERSION,
      floors: [
        {
          id: 'floor-1',
          floor: 1,
          width: 8,
          height: 8,
          enemyIds: ['phantom'],
          itemIds: [POTION_ITEM_ID],
          enemySpawnCount: 1,
          itemSpawnCount: 1,
          maxTurns: 40,
        },
      ],
    });

    expect(() => validateContentReferences({ items, enemies, floors })).toThrow(
      /unknown enemy id "phantom"/,
    );
  });
});
