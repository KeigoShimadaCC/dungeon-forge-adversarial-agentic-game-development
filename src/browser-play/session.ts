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
  type SavePlaythroughArtifactOptions,
} from '../harness/artifacts.js';
import {
  applyPlaytestMetadataToTrace,
  assertHumanPlaytestTraceShape,
  buildHumanPlaytestMetadata,
  normalizeSessionLabel,
} from '../harness/playtest-metadata.js';
import { findMatchingAvailableAction } from '../harness/baseline-players/helpers.js';
import { deriveScorecardFromTrace, validateScorecard } from '../harness/scorecard.js';
import { buildStateSummary } from '../harness/state-summary.js';
import {
  buildTraceMetadata,
  finalizeTraceMetadata,
} from '../harness/trace-diagnostics.js';
import {
  actionSnapshot,
  eventSnapshot,
  type PlaythroughScorecard,
  type PlaythroughTrace,
  type StateSummary,
  type TraceStep,
} from '../harness/types.js';
import { HUMAN_PLAYER_PERSONA } from '../human-play/types.js';

export const BROWSER_PLAY_MODE = 'browser' as const;

export interface BrowserPlayStartOptions {
  seed: string;
  version?: string;
  challengeMode?: string;
  scenarioPack?: string;
  sessionLabel?: string;
}

export interface BrowserPlaySnapshot {
  label: 'Game state and local play evidence';
  seed: string;
  version: string;
  render: string;
  state: StateSummary;
  terminalStatus: TerminalStatus;
  isTerminal: boolean;
  actions: PlayerAction[];
  inventory: string[];
  events: GameEvent[];
  stepsRecorded: number;
  tracePreview: {
    persona: string;
    player_kind: 'human';
    human_play_mode: typeof BROWSER_PLAY_MODE;
    result: TerminalStatus;
    turns: number;
  };
}

export interface BrowserPlayExportResult {
  trace: PlaythroughTrace;
  scorecard: PlaythroughScorecard;
  tracePath: string;
  scorecardPath: string;
}

const buildHarnessEvent = (
  turn: number,
  type: string,
  message: string,
  payload: Record<string, unknown> = {},
): GameEvent => ({
  id: `turn-${turn}-browser-${type}`,
  type: `browser_${type}`,
  message,
  turn,
  payload: payload as GameEvent['payload'],
});

const finalizeTrace = (
  trace: PlaythroughTrace,
  state: GameState,
): PlaythroughTrace => ({
  ...trace,
  result: state.terminalStatus,
  turns: state.turn,
});

export class BrowserPlaySession {
  private state: GameState;
  private readonly traceBase: PlaythroughTrace;
  private readonly baseMetadata: NonNullable<PlaythroughTrace['metadata']>;
  private readonly steps: TraceStep[] = [];
  private readonly version: string;
  private lastEvents: GameEvent[];

  constructor(options: BrowserPlayStartOptions) {
    const {
      seed,
      version = '0.3.0-minimal-dungeon',
      challengeMode,
      scenarioPack,
      sessionLabel,
    } = options;
    const normalizedChallenge = normalizeChallengeModeId(challengeMode);
    const normalizedPack = normalizeScenarioPackId(scenarioPack);
    const normalizedSessionLabel = sessionLabel ? normalizeSessionLabel(sessionLabel) : undefined;
    const gameConfig = resolveGameConfigForRun(version, normalizedChallenge, normalizedPack);

    this.version = version;
    this.state = start(seed, gameConfig);
    this.baseMetadata = buildTraceMetadata(seed, version, normalizedChallenge, normalizedPack);
    this.lastEvents = [
      buildHarnessEvent(0, 'start', `Browser play started for seed ${seed}.`, {
        seed,
        version,
      }),
    ];
    this.traceBase = applyPlaytestMetadataToTrace(
      {
        version,
        seed,
        persona: HUMAN_PLAYER_PERSONA,
        result: 'ACTIVE',
        turns: 0,
        steps: this.steps,
        ...(normalizedChallenge ? { challenge_mode: normalizedChallenge } : {}),
        ...(normalizedPack
          ? {
              scenario_pack: normalizedPack,
              ...(getScenarioPackLabel(normalizedPack)
                ? { scenario_pack_label: getScenarioPackLabel(normalizedPack) }
                : {}),
            }
          : {}),
        metadata: this.baseMetadata,
      },
      buildHumanPlaytestMetadata(BROWSER_PLAY_MODE, normalizedSessionLabel),
    );
  }

