import {
  getAvailableActions,
  isTerminal,
  render,
  start,
  step,
} from '../../game/engine.js';
import type { GameState, TerminalStatus } from '../../game/types.js';
import { findMatchingAvailableAction } from './helpers.js';
import type { BaselinePlayerPolicy } from './types.js';

const DEFAULT_MAX_STEPS_MULTIPLIER = 4;

export interface RunBaselinePolicyOptions {
  /** Safety cap on loop iterations (defaults to maxTurns * multiplier + floor buffer). */
  maxSteps?: number;
}

export interface RunBaselinePolicyResult {
  seed: string;
  terminalStatus: TerminalStatus;
  turnsPlayed: number;
  stepsTaken: number;
}

const resolveMaxSteps = (state: GameState, maxSteps?: number): number => {
  if (maxSteps !== undefined && maxSteps > 0) {
    return maxSteps;
  }
  return state.meta.maxTurns * DEFAULT_MAX_STEPS_MULTIPLIER + 64;
};

/**
 * Minimal harness-owned runner for baseline policy smoke tests.
 * Validates that the chosen action is a member of `getAvailableActions` before stepping.
 */
export function runBaselinePolicyPlaythrough(
  policy: BaselinePlayerPolicy,
  seed: string,
  options: RunBaselinePolicyOptions = {},
): RunBaselinePolicyResult {
  let state = start(seed);
  let stepsTaken = 0;
  const maxSteps = resolveMaxSteps(state, options.maxSteps);

  while (!isTerminal(state) && stepsTaken < maxSteps) {
    const renderedState = render(state);
    const availableActions = getAvailableActions(state);

    if (availableActions.length === 0) {
      throw new Error(
        `baseline policy runner: no available actions at turn ${state.turn} (status ${state.terminalStatus})`,
      );
    }

    const choice = policy({
      state,
      renderedState,
      availableActions,
      turn: state.turn,
    });

    const matched = findMatchingAvailableAction(availableActions, choice);
    if (!matched) {
      throw new Error(
        `baseline policy chose invalid action ${choice.id}/${choice.type}; available: ${availableActions.map((action) => action.id).join(', ')}`,
      );
    }

    if (choice !== matched) {
      throw new Error('baseline policy must return an action reference from availableActions');
    }

    const result = step(state, matched);
    if (!result.valid) {
      throw new Error(
        `baseline policy runner: step rejected ${matched.id} at turn ${state.turn}: ${result.error ?? 'unknown error'}`,
      );
    }

    state = result.state;
    stepsTaken += 1;
  }

  if (!isTerminal(state)) {
    throw new Error(
      `baseline policy runner: exceeded max steps (${maxSteps}) without terminal status for seed ${seed}`,
    );
  }

  return {
    seed,
    terminalStatus: state.terminalStatus,
    turnsPlayed: state.turn,
    stepsTaken,
  };
}
