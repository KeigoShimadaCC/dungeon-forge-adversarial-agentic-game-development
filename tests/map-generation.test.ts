import { describe, expect, it } from 'vitest';

import { loadGameContent } from '../src/game/content.js';
import {
  MAX_GENERATION_ATTEMPTS,
  chooseEntityPositions,
  createOpenInteriorFallback,
  generateFloorLayout,
  getReachableTiles,
  getTile,
  isReachableFrom,
  isWalkableTile,
  validateEnemyPositions,
  validateFloorLayout,
  validateItemPositions,
} from '../src/game/map.js';
import type { FloorRuleDefinition } from '../src/game/content.js';
import type { Position } from '../src/game/types.js';

const regressionSeeds = [
  'seed_001',
  'seed_002',
  'seed_003',
  'seed_004',
  'seed_005',
];

const floorRules = [...loadGameContent().floors.floors].sort(
  (left, right) => left.floor - right.floor,
);

const key = (position: Position): string => `${position.x},${position.y}`;

function layoutSignature(seed: string, rule: FloorRuleDefinition): string {
  const layout = generateFloorLayout({ seed, floor: rule.floor, rule });
  return JSON.stringify({
    tiles: layout.map.tiles.map((row) => row.map((tile) => tile.glyph).join('')),
    playerSpawn: layout.playerSpawn,
    stairs: layout.stairs,
    usedFallback: layout.usedFallback,
    attempt: layout.attempt,
  });
}

function placedEntities(seed: string, rule: FloorRuleDefinition): Position[] {
  const layout = generateFloorLayout({ seed, floor: rule.floor, rule });
  const occupied = new Set<string>([key(layout.playerSpawn), key(layout.stairs)]);
  const enemies = chooseEntityPositions({
    seed,
    floor: rule.floor,
    layout,
    count: rule.enemySpawnCount,
    occupied,
    slot: 'enemy',
    safeFromPlayer: true,
  });
  for (const position of enemies) {
    occupied.add(key(position));
  }
  const items = chooseEntityPositions({
    seed,
    floor: rule.floor,
    layout,
    count: rule.itemSpawnCount,
    occupied,
    slot: 'item',
  });
  return [...enemies, ...items];
}

describe('Phase 09C map generation', () => {
  it('generates identical layouts for the same seed and floor', () => {
    const rule = floorRules[3] as FloorRuleDefinition;

    expect(layoutSignature('seed_001', rule)).toBe(layoutSignature('seed_001', rule));
  });

  it('generates different layouts for different seeds', () => {
    const rule = floorRules[3] as FloorRuleDefinition;

    expect(layoutSignature('seed_001', rule)).not.toBe(
      layoutSignature('seed_002', rule),
    );
  });

  it('validates every canonical regression seed across every floor', () => {
    for (const seed of regressionSeeds) {
      for (const rule of floorRules) {
        const layout = generateFloorLayout({ seed, floor: rule.floor, rule });

        expect(validateFloorLayout(layout, rule)).toEqual({ valid: true });
        expect(layout.attempt).toBeLessThanOrEqual(MAX_GENERATION_ATTEMPTS);
      }
    }
  });

  it('keeps stairs reachable from the player spawn', () => {
    const rule = floorRules[4] as FloorRuleDefinition;
    const layout = generateFloorLayout({ seed: 'seed_004', floor: rule.floor, rule });

    expect(getTile(layout.map, layout.stairs)?.type).toBe('stairs');
    expect(isReachableFrom(layout.map, layout.playerSpawn, layout.stairs)).toBe(
      true,
    );
  });

  it('places player, enemies, items, and stairs on walkable reachable tiles', () => {
    const rule = floorRules[1] as FloorRuleDefinition;
    const layout = generateFloorLayout({ seed: 'seed_003', floor: rule.floor, rule });
    const occupied = new Set<string>([key(layout.playerSpawn), key(layout.stairs)]);
    const enemies = chooseEntityPositions({
      seed: 'seed_003',
      floor: rule.floor,
      layout,
      count: rule.enemySpawnCount,
      occupied,
      slot: 'enemy',
      safeFromPlayer: true,
    });
    for (const enemy of enemies) {
      occupied.add(key(enemy));
    }
    const items = chooseEntityPositions({
      seed: 'seed_003',
      floor: rule.floor,
      layout,
      count: rule.itemSpawnCount,
      occupied,
      slot: 'item',
    });

    expect(isWalkableTile(layout.map, layout.playerSpawn)).toBe(true);
    expect(isWalkableTile(layout.map, layout.stairs)).toBe(true);
    expect([...enemies, ...items]).toHaveLength(
      rule.enemySpawnCount + rule.itemSpawnCount,
    );
    expect(validateEnemyPositions({
      map: layout.map,
      playerSpawn: layout.playerSpawn,
      stairs: layout.stairs,
      positions: enemies,
    })).toEqual({ valid: true });
    expect(validateItemPositions({
      map: layout.map,
      playerSpawn: layout.playerSpawn,
      stairs: layout.stairs,
      positions: items,
      occupied: new Set(enemies.map(key)),
    })).toEqual({ valid: true });
  });

  it('does not overlap player, stairs, enemies, or items', () => {
    const rule = floorRules[0] as FloorRuleDefinition;
    const layout = generateFloorLayout({ seed: 'seed_005', floor: rule.floor, rule });
    const positions = [layout.playerSpawn, layout.stairs, ...placedEntities('seed_005', rule)];
    const unique = new Set(positions.map(key));

    expect(unique.size).toBe(positions.length);
  });

  it('uses a deterministic bounded fallback when procedural room placement fails', () => {
    const tinyRule: FloorRuleDefinition = {
      id: 'tiny-floor',
      floor: 99,
      width: 5,
      height: 5,
      enemyIds: ['slime'],
      itemIds: ['potion'],
      enemySpawnCount: 1,
      itemSpawnCount: 1,
      maxTurns: 10,
    };

    const generated = generateFloorLayout({
      seed: 'fallback-seed',
      floor: tinyRule.floor,
      rule: tinyRule,
    });
    const direct = createOpenInteriorFallback({
      seed: 'fallback-seed',
      floor: tinyRule.floor,
      rule: tinyRule,
    });

    expect(generated).toEqual(direct);
    expect(generated.usedFallback).toBe(true);
    expect(generated.attempt).toBe(MAX_GENERATION_ATTEMPTS);
    expect(validateFloorLayout(generated, tinyRule)).toEqual({ valid: true });
    expect(getReachableTiles(generated.map, generated.playerSpawn)).toHaveLength(9);
  });
});
