import { describe, expect, it } from 'vitest';

import { getAvailableActions, render, start, step } from '../src/game/engine.js';
import { eventSnapshot } from '../src/harness/types.js';
import type {
  GameEvent,
  GameState,
  PlayerAction,
  Position,
  StepResult,
} from '../src/game/types.js';

const cloneState = (state: GameState): GameState =>
  JSON.parse(JSON.stringify(state)) as GameState;

const requireAction = (
  state: GameState,
  predicate: (action: PlayerAction) => boolean,
): PlayerAction => {
  const action = getAvailableActions(state).find(predicate);
  expect(action).toBeDefined();
  return action as PlayerAction;
};

const stairsPosition = (state: GameState): Position => {
  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      if (state.map.tiles[y]?.[x]?.type === 'stairs') {
        return { x, y };
      }
    }
  }
  throw new Error('stairs not found');
};

const descendOneFloorResult = (state: GameState): StepResult => {
  const onStairs = {
    ...cloneState(state),
    player: {
      ...state.player,
      ...stairsPosition(state),
    },
    enemies: [],
  };
  return step(onStairs, requireAction(onStairs, (action) => action.id === 'descend_stairs'));
};

const descendOneFloor = (state: GameState): GameState => descendOneFloorResult(state).state;

const walkableAdjacentPosition = (state: GameState, target: Position): Position => {
  const candidates: Position[] = [
    { x: target.x + 1, y: target.y },
    { x: target.x - 1, y: target.y },
    { x: target.x, y: target.y + 1 },
    { x: target.x, y: target.y - 1 },
  ];
  const candidate = candidates.find((position) => {
    const tile = state.map.tiles[position.y]?.[position.x];
    return tile?.walkable === true && tile.type !== 'stairs';
  });
  if (!candidate) {
    throw new Error('no adjacent walkable tile for NPC');
  }
  return candidate;
};

const floorThreeWithAdjacentKeeper = (): GameState => {
  const floorTwo = descendOneFloor(start('phase-10a-dialogue-seed'));
  const floorThree = descendOneFloor(floorTwo);
  expect(floorThree.floor).toBe(3);
  expect(floorThree.npcs).toHaveLength(1);
  const keeper = floorThree.npcs[0];
  return {
    ...floorThree,
    player: {
      ...floorThree.player,
      ...walkableAdjacentPosition(floorThree, keeper),
    },
    enemies: [],
    items: [],
  };
};

