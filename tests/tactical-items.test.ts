import { describe, expect, it } from 'vitest';

import {
  FIRE_SEED_ITEM_ID,
  loadGameContent,
  POTION_ITEM_ID,
  SMOKE_BOMB_ITEM_ID,
  SWAP_SCROLL_ITEM_ID,
  WARP_FEATHER_ITEM_ID,
} from '../src/game/content.js';
import { getAvailableActions, start, step } from '../src/game/engine.js';
import { chooseWarpDestination } from '../src/game/item-effects.js';
import { getReachableTiles } from '../src/game/map.js';
import type { GameState, PlayerAction } from '../src/game/types.js';

function requireAction(
  state: GameState,
  predicate: (action: PlayerAction) => boolean,
): PlayerAction {
  const action = getAvailableActions(state).find(predicate);
  expect(action).toBeDefined();
  return action as PlayerAction;
}

function slimeAt(x: number, y: number): GameState['enemies'][number] {
  return {
    id: 'slime-test',
    type: 'slime',
    label: 'Green Slime',
    hp: 6,
    maxHp: 6,
    attack: 2,
    defense: 0,
    behavior: 'chase',
    glyph: 's',
    x,
    y,
  };
}

function reachableTileAtDistance(state: GameState, distance: number): { x: number; y: number } {
  const tile = getReachableTiles(state.map, state.player)
    .filter(
      (position) =>
        Math.abs(position.x - state.player.x) + Math.abs(position.y - state.player.y) ===
        distance,
    )
    .sort((a, b) => a.x - b.x || a.y - b.y)[0];
  expect(tile).toBeDefined();
  return tile;
}

