import {
  getAvailableActions,
  isTerminal,
  render,
  start,
  step,
} from '../game/engine.js';
import { resolveGameConfigForVersion } from '../game/version-profiles.js';
import type { GameEvent, GameState, JsonObject, TerminalStatus } from '../game/types.js';
import { findMatchingAvailableAction } from './baseline-players/helpers.js';
import type { BaselinePlayerInput } from './baseline-players/types.js';
import type { ArtifactWritePolicyContext } from './artifact-write-policy.js';
import type { ArtifactWriteMode } from './artifact-write-policy.js';
import {
  buildScorecardRelativePath,
  buildTraceRelativePath,
  savePlaythroughArtifacts,
  type SavedArtifacts,
} from './artifacts.js';
import { resolveVersionId } from './artifact-write-policy.js';
import { deriveScorecardFromTrace, validateScorecard } from './scorecard.js';
import {
  awaitPolicyDecision,
  isBaselinePolicyId,
  resolveBaselinePolicy,
  type HarnessPolicyId,
} from './policy-registry.js';
import { buildStateSummary } from './state-summary.js';
import type { HarnessPlayerPolicy, PlaythroughTrace, TraceStep } from './types.js';
import { actionSnapshot, eventSnapshot } from './types.js';

const DEFAULT_MAX_STEPS_MULTIPLIER = 4;

export interface RunPlaythroughOptions {
  seed: string;
  policyId: HarnessPolicyId;
  version: string;
  maxSteps?: number;
  runsRoot?: string;
  policy?: HarnessPlayerPolicy;
  onExisting?: ArtifactWriteMode;
  policyContext?: ArtifactWritePolicyContext;
  /** When true, run the harness loop without writing trace/scorecard artifacts. */
  dryRun?: boolean;
}

export interface RunPlaythroughResult {
  trace: PlaythroughTrace;
  scorecard: import('./types.js').PlaythroughScorecard;
  artifacts: SavedArtifacts;
}

const resolveMaxSteps = (state: GameState, maxSteps?: number): number => {
  if (maxSteps !== undefined && maxSteps > 0) {
    return maxSteps;
  }
  return state.meta.maxTurns * DEFAULT_MAX_STEPS_MULTIPLIER + 64;
};

const finalizeTrace = (
  trace: PlaythroughTrace,
  state: GameState,
  aborted: boolean,
): PlaythroughTrace => {
  const result: TerminalStatus = aborted ? 'ABORTED' : state.terminalStatus;
  return {
    ...trace,
    result,
    turns: state.turn,
  };
};

const harnessEvent = (
  turn: number,
  type: string,
  message: string,
  payload: JsonObject = {},
): GameEvent => ({
  id: `turn-${turn}-harness-${type}`,
  type: `harness_${type}`,
  message,
  turn,
  payload,
});

