import { describe, expect, it } from 'vitest';

import { getAvailableActions, render, start } from '../src/game/engine.js';
import { POTION_ITEM_ID } from '../src/game/content.js';
import {
  TERMINAL_STATUSES,
  type GameState,
  type PlayerAction,
} from '../src/game/types.js';
import {
  CANONICAL_REGRESSION_SEEDS,
  cautiousLowHp,
  createRandomValidActionPolicy,
  findStairsPosition,
  greedyItemPicker,
  manhattanDistance,
  randomValidAction,
  runBaselinePolicyPlaythrough,
  stairsSeeking,
  type BaselinePlayerPolicy,
} from '../src/harness/baseline-players/index.js';

const BASELINE_POLICIES: BaselinePlayerPolicy[] = [
  randomValidAction,
  stairsSeeking,
  cautiousLowHp,
  greedyItemPicker,
];

function snapshotInput(state: GameState): {
  stateJson: string;
  actionsJson: string;
} {
  const availableActions = getAvailableActions(state);
  return {
    stateJson: JSON.stringify(state),
    actionsJson: JSON.stringify(availableActions),
  };
}

function policyChoiceFromActions(
  state: GameState,
  policy: BaselinePlayerPolicy,
  availableActions: PlayerAction[],
): PlayerAction {
  return policy({
    state,
    renderedState: render(state),
    availableActions,
    turn: state.turn,
  });
}

function emptyActiveState(seed: string): GameState {
  return {
    ...start(seed),
    enemies: [],
    items: [],
  };
}

function choose(policy: BaselinePlayerPolicy, state: GameState): PlayerAction {
  return policyChoiceFromActions(state, policy, getAvailableActions(state));
}

