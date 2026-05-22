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

function slimeAt(x: number, y: number): GameState['enemies'][number] {
  return {
    id: 'slime-test',
    type: 'slime',
    label: 'Green Slime',
    hp: 6,
    maxHp: 6,
    attack: 2,
    glyph: 's',
    x,
    y,
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
