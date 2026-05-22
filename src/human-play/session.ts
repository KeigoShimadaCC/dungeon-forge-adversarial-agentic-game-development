import {
  getAvailableActions,
  isTerminal,
  render,
  start,
  step,
} from '../game/engine.js';
import {
  getScenarioPackLabel,
  normalizeScenarioPackId,
  resolveGameConfigForRun,
} from '../game/scenario-packs.js';
import { normalizeChallengeModeId } from '../game/challenge-modes.js';
import type { GameEvent, GameState, PlayerAction, TerminalStatus } from '../game/types.js';
import {
  buildTraceRelativePath,
  savePlaythroughArtifacts,
} from '../harness/artifacts.js';
import {
  deterministicFallback,
  findMatchingAvailableAction,
} from '../harness/baseline-players/helpers.js';
import { deriveScorecardFromTrace, validateScorecard } from '../harness/scorecard.js';
import { buildStateSummary } from '../harness/state-summary.js';
import {
  buildTraceMetadata,
  finalizeTraceMetadata,
} from '../harness/trace-diagnostics.js';
import {
  actionSnapshot,
  eventSnapshot,
  type PlaythroughTrace,
  type TraceStep,
} from '../harness/types.js';
import { formatStatusPanel } from './display.js';
import { HumanPlayAbortError } from './abort.js';
import {
  HUMAN_PLAYER_PERSONA,
  type HumanPlayChooseInput,
  type HumanPlayChooser,
  type HumanPlaySessionOptions,
  type HumanPlaySessionResult,
} from './types.js';

const DEFAULT_MAX_STEPS_MULTIPLIER = 4;

const resolveMaxSteps = (state: GameState, maxSteps?: number): number => {
  if (maxSteps !== undefined && maxSteps > 0) {
    return maxSteps;
  }
  return state.meta.maxTurns * DEFAULT_MAX_STEPS_MULTIPLIER + 64;
};

const harnessEvent = (
  turn: number,
  type: string,
  message: string,
  payload: Record<string, unknown> = {},
): GameEvent => ({
  id: `turn-${turn}-human-${type}`,
  type: `human_${type}`,
  message,
  turn,
  payload: payload as GameEvent['payload'],
});

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

const buildAutoChooser =
  (scriptIndices?: number[]): HumanPlayChooser => {
    let scriptCursor = 0;
    return (input: HumanPlayChooseInput): PlayerAction => {
      if (scriptIndices && scriptIndices.length > 0) {
        const index = scriptIndices[Math.min(scriptCursor, scriptIndices.length - 1)] ?? 0;
        scriptCursor += 1;
        const pick = input.actions[index];
        if (pick) {
          return pick;
        }
      }
      const fallback = deterministicFallback(input.actions);
      return (
        findMatchingAvailableAction(input.actions, fallback) ??
        input.actions[0] ??
        fallback
      );
    };
  };

export const buildHumanPlayChooseInput = (
  state: GameState,
  renderedMap: string,
): HumanPlayChooseInput => ({
  state,
  render: renderedMap,
  statusPanel: formatStatusPanel(state),
  actions: getAvailableActions(state),
});

