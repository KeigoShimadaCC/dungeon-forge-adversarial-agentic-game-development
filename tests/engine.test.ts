import { describe, expect, it } from 'vitest';

import { getAvailableActions, start, step } from '../src/game/engine.js';
import { POTION_ITEM_ID } from '../src/game/content.js';
import { getReachableTiles, isWalkableTile } from '../src/game/map.js';
import type { GameState, PlayerAction, Position } from '../src/game/types.js';

function requireAction(
  state: GameState,
  predicate: (action: PlayerAction) => boolean,
): PlayerAction {
  const action = getAvailableActions(state).find(predicate);
  expect(action).toBeDefined();
  return action as PlayerAction;
}

function adjacentPositionFromMove(state: GameState): Position {
  const move = getAvailableActions(state).find((action) => action.type === 'move');
  const dx = typeof move?.payload?.dx === 'number' ? move.payload.dx : 1;
  const dy = typeof move?.payload?.dy === 'number' ? move.payload.dy : 0;
  return { x: state.player.x + dx, y: state.player.y + dy };
}

function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function findLinearPositionFromPlayer(
  state: GameState,
  steps: number,
): { position: Position; dx: number; dy: number } {
  const directions: Array<{ dx: number; dy: number }> = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  for (const direction of directions) {
    let valid = true;
    let final: Position = { ...state.player };
    for (let step = 1; step <= steps; step += 1) {
      const candidate = {
        x: state.player.x + direction.dx * step,
        y: state.player.y + direction.dy * step,
      };
      if (!isWalkableTile(state.map, candidate)) {
        valid = false;
        break;
      }
      final = candidate;
    }
    if (valid) {
      return { position: final, ...direction };
    }
  }

  throw new Error(`no linear walkable position found at distance ${steps}`);
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
  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      if (state.map.tiles[y]?.[x]?.type === 'stairs') {
        return { x, y };
      }
    }
  }
  throw new Error('stairs not found on map');
}

