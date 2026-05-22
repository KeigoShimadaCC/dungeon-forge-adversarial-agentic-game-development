import { describe, expect, it } from 'vitest';

import { getAvailableActions, render, start } from '../src/game/engine.js';
import {
  TERMINAL_STATUSES,
  type GameState,
  type PlayerAction,
} from '../src/game/types.js';
import {
  CANONICAL_REGRESSION_SEEDS,
  cautiousLowHp,
  createRandomValidActionPolicy,
  greedyItemPicker,
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

describe('Phase 04B baseline players', () => {
  it('returns an available action for each policy on an active game state', () => {
    const state = start('seed_001');

    for (const policy of BASELINE_POLICIES) {
      const availableActions = getAvailableActions(state);
      const choice = policyChoiceFromActions(state, policy, availableActions);
      expect(availableActions).toContain(choice);
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
});