export const runPlaythrough = async (
  options: RunPlaythroughOptions,
): Promise<RunPlaythroughResult> => {
  const { seed, policyId, onExisting, policyContext } = options;
  const version = resolveVersionId(options.version);
  const runsRoot = options.runsRoot ?? process.cwd();
  const policy =
    options.policy ??
    (isBaselinePolicyId(policyId)
      ? resolveBaselinePolicy(policyId, seed)
      : (() => {
          throw new Error(
            `Policy "${policyId}" is not a baseline policy. Supply options.policy (for example createLlmPlayerPolicy).`,
          );
        })());

  let state = start(seed, resolveGameConfigForVersion(version));
  const steps: TraceStep[] = [];
  const maxSteps = resolveMaxSteps(state, options.maxSteps);
  let stepsTaken = 0;
  let aborted = false;

  const traceBase: PlaythroughTrace = {
    version,
    seed,
    persona: policyId,
    result: 'ACTIVE',
    turns: 0,
    steps,
  };

  while (!isTerminal(state) && stepsTaken < maxSteps && !aborted) {
    const turn = state.turn;
    const stateSummary = buildStateSummary(state);
    const renderedState = render(state);
    const availableActions = getAvailableActions(state);

    if (availableActions.length === 0) {
      aborted = true;
      steps.push({
        turn,
        state_summary: stateSummary,
        render: renderedState,
        available_actions: [],
        chosen_action: actionSnapshot({
          id: 'harness_no_actions',
          type: 'wait',
          label: 'No available actions',
        }),
        valid: false,
        events: [
          harnessEvent(turn, 'no_actions', 'Harness aborted: no available actions.', {
            terminalStatus: 'ABORTED',
          }),
        ],
        terminalStatus: 'ABORTED',
      });
      break;
    }

    const policyInput: BaselinePlayerInput = {
      state,
      renderedState,
      availableActions,
      turn,
    };

    const decision = await awaitPolicyDecision(policy(policyInput));
    const matched = findMatchingAvailableAction(availableActions, decision.action);

    if (!matched) {
      aborted = true;
      steps.push({
        turn,
        state_summary: stateSummary,
        render: renderedState,
        available_actions: availableActions.map(actionSnapshot),
        chosen_action: actionSnapshot(decision.action),
        ...(decision.reason ? { reason: decision.reason } : {}),
        ...(decision.decision_metadata ? { decision_metadata: decision.decision_metadata } : {}),
        valid: false,
        events: [
          harnessEvent(
            turn,
            'invalid_action',
            `Harness aborted: policy chose invalid action ${decision.action.id}/${decision.action.type}.`,
            {
              actionId: decision.action.id,
              actionType: decision.action.type,
              terminalStatus: 'ABORTED',
            },
          ),
        ],
        terminalStatus: 'ABORTED',
      });
      break;
    }

    if (matched !== decision.action) {
      aborted = true;
      steps.push({
        turn,
        state_summary: stateSummary,
        render: renderedState,
        available_actions: availableActions.map(actionSnapshot),
        chosen_action: actionSnapshot(decision.action),
        ...(decision.reason ? { reason: decision.reason } : {}),
        ...(decision.decision_metadata ? { decision_metadata: decision.decision_metadata } : {}),
        valid: false,
        events: [
          harnessEvent(
            turn,
            'cloned_action',
            'Harness aborted: policy must return an action reference from availableActions.',
            {
              actionId: decision.action.id,
              actionType: decision.action.type,
              terminalStatus: 'ABORTED',
            },
          ),
        ],
        terminalStatus: 'ABORTED',
      });
      break;
    }

    const stepResult = step(state, matched);
    const events = stepResult.events.map(eventSnapshot);

    steps.push({
      turn,
      state_summary: stateSummary,
      render: renderedState,
      available_actions: availableActions.map(actionSnapshot),
      chosen_action: actionSnapshot(matched),
      ...(decision.reason ? { reason: decision.reason } : {}),
      ...(decision.decision_metadata ? { decision_metadata: decision.decision_metadata } : {}),
      valid: stepResult.valid,
      events,
      terminalStatus: stepResult.state.terminalStatus,
    });

    state = stepResult.state;
    stepsTaken += 1;

    if (!stepResult.valid) {
      aborted = true;
      state = {
        ...state,
        terminalStatus: 'ABORTED',
      };
      break;
    }
  }

  if (!aborted && !isTerminal(state) && stepsTaken >= maxSteps) {
    aborted = true;
    const maxStepsEvent = harnessEvent(
      state.turn,
      'max_steps',
      `Harness aborted: reached configured max steps (${maxSteps}).`,
      {
        maxSteps,
        terminalStatus: 'ABORTED',
      },
    );
    const lastStep = steps.at(-1);
    if (lastStep) {
      lastStep.events = [...lastStep.events, maxStepsEvent];
      lastStep.terminalStatus = 'ABORTED';
    }
    state = {
      ...state,
      terminalStatus: 'ABORTED',
    };
  }

  const trace = finalizeTrace(traceBase, state, aborted);
  const traceRelative = buildTraceRelativePath(version, seed, policyId);
  const scorecard = deriveScorecardFromTrace(trace, traceRelative);
  validateScorecard(scorecard);

  if (options.dryRun) {
    return {
      trace,
      scorecard,
      artifacts: {
        tracePath: traceRelative,
        scorecardPath: buildScorecardRelativePath(version, seed, policyId),
      },
    };
  }

  const artifacts = await savePlaythroughArtifacts(runsRoot, trace, scorecard, {
    write: { onExisting },
    policyContext,
  });

  return { trace, scorecard, artifacts };
};

export const parseSimulateSeedArgs = (
  argv: string[],
): { seed: string; policyId: import('./policy-registry.js').BaselinePolicyId; version: string; maxSteps?: number } => {
  let seed: string | undefined;
  let policyId: string | undefined;
  let version = 'v001';
  let maxSteps: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--seed' && argv[index + 1]) {
      seed = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--policy' && argv[index + 1]) {
      policyId = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--version' && argv[index + 1]) {
      version = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--max-steps' && argv[index + 1]) {
      maxSteps = Number(argv[index + 1]);
      index += 1;
    }
  }

  if (!seed) {
    throw new Error('Missing required --seed argument.');
  }
  if (!policyId) {
    throw new Error('Missing required --policy argument.');
  }
  if (!isBaselinePolicyId(policyId)) {
    throw new Error(
      `Unknown policy "${policyId}". Expected one of: random, stairs-seeking, cautious-low-hp, greedy-item-picker.`,
    );
  }

  return { seed, policyId, version, maxSteps };
};

export { isBaselinePolicyId, BASELINE_POLICY_IDS, isLlmPlayerPersona, LLM_PLAYER_PERSONA_IDS } from './policy-registry.js';
export type { HarnessPolicyId, BaselinePolicyId } from './policy-registry.js';