describe('Phase 10A dialogue and events', () => {
  it('starts with deterministic opening narration and serializable narrative state', () => {
    const first = start('phase-10a-opening');
    const second = start('phase-10a-opening');

    expect(first).toEqual(second);
    expect(first.log[0]).toContain('The Dawn Bell tolls');
    expect(first.narrative).toEqual({ seenFloorEvents: [] });
    expect(first.npcs).toEqual([]);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it('places one reachable floor-three NPC without blocking normal actions before dialogue', () => {
    const state = floorThreeWithAdjacentKeeper();
    const actions = getAvailableActions(state);

    expect(getAvailableActions(start('phase-10a-no-npc')).some((action) =>
      action.id.startsWith('talk_npc_'),
    )).toBe(false);
    expect(actions.some((action) => action.type === 'move')).toBe(true);
    expect(actions.some((action) => action.id.startsWith('talk_npc_'))).toBe(true);
    expect(render(state)).toContain('K Keeper');
  });

  it.each(['seed_001', 'seed_002', 'seed_003', 'seed_004', 'seed_005'])(
    'places the floor-three NPC for canonical seed %s',
    (seed) => {
      const floorTwo = descendOneFloor(start(seed));
      const floorThree = descendOneFloor(floorTwo);

      expect(floorThree.floor).toBe(3);
      expect(floorThree.npcs).toEqual([
        expect.objectContaining({ npcId: 'shrine_keeper', glyph: 'K' }),
      ]);
    },
  );

  it('uses structured talk actions, records dialogue events, and always offers an exit', () => {
    const state = floorThreeWithAdjacentKeeper();
    const talk = requireAction(state, (action) => action.id.startsWith('talk_npc_'));
    const started = step(state, talk);

    expect(started.valid).toBe(true);
    expect(started.state.dialogue).toEqual(
      expect.objectContaining({
        active: true,
        npcId: 'shrine_keeper',
        treeId: 'keeper_dialogue',
        nodeId: 'greeting',
      }),
    );
    expect(started.events.map((event) => event.type)).toContain('dialogue_start');
    expect(started.events.map(eventSnapshot)).toEqual(started.events as GameEvent[]);

    const dialogueActions = getAvailableActions(started.state);
    expect(dialogueActions.every((action) => action.type === 'talk')).toBe(true);
    expect(dialogueActions.some((action) => action.type === 'move')).toBe(false);
    expect(dialogueActions.some((action) => action.id === 'wait')).toBe(false);
    expect(dialogueActions.map((action) => action.id)).toEqual(
      expect.arrayContaining(['talk_choice_ask_bell', 'talk_exit']),
    );

    const choice = requireAction(
      started.state,
      (action) => action.id === 'talk_choice_ask_bell',
    );
    const afterChoice = step(started.state, choice);
    expect(afterChoice.state.dialogue?.nodeId).toBe('bell_lore');
    expect(afterChoice.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['dialogue_choice', 'dialogue_node']),
    );

    const exit = requireAction(afterChoice.state, (action) => action.id === 'talk_exit');
    const afterExit = step(afterChoice.state, exit);
    expect(afterExit.state.dialogue).toBeUndefined();
    expect(afterExit.events.map((event) => event.type)).toContain('dialogue_exit');
    expect(getAvailableActions(afterExit.state).some((action) => action.type === 'move')).toBe(
      true,
    );
  });

  it('supports exit choices without requiring the generic dialogue exit action', () => {
    const state = floorThreeWithAdjacentKeeper();
    const started = step(
      state,
      requireAction(state, (action) => action.id.startsWith('talk_npc_')),
    ).state;
    const farewell = requireAction(
      started,
      (action) => action.id === 'talk_choice_farewell',
    );
    const result = step(started, farewell);

    expect(result.state.dialogue).toBeUndefined();
    expect(result.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['dialogue_choice', 'dialogue_exit']),
    );
  });

  it('keeps the ending reachable after optional dialogue choices', () => {
    const state = floorThreeWithAdjacentKeeper();
    const started = step(
      state,
      requireAction(state, (action) => action.id.startsWith('talk_npc_')),
    ).state;
    const afterChoice = step(
      started,
      requireAction(started, (action) => action.id === 'talk_choice_ask_bell'),
    ).state;
    const afterExit = step(
      afterChoice,
      requireAction(afterChoice, (action) => action.id === 'talk_exit'),
    ).state;

    const floorFour = descendOneFloor(afterExit);
    const floorFive = descendOneFloor(floorFour);
    const win = descendOneFloor(floorFive);

    expect(win.terminalStatus).toBe('WIN');
    expect(win.log.some((entry) => entry.includes('You lift the Dawn Bell'))).toBe(true);
  });

  it('fires one-time floor events and preserves narrative through descent', () => {
    const floorTwo = descendOneFloor(start('phase-10a-floor-event'));
    const floorThree = descendOneFloor(floorTwo);
    const floorFourResult = descendOneFloorResult(floorThree);
    const floorFour = floorFourResult.state;
    const floorFive = descendOneFloor(floorFour);

    expect(floorFour.floor).toBe(4);
    expect(floorFourResult.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['descend', 'floor_event']),
    );
    expect(floorFour.narrative.seenFloorEvents).toEqual([
      'floor-4-morning-pulse',
    ]);
    expect(floorFour.log.some((entry) => entry.includes('morning light'))).toBe(
      true,
    );
    expect(floorFive.narrative.seenFloorEvents).toEqual([
      'floor-4-morning-pulse',
    ]);
  });
});