function movePlayerToStairs(state: GameState): GameState {
  const stairs = stairsPosition(state);
  const reachable = getReachableTiles(state.map, state.player);
  if (!reachable.some((position) => position.x === stairs.x && position.y === stairs.y)) {
    throw new Error('stairs unreachable in test setup');
  }

  return {
    ...state,
    player: {
      ...state.player,
      ...stairs,
    },
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
    expect(first.map.width).toBe(9);
    expect(first.map.height).toBe(9);
    expect(first.map.tiles[0].every((tile) => tile.type === 'wall')).toBe(true);
    expect(isWalkableTile(first.map, first.player)).toBe(true);
    expect(first.enemies).toHaveLength(1);
    expect(first.enemies[0].type).toBe('slime');
    expect(first.items).toHaveLength(1);
    expect(first.items[0].type).toBe(POTION_ITEM_ID);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it('moves the player to valid tiles through structured actions', () => {
    const state = start('move-seed');
    const move = requireAction(state, (action) => action.type === 'move');

    const result = step(state, move);

    expect(result.valid).toBe(true);
    expect(isWalkableTile(result.state.map, result.state.player)).toBe(true);
    expect(result.events.some((event) => event.type === 'move')).toBe(true);
  });

  it('does not expose wall movement and rejects wall moves safely', () => {
    const state = start('wall-seed');
    const actions = getAvailableActions(state);
    const blockedDirection = [
      { name: 'north', dx: 0, dy: -1 },
      { name: 'south', dx: 0, dy: 1 },
      { name: 'west', dx: -1, dy: 0 },
      { name: 'east', dx: 1, dy: 0 },
    ].find((direction) => !actions.some((action) => action.id === `move_${direction.name}`));

    expect(blockedDirection).toBeDefined();

    const invalidWallMove: PlayerAction = {
      id: `move_${blockedDirection?.name}`,
      type: 'move',
      label: `Move ${blockedDirection?.name} into a wall`,
      payload: { dx: blockedDirection?.dx ?? 0, dy: blockedDirection?.dy ?? 0 },
    };

    const result = step(state, invalidWallMove);

    expect(result.valid).toBe(false);
    expect(result.error).toContain(invalidWallMove.id);
    expect(result.state).toEqual(state);
  });

  it('uses canonical available-action payloads instead of caller mutations', () => {
    const state = start('payload-seed');
    const move = requireAction(state, (action) => action.type === 'move');
    const tamperedMove: PlayerAction = {
      ...move,
      payload: { dx: 99, dy: 0 },
    };

    const result = step(state, tamperedMove);

    expect(result.valid).toBe(true);
    expect(isWalkableTile(result.state.map, result.state.player)).toBe(true);
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
    const base = start('slime-seed');
    const state: GameState = {
      ...base,
      enemies: (() => {
        const adjacent = adjacentPositionFromMove(base);
        return [slimeAt(adjacent.x, adjacent.y)];
      })(),
      items: [],
    };
    const wait = requireAction(state, (action) => action.id === 'wait');

    const result = step(state, wait);

    expect(result.valid).toBe(true);
    expect(result.state.player.hp).toBe(18);
    expect(result.events.some((event) => event.type === 'enemy_attack')).toBe(true);
  });

  it('supports melee attacks that change enemy HP', () => {
    const base = start('combat-seed');
    const state: GameState = {
      ...base,
      enemies: (() => {
        const adjacent = adjacentPositionFromMove(base);
        return [slimeAt(adjacent.x, adjacent.y)];
      })(),
      items: [],
    };
    const attack = requireAction(state, (action) => action.type === 'attack');

    const result = step(state, attack);

    expect(result.valid).toBe(true);
    expect(result.state.enemies[0].hp).toBe(2);
    expect(result.events.some((event) => event.type === 'attack')).toBe(true);
  });

  it('applies enemy defense to player melee damage with a minimum of 1', () => {
    const base = start('shell-defense-seed');
    const adjacent = adjacentPositionFromMove(base);
    const state: GameState = {
      ...base,
      enemies: [
        enemyAt('shell', 'shell', adjacent.x, adjacent.y, {
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
    const base = start('potion-seed');
    const state: GameState = {
      ...base,
      enemies: [],
      items: [
        {
          id: 'potion-test',
          type: POTION_ITEM_ID,
          label: 'Healing Potion',
          glyph: '!',
          x: base.player.x,
          y: base.player.y,
        },
      ],
      player: {
        ...base.player,
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
    let state: GameState = {
      ...start('stairs-seed'),
      enemies: [],
      items: [],
    };

    for (let floor = 1; floor < 5; floor += 1) {
      state = movePlayerToStairs(state);
      const descend = requireAction(state, (action) => action.id === 'descend_stairs');
      state = step(state, descend).state;
      expect(state.floor).toBe(floor + 1);
      expect(state.terminalStatus).toBe('ACTIVE');
      expect(isWalkableTile(state.map, state.player)).toBe(true);
    }

    state = movePlayerToStairs(state);
    const finalDescend = requireAction(
      state,
      (action) => action.id === 'descend_stairs',
    );
    const result = step(state, finalDescend);

    expect(result.valid).toBe(true);
    expect(result.state.terminalStatus).toBe('WIN');
    expect(result.events.some((event) => event.type === 'win')).toBe(true);
  });

  it('produces LOSS when HP reaches zero', () => {
    const base = start('loss-seed');
    const state: GameState = {
      ...base,
      enemies: (() => {
        const adjacent = adjacentPositionFromMove(base);
        return [slimeAt(adjacent.x, adjacent.y)];
      })(),
      items: [],
      player: {
        ...base.player,
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
    const base = start('bat-seed');
    const linear = findLinearPositionFromPlayer(base, 2);
    const state: GameState = {
      ...base,
      enemies: [
        enemyAt('bat', 'bat', linear.position.x, linear.position.y, {
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

    expect(manhattanDistance(result.state.enemies[0], result.state.player)).toBe(1);
    expect(result.events.filter((event) => event.type === 'enemy_move').length).toBeGreaterThanOrEqual(1);
    expect(result.events.filter((event) => event.type === 'enemy_move').length).toBeLessThanOrEqual(2);
    expect(result.events.some((event) => event.type === 'enemy_attack')).toBe(false);
    expect(step(state, requireAction(state, (action) => action.id === 'wait')).state).toEqual(
      result.state,
    );
  });

  it('lets Shell wait at range and attack only when adjacent', () => {
    const base = start('shell-wait-seed');
    const linear = findLinearPositionFromPlayer(base, 3);
    const ranged: GameState = {
      ...base,
      enemies: [
        enemyAt('shell', 'shell', linear.position.x, linear.position.y, {
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
    expect(waited.state.enemies[0]).toMatchObject(linear.position);
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
      enemies: [
        {
          ...ranged.enemies[0],
          ...adjacentPositionFromMove(ranged),
        },
      ],
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
    const base = start('thief-seed');
    const linear = findLinearPositionFromPlayer(base, 3);
    const itemPosition = {
      x: linear.position.x - linear.dx,
      y: linear.position.y - linear.dy,
    };
    const state: GameState = {
      ...base,
      enemies: [
        enemyAt('thief', 'thief', linear.position.x, linear.position.y, {
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
          x: itemPosition.x,
          y: itemPosition.y,
        },
      ],
    };

    const moved = step(state, requireAction(state, (action) => action.id === 'wait'));
    expect(moved.state.enemies[0]).toMatchObject(itemPosition);
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
      enemies: [
        {
          ...state.enemies[0],
          ...adjacentPositionFromMove(state),
        },
      ],
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
    const base = start('ghost-seed');
    const linear = findLinearPositionFromPlayer(base, 2);
    const phaseDestination = {
      x: linear.position.x - linear.dx,
      y: linear.position.y - linear.dy,
    };
    const state: GameState = {
      ...base,
      enemies: [
        enemyAt('ghost', 'ghost', linear.position.x, linear.position.y, {
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
    state.map.tiles[phaseDestination.y][phaseDestination.x] = {
      type: 'wall',
      glyph: '#',
      walkable: false,
      description: 'interior test wall',
    };

    const result = step(state, requireAction(state, (action) => action.id === 'wait'));

    expect(result.state.enemies[0]).toMatchObject(phaseDestination);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'enemy_phase',
        payload: expect.objectContaining({
          enemyType: 'ghost',
          behavior: 'ghost',
          x: phaseDestination.x,
          y: phaseDestination.y,
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
      enemies: [
        {
          ...state.enemies[0],
          ...adjacentPositionFromMove(state),
        },
      ],
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