describe('Phase 09A tactical items', () => {
  it('loads tactical item content with stable metadata', () => {
    const { items, floors } = loadGameContent();

    expect(items.items).toHaveLength(5);
    expect(items.items.map((item) => item.id)).toEqual([
      POTION_ITEM_ID,
      SMOKE_BOMB_ITEM_ID,
      SWAP_SCROLL_ITEM_ID,
      FIRE_SEED_ITEM_ID,
      WARP_FEATHER_ITEM_ID,
    ]);
    expect(items.items.every((item) => item.validUse.length > 0)).toBe(true);
    expect(items.items.every((item) => item.description.length > 0)).toBe(true);
    expect(floors.floors[1].itemIds).toContain(SMOKE_BOMB_ITEM_ID);
  });

  it('preserves potion availability and caps healing at max HP', () => {
    const base = start('potion-valid-use');
    const fullHp: GameState = {
      ...base,
      enemies: [],
      items: [],
      player: { ...base.player, hp: base.player.maxHp, inventory: [POTION_ITEM_ID] },
    };
    const fullHpUse = requireAction(
      fullHp,
      (action) => action.id === `use_${POTION_ITEM_ID}`,
    );
    const fullHpResult = step(fullHp, fullHpUse);
    expect(fullHpResult.valid).toBe(true);
    expect(fullHpResult.state.player.hp).toBe(base.player.maxHp);
    expect(fullHpResult.state.player.inventory).toEqual([]);

    const hurt: GameState = {
      ...fullHp,
      player: { ...fullHp.player, hp: 10 },
    };
    const usePotion = requireAction(
      hurt,
      (action) => action.id === `use_${POTION_ITEM_ID}`,
    );
    expect(usePotion.payload).toMatchObject({
      itemType: POTION_ITEM_ID,
      effect: 'heal',
    });
  });

  it('smoke bomb blinds enemy pursuit for three turns', () => {
    const base = start('smoke-bomb-seed');
    const enemyPosition = reachableTileAtDistance(base, 2);
    const enemy = slimeAt(enemyPosition.x, enemyPosition.y);
    const state: GameState = {
      ...base,
      enemies: [enemy],
      items: [],
      player: { ...base.player, inventory: [SMOKE_BOMB_ITEM_ID] },
    };

    const useSmoke = requireAction(
      state,
      (action) => action.id === `use_${SMOKE_BOMB_ITEM_ID}`,
    );
    const smoked = step(state, useSmoke);
    expect(smoked.valid).toBe(true);
    expect(smoked.state.player.inventory).toEqual([]);
    const useEvent = smoked.events.find((entry) => entry.type === 'use_item');
    expect(useEvent?.payload).toMatchObject({
      itemType: SMOKE_BOMB_ITEM_ID,
      effect: 'blind_enemies',
      duration: 3,
    });

    const wait = requireAction(smoked.state, (action) => action.id === 'wait');
    const afterWait = step(smoked.state, wait);
    expect(afterWait.events.some((entry) => entry.payload?.reason === 'blinded')).toBe(
      true,
    );
    expect(afterWait.events.some((entry) => entry.type === 'enemy_move')).toBe(false);
  });

  it('swap scroll swaps player and target enemy positions', () => {
    const base = start('swap-scroll-seed');
    const enemyPosition = reachableTileAtDistance(base, 2);
    const enemy = {
      ...slimeAt(enemyPosition.x, enemyPosition.y),
      behavior: 'shell' as const,
    };
    const state: GameState = {
      ...base,
      enemies: [enemy],
      items: [],
      player: { ...base.player, inventory: [SWAP_SCROLL_ITEM_ID] },
    };
    const playerBefore = { x: state.player.x, y: state.player.y };
    const enemyBefore = { x: enemy.x, y: enemy.y };

    const useSwap = requireAction(
      state,
      (action) => action.id === `use_${SWAP_SCROLL_ITEM_ID}_${enemy.id}`,
    );
    const swapped = step(state, useSwap);

    expect(swapped.valid).toBe(true);
    expect(swapped.state.player).toMatchObject(enemyBefore);
    expect(swapped.state.enemies[0]).toMatchObject(playerBefore);
    expect(swapped.events.find((entry) => entry.type === 'use_item')?.payload).toMatchObject({
      itemType: SWAP_SCROLL_ITEM_ID,
      effect: 'swap_position',
      targetId: enemy.id,
    });
  });

  it('fire seed damages enemies within range', () => {
    const base = start('fire-seed-seed');
    const nearPosition = reachableTileAtDistance(base, 2);
    const farPosition = reachableTileAtDistance(base, 4);
    const near = slimeAt(nearPosition.x, nearPosition.y);
    const far = slimeAt(farPosition.x, farPosition.y);
    const state: GameState = {
      ...base,
      enemies: [
        { ...near, id: 'slime-near', hp: 3, maxHp: 3 },
        { ...far, id: 'slime-far', hp: 6, maxHp: 6 },
      ],
      items: [],
      player: { ...base.player, inventory: [FIRE_SEED_ITEM_ID] },
    };

    const useFire = requireAction(
      state,
      (action) => action.id === `use_${FIRE_SEED_ITEM_ID}`,
    );
    const burned = step(state, useFire);

    expect(burned.valid).toBe(true);
    expect(burned.state.enemies).toHaveLength(1);
    expect(burned.state.enemies[0].id).toBe('slime-far');
    expect(burned.events.find((entry) => entry.type === 'use_item')?.payload).toMatchObject({
      itemType: FIRE_SEED_ITEM_ID,
      effect: 'area_damage',
      targetsHit: 1,
    });
  });

  it('warp feather teleports to a deterministic safer tile', () => {
    const base = start('warp-feather-seed');
    const enemyPosition = reachableTileAtDistance(base, 1);
    const enemy = slimeAt(enemyPosition.x, enemyPosition.y);
    const state: GameState = {
      ...base,
      enemies: [enemy],
      items: [],
      player: { ...base.player, inventory: [WARP_FEATHER_ITEM_ID] },
    };
    const destination = chooseWarpDestination(state, 3);
    expect(destination).toBeDefined();

    const useWarp = requireAction(
      state,
      (action) => action.id === `use_${WARP_FEATHER_ITEM_ID}`,
    );
    expect(useWarp.payload).toMatchObject({
      itemType: WARP_FEATHER_ITEM_ID,
      effect: 'warp',
      x: destination?.x,
      y: destination?.y,
    });

    const warped = step(state, useWarp);
    expect(warped.valid).toBe(true);
    expect(warped.state.player).toMatchObject({
      x: destination?.x,
      y: destination?.y,
    });
    expect(warped.events.find((entry) => entry.type === 'use_item')?.payload).toMatchObject({
      itemType: WARP_FEATHER_ITEM_ID,
      effect: 'warp',
    });
  });

  it('rejects unavailable use_item actions', () => {
    const base = start('invalid-use-item');
    const state: GameState = {
      ...base,
      enemies: [],
      items: [],
      player: { ...base.player, inventory: [SMOKE_BOMB_ITEM_ID] },
    };

    const result = step(state, {
      id: `use_${SMOKE_BOMB_ITEM_ID}`,
      type: 'use_item',
      label: 'Invalid smoke use',
      payload: { itemType: SMOKE_BOMB_ITEM_ID, effect: 'blind_enemies' },
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('not available');
  });

  it('remains reproducible for the same seed', () => {
    const first = start('seed_003');
    const second = start('seed_003');
    expect(second).toEqual(first);
  });
});
