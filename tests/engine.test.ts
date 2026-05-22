import { describe, expect, it } from 'vitest';

import { getAvailableActions, start, step } from '../src/game/engine.js';
import { POTION_ITEM_ID } from '../src/game/content.js';
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

function enemyAt(
  type: GameState['enemies'][number]['type'],
  behavior: GameState['enemies'][number]['behavior'],
  x: number,
  y: number,
  overrides: Partial<GameState['enemies'][number]> = {},
): GameState['enemies'][number] {
  return {
    id: `${type}-test`,
    type,
    label: type,
    hp: 6,
    maxHp: 6,
    attack: 1,
    defense: 0,
    behavior,
    glyph: type === 'shell' ? 'S' : type[0],
    x,
    y,
    ...overrides,
  };
}

function stairsPosition(state: GameState): { x: number; y: number } {
  return {
    x: state.map.width - 2,
    y: state.map.height - 2,
  };
}

describe('Phase 03A minimal dungeon', () => {
  it('starts a deterministic finite dungeon from a seed', () => {
    const first = start('seed_001');
    const second = start('seed_001');

    expect(second).toEqual(first);
    expect(first.version).toBe('0.3.0-minimal-dungeon');
    expect(first.floor).toBe(1);
    expect(first.meta.totalFloors).toBe(5);
    expect(first.map.width).toBe(8);
    expect(first.map.height).toBe(8);
    expect(first.map.tiles[0].every((tile) => tile.type === 'wall')).toBe(true);
    expect(first.enemies).toHaveLength(1);
    expect(first.enemies[0].type).toBe('slime');
    expect(first.items).toHaveLength(1);
    expect(first.items[0].type).toBe(POTION_ITEM_ID);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it('moves the player to valid tiles through structured actions', () => {
    const state = start('move-seed');
    const moveEast = requireAction(state, (action) => action.id === 'move_east');

    const result = step(state, moveEast);

    expect(result.valid).toBe(true);
    expect(result.state.player.x).toBe(2);
    expect(result.state.player.y).toBe(1);
    expect(result.events.some((event) => event.type === 'move')).toBe(true);
  });

  it('does not expose wall movement and rejects wall moves safely', () => {
    const state = start('wall-seed');
    const actions = getAvailableActions(state);

    expect(actions.some((action) => action.id === 'move_west')).toBe(false);

    const invalidWallMove: PlayerAction = {
      id: 'move_west',
      type: 'move',
      label: 'Move west into a wall',
      payload: { dx: -1, dy: 0 },
    };

    const result = step(state, invalidWallMove);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('move_west');
    expect(result.state).toEqual(state);
  });

  it('uses canonical available-action payloads instead of caller mutations', () => {
    const state = start('payload-seed');
    const moveEast = requireAction(state, (action) => action.id === 'move_east');
    const tamperedMove: PlayerAction = {
      ...moveEast,
      payload: { dx: 99, dy: 0 },
    };

    const result = step(state, tamperedMove);

    expect(result.valid).toBe(true);
    expect(result.state.player.x).toBe(2);
    expect(result.state.player.y).toBe(1);
  });

  it('returns invalid StepResult errors instead of throwing', () => {
    const invalidAction: PlayerAction = {
      id: 'free_text_command',
      type: 'inspect',
      label: 'Invent a free text command',
      payload: { command: 'open-ended text' },
    };

    expect(() => step(start('invalid-seed'), invalidAction)).not.toThrow();

    const result = step(start('invalid-seed'), invalidAction);
    expect(result.valid).toBe(false);
    expect(result.events).toEqual([]);
    expect(result.state.terminalStatus).toBe('ACTIVE');
  });

  it('aborts when active state has an impossible player position', () => {
    const state: GameState = {
      ...start('invalid-position-seed'),
      player: {
        ...start('invalid-position-seed').player,
        x: 0,
        y: 0,
      },
    };

    const result = step(state, {
      id: 'wait',
      type: 'wait',
      label: 'Wait',
    });

    expect(result.valid).toBe(true);
    expect(result.state.terminalStatus).toBe('ABORTED');
    expect(result.events).toEqual([
      expect.objectContaining({
        type: 'invalid_state',
        message: expect.stringContaining('player is not on a walkable tile'),
      }),
    ]);
    expect(getAvailableActions(result.state)).toEqual([]);
  });

  it('aborts when active state has malformed map dimensions', () => {
    const state: GameState = {
      ...start('invalid-map-seed'),
      map: {
        ...start('invalid-map-seed').map,
        width: 99,
      },
    };

    const result = step(state, {
      id: 'wait',
      type: 'wait',
      label: 'Wait',
    });

    expect(result.valid).toBe(true);
    expect(result.state.terminalStatus).toBe('ABORTED');
    expect(result.events[0]?.type).toBe('invalid_state');
    expect(result.events[0]?.message).toContain('map dimensions');
  });

  it('lets Slime act and damage the player', () => {
    const state: GameState = {
      ...start('slime-seed'),
      enemies: [slimeAt(2, 1)],
      items: [],
    };
    const wait = requireAction(state, (action) => action.id === 'wait');

    const result = step(state, wait);

    expect(result.valid).toBe(true);
    expect(result.state.player.hp).toBe(18);
    expect(result.events.some((event) => event.type === 'enemy_attack')).toBe(true);
  });

  it('supports melee attacks that change enemy HP', () => {
    const state: GameState = {
      ...start('combat-seed'),
      enemies: [slimeAt(2, 1)],
      items: [],
    };
    const attack = requireAction(state, (action) => action.type === 'attack');

    const result = step(state, attack);

    expect(result.valid).toBe(true);
    expect(result.state.enemies[0].hp).toBe(2);
    expect(result.events.some((event) => event.type === 'attack')).toBe(true);
  });

  it('applies enemy defense to player melee damage with a minimum of 1', () => {
    const state: GameState = {
      ...start('shell-defense-seed'),
      enemies: [
        enemyAt('shell', 'shell', 2, 1, {
          id: 'shell-test',
          label: 'Stone Shell',
          hp: 8,
          maxHp: 8,
          attack: 2,
          defense: 2,
          glyph: 'S',
        }),
      ],
      items: [],
    };
    const attack = requireAction(state, (action) => action.type === 'attack');

    const result = step(state, attack);

    expect(result.valid).toBe(true);
    expect(result.state.enemies[0].hp).toBe(6);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'attack',
        payload: expect.objectContaining({
          targetId: 'shell-test',
          enemyType: 'shell',
          damage: 2,
        }),
      }),
    );

    const minimumDamageState: GameState = {
      ...state,
      enemies: [
        {
          ...state.enemies[0],
          defense: 99,
          hp: 8,
        },
      ],
    };
    const minimumResult = step(
      minimumDamageState,
      requireAction(minimumDamageState, (action) => action.type === 'attack'),
    );
    expect(minimumResult.state.enemies[0].hp).toBe(7);
  });

  it('supports Potion pickup and use without overhealing', () => {
    const state: GameState = {
      ...start('potion-seed'),
      enemies: [],
      items: [
        {
          id: 'potion-test',
          type: POTION_ITEM_ID,
          label: 'Healing Potion',
          glyph: '!',
          x: 1,
          y: 1,
        },
      ],
      player: {
        ...start('potion-seed').player,
        hp: 15,
      },
    };
    const pickup = requireAction(state, (action) => action.type === 'pickup');

    const pickedUp = step(state, pickup).state;
    const usePotion = requireAction(
      pickedUp,
      (action) => action.id === `use_${POTION_ITEM_ID}`,
    );
    const result = step(pickedUp, usePotion);

    expect(result.valid).toBe(true);
    expect(result.state.player.hp).toBe(20);
    expect(result.state.player.inventory).toEqual([]);
    expect(result.events.some((event) => event.type === 'use_item')).toBe(true);
  });

  it('descends stairs and wins from the final floor', () => {
    const floorOne: GameState = {
      ...start('stairs-seed'),
      enemies: [],
      items: [],
    };
    floorOne.player = {
      ...floorOne.player,
      ...stairsPosition(floorOne),
    };
    const descendFloorOne = requireAction(
      floorOne,
      (action) => action.id === 'descend_stairs',
    );

    const floorTwo = step(floorOne, descendFloorOne).state;

    expect(floorTwo.terminalStatus).toBe('ACTIVE');
    expect(floorTwo.floor).toBe(2);
    expect(floorTwo.player.x).toBe(1);
    expect(floorTwo.player.y).toBe(1);

    const finalFloor: GameState = {
      ...floorOne,
      floor: 5,
      player: {
        ...floorOne.player,
        ...stairsPosition(floorOne),
      },
    };
    const finalDescend = requireAction(
      finalFloor,
      (action) => action.id === 'descend_stairs',
    );
    const result = step(finalFloor, finalDescend);

    expect(result.valid).toBe(true);
    expect(result.state.terminalStatus).toBe('WIN');
    expect(result.events.some((event) => event.type === 'win')).toBe(true);
  });

  it('produces LOSS when HP reaches zero', () => {
    const state: GameState = {
      ...start('loss-seed'),
      enemies: [slimeAt(2, 1)],
      items: [],
      player: {
        ...start('loss-seed').player,
        hp: 1,
      },
    };
    const wait = requireAction(state, (action) => action.id === 'wait');

    const result = step(state, wait);

    expect(result.state.terminalStatus).toBe('LOSS');
    expect(result.events.some((event) => event.type === 'loss')).toBe(true);
    expect(getAvailableActions(result.state)).toEqual([]);
  });

  it('spawns every Phase 09B enemy by configured floor and remains deterministic', () => {
    const state = start('spawn-variety-seed');
    let current = state;
    const seen = new Set(current.enemies.map((enemy) => enemy.type));
    const snapshots = [
      current.enemies.map((enemy) => ({
        id: enemy.id,
        type: enemy.type,
        behavior: enemy.behavior,
        glyph: enemy.glyph,
        x: enemy.x,
        y: enemy.y,
      })),
    ];

    for (let floor = 2; floor <= current.meta.totalFloors; floor += 1) {
      const descending: GameState = {
        ...current,
        enemies: [],
        items: [],
        player: {
          ...current.player,
          ...stairsPosition(current),
        },
      };
      current = step(
        descending,
        requireAction(descending, (action) => action.id === 'descend_stairs'),
      ).state;
      for (const enemy of current.enemies) {
        seen.add(enemy.type);
      }
      snapshots.push(
        current.enemies.map((enemy) => ({
          id: enemy.id,
          type: enemy.type,
          behavior: enemy.behavior,
          glyph: enemy.glyph,
          x: enemy.x,
          y: enemy.y,
        })),
      );
      expect(current.floor).toBe(floor);
    }

    expect([...seen].sort()).toEqual(['bat', 'ghost', 'shell', 'slime', 'thief']);

    let repeated = start('spawn-variety-seed');
    const repeatedSnapshots = [
      repeated.enemies.map((enemy) => ({
        id: enemy.id,
        type: enemy.type,
        behavior: enemy.behavior,
        glyph: enemy.glyph,
        x: enemy.x,
        y: enemy.y,
      })),
    ];
    for (let floor = 2; floor <= repeated.meta.totalFloors; floor += 1) {
      const descending: GameState = {
        ...repeated,
        enemies: [],
        items: [],
        player: {
          ...repeated.player,
          ...stairsPosition(repeated),
        },
      };
      repeated = step(
        descending,
        requireAction(descending, (action) => action.id === 'descend_stairs'),
      ).state;
      repeatedSnapshots.push(
        repeated.enemies.map((enemy) => ({
          id: enemy.id,
          type: enemy.type,
          behavior: enemy.behavior,
          glyph: enemy.glyph,
          x: enemy.x,
          y: enemy.y,
        })),
      );
    }
    expect(repeatedSnapshots).toEqual(snapshots);
  });

  it('lets Bat move up to two deterministic chase steps without a same-turn post-move attack', () => {
    const state: GameState = {
      ...start('bat-seed'),
      enemies: [
        enemyAt('bat', 'bat', 4, 1, {
          id: 'bat-test',
          label: 'Cave Bat',
          hp: 4,
          maxHp: 4,
          glyph: 'b',
        }),
      ],
      items: [],
    };

    const result = step(state, requireAction(state, (action) => action.id === 'wait'));

    expect(result.state.enemies[0]).toMatchObject({ x: 2, y: 1 });
    expect(result.events.filter((event) => event.type === 'enemy_move')).toHaveLength(2);
    expect(result.events.some((event) => event.type === 'enemy_attack')).toBe(false);
    expect(step(state, requireAction(state, (action) => action.id === 'wait')).state).toEqual(
      result.state,
    );
  });

  it('lets Shell wait at range and attack only when adjacent', () => {
    const ranged: GameState = {
      ...start('shell-wait-seed'),
      enemies: [
        enemyAt('shell', 'shell', 4, 1, {
          id: 'shell-test',
          label: 'Stone Shell',
          attack: 2,
          defense: 2,
          glyph: 'S',
        }),
      ],
      items: [],
    };

    const waited = step(ranged, requireAction(ranged, (action) => action.id === 'wait'));
    expect(waited.state.enemies[0]).toMatchObject({ x: 4, y: 1 });
    expect(waited.events).toContainEqual(
      expect.objectContaining({
        type: 'enemy_wait',
        payload: expect.objectContaining({
          enemyType: 'shell',
          behavior: 'shell',
          reason: 'not_adjacent',
        }),
      }),
    );

    const adjacent: GameState = {
      ...ranged,
      enemies: [{ ...ranged.enemies[0], x: 2, y: 1 }],
    };
    const attacked = step(adjacent, requireAction(adjacent, (action) => action.id === 'wait'));
    expect(attacked.state.player.hp).toBe(18);
    expect(attacked.events).toContainEqual(
      expect.objectContaining({
        type: 'enemy_attack',
        payload: expect.objectContaining({
          enemyType: 'shell',
          behavior: 'shell',
          damage: 2,
        }),
      }),
    );
  });

  it('lets Thief seek and steal the nearest loose item before pursuing weakly', () => {
    const state: GameState = {
      ...start('thief-seed'),
      enemies: [
        enemyAt('thief', 'thief', 4, 1, {
          id: 'thief-test',
          label: 'Dungeon Thief',
          hp: 5,
          maxHp: 5,
          glyph: 't',
        }),
      ],
      items: [
        {
          id: 'potion-near',
          type: POTION_ITEM_ID,
          label: 'Healing Potion',
          glyph: '!',
          x: 3,
          y: 1,
        },
      ],
    };

    const moved = step(state, requireAction(state, (action) => action.id === 'wait'));
    expect(moved.state.enemies[0]).toMatchObject({ x: 3, y: 1 });
    expect(moved.state.items).toHaveLength(1);

    const stole = step(moved.state, requireAction(moved.state, (action) => action.id === 'wait'));
    expect(stole.state.items).toEqual([]);
    expect(stole.events).toContainEqual(
      expect.objectContaining({
        type: 'enemy_steal',
        payload: expect.objectContaining({
          enemyType: 'thief',
          behavior: 'thief',
          itemId: 'potion-near',
          reason: 'on_item',
        }),
      }),
    );

    const adjacentNoItems: GameState = {
      ...state,
      enemies: [{ ...state.enemies[0], x: 2, y: 1 }],
      items: [],
    };
    const attacked = step(
      adjacentNoItems,
      requireAction(adjacentNoItems, (action) => action.id === 'wait'),
    );
    expect(attacked.state.player.hp).toBe(19);
    expect(attacked.events).toContainEqual(
      expect.objectContaining({
        type: 'enemy_attack',
        payload: expect.objectContaining({
          enemyType: 'thief',
          behavior: 'thief',
          damage: 1,
        }),
      }),
    );
  });

  it('lets Ghost phase through bounded interior walls deterministically', () => {
    const state: GameState = {
      ...start('ghost-seed'),
      enemies: [
        enemyAt('ghost', 'ghost', 3, 1, {
          id: 'ghost-test',
          label: 'Wandering Ghost',
          hp: 5,
          maxHp: 5,
          attack: 2,
          glyph: 'g',
        }),
      ],
      items: [],
    };
    state.map.tiles[1][2] = {
      type: 'wall',
      glyph: '#',
      walkable: false,
      description: 'interior test wall',
    };

    const result = step(state, requireAction(state, (action) => action.id === 'wait'));

    expect(result.state.enemies[0]).toMatchObject({ x: 2, y: 1 });
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'enemy_phase',
        payload: expect.objectContaining({
          enemyType: 'ghost',
          behavior: 'ghost',
          x: 2,
          y: 1,
          reason: 'phase',
        }),
      }),
    );
    expect(step(state, requireAction(state, (action) => action.id === 'wait')).state).toEqual(
      result.state,
    );

    const blockedBoundary: GameState = {
      ...state,
      enemies: [{ ...state.enemies[0], x: 1, y: 1 }],
      player: { ...state.player, x: 3, y: 1 },
    };
    const boundaryResult = step(
      blockedBoundary,
      requireAction(blockedBoundary, (action) => action.id === 'wait'),
    );
    expect(boundaryResult.state.enemies[0].x).toBeGreaterThan(0);
    expect(boundaryResult.state.enemies[0].y).toBeGreaterThan(0);
    expect(boundaryResult.state.enemies[0].x).toBeLessThan(
      boundaryResult.state.map.width - 1,
    );
    expect(boundaryResult.state.enemies[0].y).toBeLessThan(
      boundaryResult.state.map.height - 1,
    );
    expect(boundaryResult.state.enemies[0]).not.toMatchObject(boundaryResult.state.player);

    const adjacent: GameState = {
      ...state,
      enemies: [{ ...state.enemies[0], x: 2, y: 1 }],
    };
    const attacked = step(adjacent, requireAction(adjacent, (action) => action.id === 'wait'));
    expect(attacked.state.player.hp).toBe(18);
    expect(attacked.events).toContainEqual(
      expect.objectContaining({
        type: 'enemy_attack',
        payload: expect.objectContaining({
          enemyType: 'ghost',
          behavior: 'ghost',
          damage: 2,
        }),
      }),
    );
  });

  it('preserves max-turn ABORTED terminal behavior', () => {
    const state: GameState = {
      ...start('abort-seed', { maxTurns: 1 }),
      enemies: [],
      items: [],
    };
    const wait = requireAction(state, (action) => action.id === 'wait');

    const result = step(state, wait);

    expect(result.valid).toBe(true);
    expect(result.state.terminalStatus).toBe('ABORTED');
    expect(result.events.some((event) => event.type === 'aborted')).toBe(true);
    expect(getAvailableActions(result.state)).toEqual([]);
  });

});