  snapshot(): BrowserPlaySnapshot {
    const summary = buildStateSummary(this.state);
    return {
      label: 'Game state and local play evidence',
      seed: this.state.seed,
      version: this.version,
      render: render(this.state),
      state: summary,
      terminalStatus: this.state.terminalStatus,
      isTerminal: isTerminal(this.state),
      actions: getAvailableActions(this.state).map(actionSnapshot),
      inventory: [...this.state.player.inventory],
      events: this.lastEvents.map(eventSnapshot),
      stepsRecorded: this.steps.length,
      tracePreview: {
        persona: HUMAN_PLAYER_PERSONA,
        player_kind: 'human',
        human_play_mode: BROWSER_PLAY_MODE,
        result: this.state.terminalStatus,
        turns: this.state.turn,
      },
    };
  }

  applyAction(input: { actionId: string; actionType?: PlayerAction['type'] }): BrowserPlaySnapshot {
    if (isTerminal(this.state)) {
      this.lastEvents = [
        buildHarnessEvent(
          this.state.turn,
          'terminal_noop',
          `Game is already terminal: ${this.state.terminalStatus}.`,
          { terminalStatus: this.state.terminalStatus },
        ),
      ];
      return this.snapshot();
    }

    const availableActions = getAvailableActions(this.state);
    const requested = availableActions.find(
      (action) =>
        action.id === input.actionId &&
        (input.actionType === undefined || action.type === input.actionType),
    );
    if (!requested) {
      throw new Error(
        `Action ${input.actionId}${input.actionType ? `/${input.actionType}` : ''} is not available for this state.`,
      );
    }
    const matched = findMatchingAvailableAction(availableActions, requested);
    if (!matched) {
      throw new Error(`Action ${requested.id}/${requested.type} failed structured-action matching.`);
    }

    const turn = this.state.turn;
    const stateSummary = buildStateSummary(this.state);
    const renderedState = render(this.state);
    const stepResult = step(this.state, matched);
    this.lastEvents = stepResult.events.map(eventSnapshot);
    this.steps.push({
      turn,
      state_summary: stateSummary,
      render: renderedState,
      available_actions: availableActions.map(actionSnapshot),
      chosen_action: actionSnapshot(matched),
      valid: stepResult.valid,
      events: this.lastEvents,
      terminalStatus: stepResult.state.terminalStatus,
    });
    this.state = stepResult.valid
      ? stepResult.state
      : { ...stepResult.state, terminalStatus: 'ABORTED' };

    return this.snapshot();
  }

  buildTrace(): PlaythroughTrace {
    let trace = finalizeTrace(this.traceBase, this.state);
    const traceRelative = buildTraceRelativePath(this.version, this.state.seed, HUMAN_PLAYER_PERSONA);
    const provisionalScorecard = deriveScorecardFromTrace(
      trace,
      traceRelative,
      undefined,
      this.baseMetadata,
    );
    trace = {
      ...trace,
      metadata: finalizeTraceMetadata(trace, provisionalScorecard, this.baseMetadata),
    };
    assertHumanPlaytestTraceShape(trace);
    return trace;
  }

  async exportTrace(
    runsRoot = process.cwd(),
    options: SavePlaythroughArtifactOptions = {},
  ): Promise<BrowserPlayExportResult> {
    const trace = this.buildTrace();
    const traceRelative = buildTraceRelativePath(trace.version, trace.seed, trace.persona);
    const scorecard = deriveScorecardFromTrace(trace, traceRelative, undefined, trace.metadata);
    validateScorecard(scorecard);
    const artifacts = await savePlaythroughArtifacts(runsRoot, trace, scorecard, options);
    return {
      trace,
      scorecard,
      tracePath: artifacts.tracePath,
      scorecardPath: artifacts.scorecardPath,
    };
  }
}

export const createBrowserPlaySession = (
  options: BrowserPlayStartOptions,
): BrowserPlaySession => new BrowserPlaySession(options);