describe('Phase 04B baseline players', () => {
  it('returns an available action for each policy on an active game state', () => {
    const state = start('seed_001');

    for (const policy of BASELINE_POLICIES) {
      const availableActions = getAvailableActions(state);
      const choice = policyChoiceFromActions(state, policy, availableActions);
      expect(availableActions.find((action) => action === choice)).toBe(choice);
      expect(
        availableActions.some(
          (action) => action.id === choice.id && action.type === choice.type,
        ),
      ).toBe(true);
    }
  });

  it('does not mutate input state or the available action list', () => {
    const state = start('seed_002');

    for (const policy of BASELINE_POLICIES) {
      const before = snapshotInput(state);
      const availableActions = getAvailableActions(state);
      const actionRefs = [...availableActions];

      policy({
        state,
        renderedState: render(state),
        availableActions,
        turn: state.turn,
      });

      expect(snapshotInput(state)).toEqual(before);
      expect(availableActions).toHaveLength(actionRefs.length);
      for (let index = 0; index < availableActions.length; index += 1) {
        expect(availableActions[index]).toBe(actionRefs[index]);
        expect(availableActions[index]).toEqual(actionRefs[index]);
      }
    }
  });

  it('produces reproducible random choices for a fixed policy seed', () => {
    const state = start('seed_003');
    const policyA = createRandomValidActionPolicy('policy-fixed');
    const policyB = createRandomValidActionPolicy('policy-fixed');

    const input = {
      state,
      renderedState: render(state),
      availableActions: getAvailableActions(state),
      turn: state.turn,
    };

    expect(policyA(input).id).toBe(policyB(input).id);
    expect(policyA(input).type).toBe(policyB(input).type);

    const repeats = Array.from({ length: 6 }, () => policyA(input).id);
    expect(new Set(repeats).size).toBe(1);
  });

  it('stairsSeeking descends when possible and otherwise moves closer to stairs', () => {
    const onStairs = emptyActiveState('stairs-descend');
    onStairs.player = {
      ...onStairs.player,
      ...findStairsPosition(onStairs),
    };
    expect(choose(stairsSeeking, onStairs).id).toBe('descend_stairs');

    const approaching = emptyActiveState('stairs-move');
    approaching.player = {
      ...approaching.player,
      x: 4,
      y: 5,
    };

    const stairs = findStairsPosition(approaching);
    const choice = choose(stairsSeeking, approaching);
    expect(choice.type).toBe('move');
    const dx = choice.payload?.dx;
    const dy = choice.payload?.dy;
    expect(typeof dx).toBe('number');
    expect(typeof dy).toBe('number');
    const destination = {
      x: approaching.player.x + (dx as number),
      y: approaching.player.y + (dy as number),
    };
    expect(manhattanDistance(destination, stairs)).toBeLessThan(
      manhattanDistance(approaching.player, stairs),
    );
  });

  it('cautiousLowHp uses a potion at low HP and otherwise prefers safe movement', () => {
    const lowHp = emptyActiveState('cautious-potion');
    lowHp.player = {
      ...lowHp.player,
      hp: 8,
      inventory: [POTION_ITEM_ID],
    };
    expect(choose(cautiousLowHp, lowHp).id).toBe(`use_${POTION_ITEM_ID}`);

    const threatened = emptyActiveState('cautious-safe-move');
    threatened.player = {
      ...threatened.player,
      x: 3,
      y: 3,
    };
    threatened.enemies = [
      {
        id: 'slime-cautious-test',
        type: 'slime',
        label: 'Green Slime',
        hp: 6,
        maxHp: 6,
        attack: 2,
        defense: 0,
        behavior: 'chase',
        glyph: 's',
        x: 4,
        y: 3,
      },
    ];

    const choice = choose(cautiousLowHp, threatened);
    expect(choice.type).toBe('move');
    expect(choice.id).not.toBe('move_east');
  });

  it('greedyItemPicker picks up current-tile items and otherwise moves toward the nearest item', () => {
    const standingOnItem = emptyActiveState('greedy-pickup');
    standingOnItem.items = [
      {
        id: 'potion-greedy-current',
        type: POTION_ITEM_ID,
        label: 'Healing Potion',
        glyph: '!',
        x: standingOnItem.player.x,
        y: standingOnItem.player.y,
      },
    ];
    expect(choose(greedyItemPicker, standingOnItem).id).toBe(
      'pickup_potion-greedy-current',
    );

    const movingToItem = emptyActiveState('greedy-move');
    movingToItem.player = {
      ...movingToItem.player,
      x: 2,
      y: 2,
    };
    movingToItem.items = [
      {
        id: 'potion-greedy-near',
        type: POTION_ITEM_ID,
        label: 'Healing Potion',
        glyph: '!',
        x: 2,
        y: 4,
      },
    ];

    expect(choose(greedyItemPicker, movingToItem).id).toBe('move_south');
  });

  it.each([
    ['randomValidAction', randomValidAction],
    ['stairsSeeking', stairsSeeking],
    ['cautiousLowHp', cautiousLowHp],
    ['greedyItemPicker', greedyItemPicker],
  ] as const)(
    'runs %s to a defined terminal status on canonical seeds',
    (_name, policy) => {
      for (const seed of CANONICAL_REGRESSION_SEEDS) {
        const result = runBaselinePolicyPlaythrough(policy, seed);
        expect(TERMINAL_STATUSES).toContain(result.terminalStatus);
        expect(['WIN', 'LOSS', 'ABORTED']).toContain(result.terminalStatus);
        expect(result.stepsTaken).toBeGreaterThan(0);
      }
    },
  );

  it('randomValidAction completes canonical regression seeds without crashing', () => {
    const policy = createRandomValidActionPolicy('regression-random');

    for (const seed of CANONICAL_REGRESSION_SEEDS) {
      const result = runBaselinePolicyPlaythrough(policy, seed);
      expect(['WIN', 'LOSS', 'ABORTED']).toContain(result.terminalStatus);
    }
  });

  it('rejects policies that clone an available action instead of returning the exact action object', () => {
    const cloningPolicy: BaselinePlayerPolicy = ({ availableActions }) => ({
      ...availableActions[0],
    });

    expect(() => runBaselinePolicyPlaythrough(cloningPolicy, 'seed_001')).toThrow(
      'baseline policy must return an action reference from availableActions',
    );
  });
});