export const runHumanPlaySession = async (
  options: HumanPlaySessionOptions,
): Promise<HumanPlaySessionResult> => {
  const {
    seed,
    version = '0.3.0-minimal-dungeon',
    challengeMode,
    scenarioPack,
    mode = 'auto',
    scriptIndices,
    saveTrace = false,
    runsRoot = process.cwd(),
  } = options;

  const normalizedChallenge = normalizeChallengeModeId(challengeMode);
  const normalizedPack = normalizeScenarioPackId(scenarioPack);
  const gameConfig = resolveGameConfigForRun(version, normalizedChallenge, normalizedPack);
  let state = start(seed, gameConfig);
  const baseMetadata = buildTraceMetadata(seed, version, normalizedChallenge, normalizedPack);

  const chooseAction =
    options.chooseAction ??
    (mode === 'auto' || mode === 'script'
      ? buildAutoChooser(mode === 'script' ? scriptIndices : undefined)
      : (() => {
          throw new Error('Terminal mode requires an explicit chooseAction implementation.');
        })());

  const steps: TraceStep[] = [];
  const maxSteps = resolveMaxSteps(state, options.maxSteps);
  let stepsTaken = 0;
  let aborted = false;

  const traceBase: PlaythroughTrace = {
    version,
    seed,
    persona: HUMAN_PLAYER_PERSONA,
    result: 'ACTIVE',
    turns: 0,
    steps,
    ...(normalizedChallenge ? { challenge_mode: normalizedChallenge } : {}),
    ...(normalizedPack
      ? {
          scenario_pack: normalizedPack,
          ...(getScenarioPackLabel(normalizedPack)
            ? { scenario_pack_label: getScenarioPackLabel(normalizedPack) }
            : {}),
        }
      : {}),
    metadata: baseMetadata,
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
          id: 'human_no_actions',
          type: 'wait',
          label: 'No available actions',
        }),
        valid: false,
        events: [
          harnessEvent(turn, 'no_actions', 'Human play aborted: no available actions.', {
            terminalStatus: 'ABORTED',
          }),
        ],
        terminalStatus: 'ABORTED',
      });
      break;
    }

    let choice: PlayerAction;
    try {
      choice = await Promise.resolve(
        chooseAction(buildHumanPlayChooseInput(state, renderedState)),
      );
    } catch (error) {
      if (error instanceof HumanPlayAbortError) {
        aborted = true;
        state = { ...state, terminalStatus: 'ABORTED' };
        steps.push({
          turn,
          state_summary: stateSummary,
          render: renderedState,
          available_actions: availableActions.map(actionSnapshot),
          chosen_action: actionSnapshot({
            id: 'human_abort',
            type: 'wait',
            label: 'Player aborted',
          }),
          valid: false,
          events: [
            harnessEvent(turn, 'abort', 'Human play aborted by user.', {
              terminalStatus: 'ABORTED',
            }),
          ],
          terminalStatus: 'ABORTED',
        });
        break;
      }
      throw error;
    }
    const matched = findMatchingAvailableAction(availableActions, choice);

    if (!matched) {
      aborted = true;
      steps.push({
        turn,
        state_summary: stateSummary,
        render: renderedState,
        available_actions: availableActions.map(actionSnapshot),
        chosen_action: actionSnapshot(choice),
        valid: false,
        events: [
          harnessEvent(
            turn,
            'invalid_action',
            `Human play aborted: choice must match a structured available action (${choice.id}/${choice.type}).`,
            {
              actionId: choice.id,
              actionType: choice.type,
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
    state = {
      ...state,
      terminalStatus: 'ABORTED',
    };
  }

  let trace = finalizeTrace(traceBase, state, aborted);
  const traceRelative = buildTraceRelativePath(version, seed, HUMAN_PLAYER_PERSONA);
  const provisionalScorecard = deriveScorecardFromTrace(trace, traceRelative, undefined, baseMetadata);
  trace = {
    ...trace,
    metadata: finalizeTraceMetadata(trace, provisionalScorecard, baseMetadata),
  };
  const scorecard = deriveScorecardFromTrace(trace, traceRelative, undefined, trace.metadata);
  validateScorecard(scorecard);

  let tracePath: string | undefined;
  let scorecardPath: string | undefined;

  if (saveTrace) {
    const artifacts = await savePlaythroughArtifacts(runsRoot, trace, scorecard);
    tracePath = artifacts.tracePath;
    scorecardPath = artifacts.scorecardPath;
  }

  return {
    trace,
    steps,
    aborted,
    ...(tracePath ? { tracePath } : {}),
    ...(scorecardPath ? { scorecardPath } : {}),
  };
};
