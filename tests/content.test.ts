import { describe, expect, it } from 'vitest';

import {
  BAT_ENEMY_ID,
  CONTENT_SCHEMA_VERSION,
  ContentValidationError,
  EVENTS_SCHEMA_VERSION,
  GHOST_ENEMY_ID,
  loadGameContent,
  PHASE_09A_ITEM_IDS,
  PHASE_09B_ENEMY_IDS,
  POTION_ITEM_ID,
  SHELL_ENEMY_ID,
  SLIME_ENEMY_ID,
  THIEF_ENEMY_ID,
  validateContentReferences,
  validateEnemiesBundle,
  validateEventsBundle,
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
    expect(content.events.schemaVersion).toBe(EVENTS_SCHEMA_VERSION);
    expect(content.items.items).toHaveLength(5);
    expect(content.enemies.enemies).toHaveLength(5);
    expect(content.floors.floors).toHaveLength(5);
    expect(content.events.opening.text.length).toBeGreaterThan(0);
    expect(content.events.ending.text.length).toBeGreaterThan(0);
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

  it('validates tactical item metadata and floor references', () => {
    const { floors, items } = loadGameContent();
    const tacticalItems = items.items.filter((item) =>
      PHASE_09A_ITEM_IDS.includes(item.id as (typeof PHASE_09A_ITEM_IDS)[number]),
    );

    expect(tacticalItems.map((item) => item.id)).toEqual(PHASE_09A_ITEM_IDS);
    expect(tacticalItems.map((item) => item.effect)).toEqual([
      'blind_enemies',
      'swap_position',
      'area_damage',
      'warp',
    ]);
    expect(tacticalItems.every((item) => item.validUse.length > 0)).toBe(true);
    expect(tacticalItems.every((item) => item.glyph.length === 1)).toBe(true);

    const spawnedItemIds = new Set(floors.floors.flatMap((floor) => floor.itemIds));
    for (const itemId of PHASE_09A_ITEM_IDS) {
      expect(spawnedItemIds.has(itemId)).toBe(true);
    }
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

  it('validates glyph and behavior fields for every enemy', () => {
    const { enemies } = loadGameContent();

    expect(enemies.enemies.map((enemy) => enemy.id)).toEqual([
      SLIME_ENEMY_ID,
      BAT_ENEMY_ID,
      SHELL_ENEMY_ID,
      THIEF_ENEMY_ID,
      GHOST_ENEMY_ID,
    ]);
    expect(enemies.enemies.map((enemy) => enemy.glyph)).toEqual(['s', 'b', 'S', 't', 'g']);
    expect(enemies.enemies.map((enemy) => enemy.behavior)).toEqual([
      'chase',
      'bat',
      'shell',
      'thief',
      'ghost',
    ]);
    expect(getEnemyById(SHELL_ENEMY_ID)?.defense).toBe(2);
  });

  it('rejects enemies with invalid glyph or behavior values', () => {
    const baseEnemy = {
      id: SLIME_ENEMY_ID,
      name: 'Slime',
      displayName: 'Green Slime',
      description: 'Blob.',
      glyph: 's',
      behavior: 'chase',
      hp: 6,
      attack: 2,
      defense: 0,
      xp: 3,
      goldReward: 1,
      itemDropIds: [],
    };

    expect(() =>
      validateEnemiesBundle({
        schemaVersion: CONTENT_SCHEMA_VERSION,
        enemies: [{ ...baseEnemy, glyph: 'slime' }],
      }),
    ).toThrow(/glyph must be a single character/);

    expect(() =>
      validateEnemiesBundle({
        schemaVersion: CONTENT_SCHEMA_VERSION,
        enemies: [{ ...baseEnemy, behavior: 'hover' }],
      }),
    ).toThrow(/behavior must be one of/);
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

  it('validates Phase 10A dialogue events and references', () => {
    const { events } = loadGameContent();

    expect(events.floorEvents).toEqual([
      expect.objectContaining({
        id: 'floor-4-morning-pulse',
        floor: 4,
        trigger: 'on_enter',
      }),
    ]);
    expect(events.npcs).toEqual([
      expect.objectContaining({
        id: 'shrine_keeper',
        floor: 3,
        dialogueTreeId: 'keeper_dialogue',
      }),
    ]);
    expect(events.dialogueTrees[0].nodes[0].choices).toEqual([
      expect.objectContaining({ id: 'ask_bell', nextNodeId: 'bell_lore' }),
      expect.objectContaining({ id: 'ask_path', nextNodeId: 'path_hint' }),
      expect.objectContaining({ id: 'farewell', exit: true }),
    ]);

    expect(() =>
      validateEventsBundle({
        schemaVersion: EVENTS_SCHEMA_VERSION,
        opening: { id: 'opening', text: 'Begin.' },
        ending: { id: 'ending', text: 'End.' },
        floorEvents: [],
        npcs: [
          {
            id: 'bad_npc',
            displayName: 'Bad NPC',
            glyph: 'NPC',
            floor: 1,
            dialogueTreeId: 'tree',
          },
        ],
        dialogueTrees: [],
      }),
    ).toThrow(/glyph must be a single character/);
  });

  it('asserts loaded floor rules expose expected progression', () => {
    const { floors } = loadGameContent();

    expect(floors.floors.map((rule) => rule.floor)).toEqual([1, 2, 3, 4, 5]);
    expect(floors.floors.map((rule) => [rule.width, rule.height])).toEqual([
      [9, 9],
      [10, 10],
      [10, 10],
      [11, 11],
      [12, 12],
    ]);
    expect(floors.floors.map((rule) => rule.enemyIds)).toEqual([
      [SLIME_ENEMY_ID],
      [SLIME_ENEMY_ID, BAT_ENEMY_ID],
      [SLIME_ENEMY_ID, SHELL_ENEMY_ID],
      [SLIME_ENEMY_ID, THIEF_ENEMY_ID, BAT_ENEMY_ID],
      [SLIME_ENEMY_ID, GHOST_ENEMY_ID],
    ]);
    expect(floors.floors[0].enemyIds).toEqual([SLIME_ENEMY_ID]);
    expect(floors.floors.map((rule) => rule.itemIds)).toEqual([
      [POTION_ITEM_ID],
      [POTION_ITEM_ID, 'smoke_bomb'],
      ['swap_scroll'],
      [POTION_ITEM_ID, 'fire_seed'],
      ['warp_feather'],
    ]);
    expect(floors.floors.map((rule) => rule.maxTurns)).toEqual([48, 52, 56, 60, 64]);
    expect(floors.floors.map((rule) => rule.enemySpawnCount)).toEqual([
      1, 2, 2, 3, 2,
    ]);
    const spawnedEnemyIds = new Set(floors.floors.flatMap((rule) => rule.enemyIds));
    expect([...spawnedEnemyIds].sort()).toEqual(
      [...PHASE_09B_ENEMY_IDS].sort(),
    );
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
          validUse: 'hp_below_max',
          healAmount: 8,
          stackable: true,
          glyph: '!',
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
          glyph: 's',
          behavior: 'chase',
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
    const events = validateEventsBundle({
      schemaVersion: EVENTS_SCHEMA_VERSION,
      opening: { id: 'opening', text: 'Begin.' },
      ending: { id: 'ending', text: 'End.' },
      floorEvents: [],
      npcs: [],
      dialogueTrees: [],
    });

    expect(() => validateContentReferences({ items, enemies, floors, events })).toThrow(
      /unknown enemy id "phantom"/,
    );
  });
});
