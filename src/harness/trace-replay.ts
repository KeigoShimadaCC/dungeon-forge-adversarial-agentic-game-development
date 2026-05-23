import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  getAvailableActions,
  isTerminal,
  start,
  step,
} from '../game/engine.js';
import { resolveGameConfigForRun } from '../game/scenario-packs.js';
import type { GameState, TerminalStatus } from '../game/types.js';
import { findMatchingAvailableAction } from './baseline-players/helpers.js';
import { stringifyDeterministicJson } from './json.js';
import { isTraceStructurallyUsable } from './reviewer-client.js';
import { deriveScorecardFromTrace } from './scorecard.js';
import { buildStateSummary } from './state-summary.js';
import type {
  PlaythroughScorecard,
  PlaythroughTrace,
  StateSummary,
  TraceStep,
} from './types.js';

export const TRACE_REPLAY_REPORT_SCHEMA_VERSION = 'trace_replay_report_v1';

const TERMINAL_STATUSES = new Set<TerminalStatus>(['ACTIVE', 'WIN', 'LOSS', 'ABORTED']);

export type TraceReplayDiagnosticCategory = 'blocker' | 'warning';

export interface TraceReplayDiagnostic {
  category: TraceReplayDiagnosticCategory;
  field?: string;
  message: string;
}

export interface TraceReplayValidationResult {
  ok: boolean;
  diagnostics: TraceReplayDiagnostic[];
  blockers: TraceReplayDiagnostic[];
  warnings: TraceReplayDiagnostic[];
}

export class TraceReplayValidationError extends Error {
  readonly diagnostics: TraceReplayDiagnostic[];

  constructor(message: string, diagnostics: TraceReplayDiagnostic[] = []) {
    super(message);
    this.name = 'TraceReplayValidationError';
    this.diagnostics = diagnostics;
  }
}

export interface TraceReexecuteMismatch {
  step_index: number;
  kind: 'no_matching_action' | 'terminal_before_steps_done' | 'result_mismatch' | 'turns_mismatch';
  message: string;
}

export interface TraceReexecuteResult {
  ok: boolean;
  expected_result: TerminalStatus;
  actual_result: TerminalStatus;
  expected_turns: number;
  actual_turns: number;
  steps_replayed: number;
  mismatches: TraceReexecuteMismatch[];
}

export interface TraceReplayReport {
  schema_version: typeof TRACE_REPLAY_REPORT_SCHEMA_VERSION;
  generated_at: string;
  trace_path: string;
  scorecard_path?: string;
  trace: {
    version: string;
    seed: string;
    persona: string;
    result: TerminalStatus;
    turns: number;
    step_count: number;
    player_kind?: string;
    challenge_mode?: string;
    scenario_pack?: string;
    session_label?: string;
  };
  scorecard_summary?: {
    result: TerminalStatus;
    turns: number;
    invalid_actions: number;
    softlocks: number;
    floors_reached: number;
    primary_category?: string;
  };
  inspect_step_count: number;
  reexecute?: TraceReexecuteResult;
  diagnostics: TraceReplayDiagnostic[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const pushBlocker = (
  diagnostics: TraceReplayDiagnostic[],
  field: string,
  message: string,
): void => {
  diagnostics.push({ category: 'blocker', field, message });
};

const pushWarning = (
  diagnostics: TraceReplayDiagnostic[],
  field: string,
  message: string,
): void => {
  diagnostics.push({ category: 'warning', field, message });
};

const validateActionShape = (
  raw: unknown,
  diagnostics: TraceReplayDiagnostic[],
  field: string,
): boolean => {
  if (!isRecord(raw)) {
    pushBlocker(diagnostics, field, `${field} must be an object with id, type, and label.`);
    return false;
  }
  let ok = true;
  if (typeof raw.id !== 'string' || raw.id.length === 0) {
    pushBlocker(diagnostics, `${field}.id`, `${field}.id must be a non-empty string.`);
    ok = false;
  }
  if (typeof raw.type !== 'string' || raw.type.length === 0) {
    pushBlocker(diagnostics, `${field}.type`, `${field}.type must be a non-empty string.`);
    ok = false;
  }
  if (typeof raw.label !== 'string' || raw.label.length === 0) {
    pushBlocker(diagnostics, `${field}.label`, `${field}.label must be a non-empty string.`);
    ok = false;
  }
  return ok;
};

const validateStateSummaryShape = (
  raw: unknown,
  diagnostics: TraceReplayDiagnostic[],
  field: string,
): boolean => {
  if (!isRecord(raw)) {
    pushBlocker(diagnostics, field, `${field} must be an object.`);
    return false;
  }
  let ok = true;
  const numericFields = ['turn', 'floor', 'hp', 'maxHp', 'enemyCount', 'itemCount', 'npcCount'] as const;
  for (const key of numericFields) {
    const value = raw[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      pushBlocker(diagnostics, `${field}.${key}`, `${field}.${key} must be a finite number.`);
      ok = false;
    }
  }
  if (
    typeof raw.terminalStatus !== 'string' ||
    !TERMINAL_STATUSES.has(raw.terminalStatus as TerminalStatus)
  ) {
    pushBlocker(
      diagnostics,
      `${field}.terminalStatus`,
      `${field}.terminalStatus must be ACTIVE, WIN, LOSS, or ABORTED.`,
    );
    ok = false;
  }
  if (!isRecord(raw.playerPosition)) {
    pushBlocker(diagnostics, `${field}.playerPosition`, `${field}.playerPosition must be an object.`);
    ok = false;
  } else {
    for (const axis of ['x', 'y'] as const) {
      if (
        typeof raw.playerPosition[axis] !== 'number' ||
        !Number.isFinite(raw.playerPosition[axis])
      ) {
        pushBlocker(
          diagnostics,
          `${field}.playerPosition.${axis}`,
          `${field}.playerPosition.${axis} must be a finite number.`,
        );
        ok = false;
      }
    }
  }
  if (!Array.isArray(raw.inventory)) {
    pushBlocker(diagnostics, `${field}.inventory`, `${field}.inventory must be an array.`);
    ok = false;
  }
  if (typeof raw.inDialogue !== 'boolean') {
    pushBlocker(diagnostics, `${field}.inDialogue`, `${field}.inDialogue must be a boolean.`);
    ok = false;
  }
  return ok;
};

const validateTraceStepShape = (
  raw: unknown,
  diagnostics: TraceReplayDiagnostic[],
  index: number,
): boolean => {
  const field = `steps[${index}]`;
  if (!isRecord(raw)) {
    pushBlocker(diagnostics, field, `${field} must be an object.`);
    return false;
  }

  let ok = true;
  if (typeof raw.turn !== 'number' || !Number.isFinite(raw.turn)) {
    pushBlocker(diagnostics, `${field}.turn`, `${field}.turn must be a finite number.`);
    ok = false;
  }
  if (typeof raw.render !== 'string') {
    pushBlocker(diagnostics, `${field}.render`, `${field}.render must be a string.`);
    ok = false;
  }
  if (typeof raw.valid !== 'boolean') {
    pushBlocker(diagnostics, `${field}.valid`, `${field}.valid must be a boolean.`);
    ok = false;
  }
  if (
    typeof raw.terminalStatus !== 'string' ||
    !TERMINAL_STATUSES.has(raw.terminalStatus as TerminalStatus)
  ) {
    pushBlocker(
      diagnostics,
      `${field}.terminalStatus`,
      `${field}.terminalStatus must be ACTIVE, WIN, LOSS, or ABORTED.`,
    );
    ok = false;
  }
  if (!Array.isArray(raw.available_actions)) {
    pushBlocker(
      diagnostics,
      `${field}.available_actions`,
      `${field}.available_actions must be an array.`,
    );
    ok = false;
  } else {
    for (let actionIndex = 0; actionIndex < raw.available_actions.length; actionIndex += 1) {
      if (
        !validateActionShape(
          raw.available_actions[actionIndex],
          diagnostics,
          `${field}.available_actions[${actionIndex}]`,
        )
      ) {
        ok = false;
      }
    }
  }
  if (!validateActionShape(raw.chosen_action, diagnostics, `${field}.chosen_action`)) {
    ok = false;
  }
  if (!validateStateSummaryShape(raw.state_summary, diagnostics, `${field}.state_summary`)) {
    ok = false;
  }
  if (!Array.isArray(raw.events)) {
    pushBlocker(diagnostics, `${field}.events`, `${field}.events must be an array.`);
    ok = false;
  } else {
    for (let eventIndex = 0; eventIndex < raw.events.length; eventIndex += 1) {
      const event = raw.events[eventIndex];
      if (!isRecord(event)) {
        pushBlocker(
          diagnostics,
          `${field}.events[${eventIndex}]`,
          `${field}.events[${eventIndex}] must be an object.`,
        );
        ok = false;
        continue;
      }
      if (typeof event.type !== 'string' || event.type.length === 0) {
        pushBlocker(
          diagnostics,
          `${field}.events[${eventIndex}].type`,
          `${field}.events[${eventIndex}].type must be a non-empty string.`,
        );
        ok = false;
      }
    }
  }
  return ok;
};

export const collectTraceReplayDiagnostics = (raw: unknown): TraceReplayValidationResult => {
  const diagnostics: TraceReplayDiagnostic[] = [];

  if (!isRecord(raw)) {
    pushBlocker(diagnostics, 'trace', 'Trace JSON must be an object.');
    return finalizeValidation(diagnostics);
  }

  if (typeof raw.version !== 'string' || raw.version.length === 0) {
    pushBlocker(diagnostics, 'version', 'version must be a non-empty string.');
  }
  if (typeof raw.seed !== 'string' || raw.seed.length === 0) {
    pushBlocker(diagnostics, 'seed', 'seed must be a non-empty string.');
  }
  if (typeof raw.persona !== 'string' || raw.persona.length === 0) {
    pushBlocker(diagnostics, 'persona', 'persona must be a non-empty string.');
  }
  if (
    typeof raw.result !== 'string' ||
    !TERMINAL_STATUSES.has(raw.result as TerminalStatus)
  ) {
    pushBlocker(diagnostics, 'result', 'result must be ACTIVE, WIN, LOSS, or ABORTED.');
  }
  if (typeof raw.turns !== 'number' || !Number.isFinite(raw.turns)) {
    pushBlocker(diagnostics, 'turns', 'turns must be a finite number.');
  }
  if (!Array.isArray(raw.steps)) {
    pushBlocker(diagnostics, 'steps', 'steps must be an array.');
    return finalizeValidation(diagnostics);
  }

  if (raw.steps.length === 0) {
    pushWarning(diagnostics, 'steps', 'Trace has zero steps; replay will show only run header.');
  }

  for (let index = 0; index < raw.steps.length; index += 1) {
    validateTraceStepShape(raw.steps[index], diagnostics, index);
  }

  const trace = raw as unknown as PlaythroughTrace;
  if (isTraceStructurallyUsable(trace) && trace.steps.length > 0) {
    const lastStep = trace.steps.at(-1);
    if (lastStep && trace.result !== 'ACTIVE' && lastStep.terminalStatus !== trace.result) {
      pushWarning(
        diagnostics,
        'result',
        `Trace result ${trace.result} differs from last step terminalStatus ${lastStep.terminalStatus}.`,
      );
    }
    if (trace.turns !== trace.steps.length && trace.steps.every((entry) => entry.valid)) {
      pushWarning(
        diagnostics,
        'turns',
        `Trace turns (${trace.turns}) differs from step count (${trace.steps.length}).`,
      );
    }
  }

  return finalizeValidation(diagnostics);
};

const finalizeValidation = (
  diagnostics: TraceReplayDiagnostic[],
): TraceReplayValidationResult => {
  const blockers = diagnostics.filter((entry) => entry.category === 'blocker');
  const warnings = diagnostics.filter((entry) => entry.category === 'warning');
  return {
    ok: blockers.length === 0,
    diagnostics,
    blockers,
    warnings,
  };
};

export const formatTraceReplayValidationMessage = (
  result: TraceReplayValidationResult,
): string => {
  const lines = ['Trace replay validation failed:'];
  for (const entry of result.blockers) {
    lines.push(`  [blocker] ${entry.field ? `${entry.field}: ` : ''}${entry.message}`);
  }
  for (const entry of result.warnings) {
    lines.push(`  [warning] ${entry.field ? `${entry.field}: ` : ''}${entry.message}`);
  }
  return lines.join('\n');
};

export const assertTraceReplayable = (trace: PlaythroughTrace): void => {
  const validation = collectTraceReplayDiagnostics(trace);
  if (!validation.ok) {
    throw new TraceReplayValidationError(
      formatTraceReplayValidationMessage(validation),
      validation.diagnostics,
    );
  }
};

export const parseTraceJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new TraceReplayValidationError(`Trace JSON parse error: ${message}`, [
      { category: 'blocker', field: 'trace', message: `Invalid JSON: ${message}` },
    ]);
  }
};

export const loadTraceFromFile = async (tracePath: string): Promise<PlaythroughTrace> => {
  const rawText = await readFile(tracePath, 'utf8');
  const parsed = parseTraceJson(rawText);
  const validation = collectTraceReplayDiagnostics(parsed);
  if (!validation.ok) {
    throw new TraceReplayValidationError(
      formatTraceReplayValidationMessage(validation),
      validation.diagnostics,
    );
  }
  return parsed as unknown as PlaythroughTrace;
};

export const loadScorecardFromFile = async (
  scorecardPath: string,
): Promise<PlaythroughScorecard> => {
  const rawText = await readFile(scorecardPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new TraceReplayValidationError(`Scorecard JSON parse error: ${message}`, [
      { category: 'blocker', field: 'scorecard', message: `Invalid JSON: ${message}` },
    ]);
  }
  if (!isRecord(parsed)) {
    throw new TraceReplayValidationError('Scorecard JSON must be an object.', [
      { category: 'blocker', field: 'scorecard', message: 'Scorecard must be an object.' },
    ]);
  }
  return parsed as unknown as PlaythroughScorecard;
};

export const resolveScorecardForReplay = (
  trace: PlaythroughTrace,
  tracePath: string,
  scorecard?: PlaythroughScorecard,
): PlaythroughScorecard =>
  scorecard ?? deriveScorecardFromTrace(trace, tracePath, undefined, trace.metadata);

export interface StateSummaryDeltaLine {
  label: string;
  before: string;
  after: string;
}

export const diffStateSummaries = (
  previous: StateSummary | undefined,
  next: StateSummary,
): StateSummaryDeltaLine[] => {
  if (!previous) {
    return [
      {
        label: 'initial',
        before: '(none)',
        after: `turn ${next.turn} floor ${next.floor} hp ${next.hp}/${next.maxHp}`,
      },
    ];
  }

  const lines: StateSummaryDeltaLine[] = [];
  const add = (label: string, before: string, after: string): void => {
    if (before !== after) {
      lines.push({ label, before, after });
    }
  };

  add('turn', String(previous.turn), String(next.turn));
  add('floor', String(previous.floor), String(next.floor));
  add('hp', `${previous.hp}/${previous.maxHp}`, `${next.hp}/${next.maxHp}`);
  add(
    'position',
    `${previous.playerPosition.x},${previous.playerPosition.y}`,
    `${next.playerPosition.x},${next.playerPosition.y}`,
  );
  add('enemies', String(previous.enemyCount), String(next.enemyCount));
  add('items', String(previous.itemCount), String(next.itemCount));
  add('inventory', previous.inventory.join(', ') || '(empty)', next.inventory.join(', ') || '(empty)');
  add('dialogue', previous.inDialogue ? 'yes' : 'no', next.inDialogue ? 'yes' : 'no');
  add('terminal', previous.terminalStatus, next.terminalStatus);

  return lines;
};

const formatActionLine = (step: TraceStep): string => {
  const action = step.chosen_action;
  const parts = [`${action.id} (${action.type})`, action.label];
  if (step.reason) {
    parts.push(`reason: ${step.reason}`);
  }
  if (step.decision_metadata?.fallback_used) {
    parts.push('fallback');
  }
  if (step.decision_metadata?.model_reason) {
    parts.push(`model: ${step.decision_metadata.model_reason}`);
  }
  return parts.join(' | ');
};

const formatEventsBlock = (step: TraceStep): string[] => {
  if (step.events.length === 0) {
    return ['  events: (none)'];
  }
  const lines = ['  events:'];
  for (const event of step.events) {
    const payload =
      event.payload && Object.keys(event.payload).length > 0
        ? ` ${JSON.stringify(event.payload)}`
        : '';
    lines.push(`    - ${event.type}: ${event.message}${payload}`);
  }
  return lines;
};

export interface FormatReplayStepOptions {
  includeRender?: boolean;
  previousSummary?: StateSummary;
}

export const formatReplayStep = (
  step: TraceStep,
  index: number,
  options: FormatReplayStepOptions = {},
): string => {
  const includeRender = options.includeRender ?? true;
  const deltaLines = diffStateSummaries(options.previousSummary, step.state_summary);
  const header = [
    `--- step ${index + 1} / turn ${step.turn} ---`,
    `  valid: ${step.valid ? 'yes' : 'NO'} | step terminal: ${step.terminalStatus}`,
    `  action: ${formatActionLine(step)}`,
    `  available: ${step.available_actions.length} action(s)`,
  ];

  if (deltaLines.length > 0) {
    header.push('  state delta:');
    for (const line of deltaLines) {
      header.push(`    ${line.label}: ${line.before} -> ${line.after}`);
    }
  } else {
    header.push('  state delta: (no changes from previous summary)');
  }

  header.push(...formatEventsBlock(step));

  if (includeRender) {
    header.push('  render:');
    for (const renderLine of step.render.split('\n')) {
      header.push(`    ${renderLine}`);
    }
  }

  return header.join('\n');
};

export const formatTraceReplayHeader = (
  trace: PlaythroughTrace,
  scorecard?: PlaythroughScorecard,
): string => {
  const lines = [
    '=== trace replay ===',
    `version: ${trace.version}`,
    `seed: ${trace.seed}`,
    `persona: ${trace.persona}`,
    `result: ${trace.result} (${trace.turns} turns, ${trace.steps.length} steps)`,
  ];

  if (trace.player_kind) {
    lines.push(`player_kind: ${trace.player_kind}`);
  }
  if (trace.human_play_mode) {
    lines.push(`human_play_mode: ${trace.human_play_mode}`);
  }
  if (trace.session_label) {
    lines.push(`session_label: ${trace.session_label}`);
  }
  if (trace.challenge_mode) {
    lines.push(`challenge_mode: ${trace.challenge_mode}`);
  }
  if (trace.scenario_pack) {
    lines.push(
      `scenario_pack: ${trace.scenario_pack}${trace.scenario_pack_label ? ` (${trace.scenario_pack_label})` : ''}`,
    );
  }

  const problem = trace.metadata?.problem_run;
  if (problem && problem.categories.length > 0) {
    lines.push(`problem_run: ${problem.primary_category} (${problem.categories.length} categories)`);
    for (const category of problem.categories.slice(0, 5)) {
      lines.push(`  - ${category.category}:${category.code}${category.message ? ` - ${category.message}` : ''}`);
    }
  }

  if (scorecard) {
    lines.push('--- scorecard context ---');
    lines.push(
      `objective: floors ${scorecard.floors_reached}, damage ${scorecard.damage_taken}, items used ${scorecard.items_used}, enemies defeated ${scorecard.enemies_defeated}`,
    );
    lines.push(
      `quality: invalid_actions ${scorecard.invalid_actions}, softlocks ${scorecard.softlocks}`,
    );
    const scores = scorecard.reviewer_scores;
    const scoreBits = (['fun', 'clarity', 'fairness', 'tactical_depth', 'replay_value'] as const)
      .map((key) => `${key}=${scores[key] ?? 'n/a'}`)
      .join(', ');
    lines.push(`reviewer_scores: ${scoreBits}`);
    if (scorecard.diagnostics?.primary_category) {
      lines.push(`diagnostics: ${scorecard.diagnostics.primary_category}`);
    }
  }

  return lines.join('\n');
};

export interface BuildTraceReplayInspectOptions {
  fromStep?: number;
  toStep?: number;
  includeRender?: boolean;
}

export const buildTraceReplayInspectOutput = (
  trace: PlaythroughTrace,
  scorecard?: PlaythroughScorecard,
  options: BuildTraceReplayInspectOptions = {},
): string => {
  const from = Math.max(0, options.fromStep ?? 0);
  const to = Math.min(trace.steps.length, options.toStep ?? trace.steps.length);
  const parts = [formatTraceReplayHeader(trace, scorecard)];

  if (trace.steps.length === 0) {
    parts.push('(no steps recorded)');
    return parts.join('\n');
  }

  if (from >= to) {
    parts.push(`(no steps in range ${from + 1}-${to})`);
    return parts.join('\n');
  }

  for (let index = from; index < to; index += 1) {
    const step = trace.steps[index];
    if (!step) {
      continue;
    }
    const previous = index > 0 ? trace.steps[index - 1]?.state_summary : undefined;
    parts.push(
      formatReplayStep(step, index, {
        includeRender: options.includeRender,
        previousSummary: previous,
      }),
    );
  }

  return parts.join('\n\n');
};

export const reexecuteTrace = (trace: PlaythroughTrace): TraceReexecuteResult => {
  const mismatches: TraceReexecuteMismatch[] = [];
  const gameConfig = resolveGameConfigForRun(
    trace.version,
    trace.challenge_mode,
    trace.scenario_pack,
  );
  let state: GameState = start(trace.seed, gameConfig);
  let stepsReplayed = 0;

  for (let index = 0; index < trace.steps.length; index += 1) {
    const recorded = trace.steps[index];
    if (!recorded) {
      continue;
    }

    if (isTerminal(state) && index < trace.steps.length - 1) {
      mismatches.push({
        step_index: index,
        kind: 'terminal_before_steps_done',
        message: `Engine reached terminal status ${state.terminalStatus} before step ${index + 1}.`,
      });
      break;
    }

    const availableActions = getAvailableActions(state);
    const matched = findMatchingAvailableAction(availableActions, recorded.chosen_action);
    if (!matched) {
      mismatches.push({
        step_index: index,
        kind: 'no_matching_action',
        message: `Chosen action ${recorded.chosen_action.id}/${recorded.chosen_action.type} is not available at turn ${state.turn}.`,
      });
      break;
    }

    const stepResult = step(state, matched);
    state = stepResult.state;
    stepsReplayed += 1;

    if (!stepResult.valid) {
      state = { ...state, terminalStatus: 'ABORTED' };
      break;
    }
  }

  const actualResult: TerminalStatus = isTerminal(state)
    ? state.terminalStatus
    : trace.result === 'ABORTED'
      ? 'ABORTED'
      : state.terminalStatus;

  if (actualResult !== trace.result) {
    mismatches.push({
      step_index: trace.steps.length,
      kind: 'result_mismatch',
      message: `Expected terminal result ${trace.result} but engine ended at ${actualResult}.`,
    });
  }

  if (state.turn !== trace.turns) {
    mismatches.push({
      step_index: trace.steps.length,
      kind: 'turns_mismatch',
      message: `Expected ${trace.turns} turns but engine recorded ${state.turn}.`,
    });
  }

  const blockingKinds = new Set<TraceReexecuteMismatch['kind']>([
    'no_matching_action',
    'terminal_before_steps_done',
    'result_mismatch',
  ]);
  const blocking = mismatches.filter((entry) => blockingKinds.has(entry.kind));

  return {
    ok: blocking.length === 0,
    expected_result: trace.result,
    actual_result: actualResult,
    expected_turns: trace.turns,
    actual_turns: state.turn,
    steps_replayed: stepsReplayed,
    mismatches,
  };
};

export const formatReexecuteSummary = (result: TraceReexecuteResult): string => {
  const lines = [
    '--- re-execute verification ---',
    `ok: ${result.ok ? 'yes' : 'NO'}`,
    `result: expected ${result.expected_result}, actual ${result.actual_result}`,
    `turns: expected ${result.expected_turns}, actual ${result.actual_turns}`,
    `steps replayed: ${result.steps_replayed}`,
  ];
  for (const mismatch of result.mismatches) {
    lines.push(`  mismatch [${mismatch.kind}] step ${mismatch.step_index + 1}: ${mismatch.message}`);
  }
  return lines.join('\n');
};

export const buildTraceReplayReport = (input: {
  tracePath: string;
  trace: PlaythroughTrace;
  scorecard?: PlaythroughScorecard;
  scorecardPath?: string;
  inspectStepCount: number;
  reexecute?: TraceReexecuteResult;
  diagnostics?: TraceReplayDiagnostic[];
}): TraceReplayReport => ({
  schema_version: TRACE_REPLAY_REPORT_SCHEMA_VERSION,
  generated_at: new Date().toISOString(),
  trace_path: input.tracePath,
  ...(input.scorecardPath ? { scorecard_path: input.scorecardPath } : {}),
  trace: {
    version: input.trace.version,
    seed: input.trace.seed,
    persona: input.trace.persona,
    result: input.trace.result,
    turns: input.trace.turns,
    step_count: input.trace.steps.length,
    ...(input.trace.player_kind ? { player_kind: input.trace.player_kind } : {}),
    ...(input.trace.challenge_mode ? { challenge_mode: input.trace.challenge_mode } : {}),
    ...(input.trace.scenario_pack ? { scenario_pack: input.trace.scenario_pack } : {}),
    ...(input.trace.session_label ? { session_label: input.trace.session_label } : {}),
  },
  ...(input.scorecard
    ? {
        scorecard_summary: {
          result: input.scorecard.result,
          turns: input.scorecard.turns,
          invalid_actions: input.scorecard.invalid_actions,
          softlocks: input.scorecard.softlocks,
          floors_reached: input.scorecard.floors_reached,
          ...(input.scorecard.diagnostics?.primary_category
            ? { primary_category: input.scorecard.diagnostics.primary_category }
            : {}),
        },
      }
    : {}),
  inspect_step_count: input.inspectStepCount,
  ...(input.reexecute ? { reexecute: input.reexecute } : {}),
  diagnostics: input.diagnostics ?? [],
});

export const renderTraceReplayReportMarkdown = (report: TraceReplayReport): string => {
  const lines = [
    '# Trace Replay Report',
    '',
    `- schema: ${report.schema_version}`,
    `- generated_at: ${report.generated_at}`,
    `- trace: ${report.trace_path}`,
    ...(report.scorecard_path ? [`- scorecard: ${report.scorecard_path}`] : []),
    '',
    '## Run',
    '',
    `- version: ${report.trace.version}`,
    `- seed: ${report.trace.seed}`,
    `- persona: ${report.trace.persona}`,
    `- result: ${report.trace.result}`,
    `- turns: ${report.trace.turns}`,
    `- steps: ${report.trace.step_count}`,
  ];

  if (report.scorecard_summary) {
    lines.push(
      '',
      '## Scorecard summary',
      '',
      `- invalid_actions: ${report.scorecard_summary.invalid_actions}`,
      `- softlocks: ${report.scorecard_summary.softlocks}`,
      `- floors_reached: ${report.scorecard_summary.floors_reached}`,
    );
    if (report.scorecard_summary.primary_category) {
      lines.push(`- primary_category: ${report.scorecard_summary.primary_category}`);
    }
  }

  if (report.reexecute) {
    lines.push(
      '',
      '## Re-execute',
      '',
      `- ok: ${report.reexecute.ok}`,
      `- expected_result: ${report.reexecute.expected_result}`,
      `- actual_result: ${report.reexecute.actual_result}`,
      `- steps_replayed: ${report.reexecute.steps_replayed}`,
    );
    for (const mismatch of report.reexecute.mismatches) {
      lines.push(`- mismatch (${mismatch.kind}): ${mismatch.message}`);
    }
  }

  if (report.diagnostics.length > 0) {
    lines.push('', '## Diagnostics', '');
    for (const entry of report.diagnostics) {
      lines.push(`- [${entry.category}] ${entry.field ? `${entry.field}: ` : ''}${entry.message}`);
    }
  }

  return lines.join('\n');
};

export const writeTraceReplayReport = async (
  reportPath: string,
  report: TraceReplayReport,
): Promise<void> => {
  const jsonPath = reportPath.endsWith('.json')
    ? reportPath
    : reportPath.endsWith('.md')
      ? reportPath.replace(/\.md$/u, '.json')
      : `${reportPath}.json`;
  const markdownPath = reportPath.endsWith('.md')
    ? reportPath
    : reportPath.endsWith('.json')
      ? reportPath.replace(/\.json$/u, '.md')
      : `${reportPath}.md`;

  await mkdir(path.dirname(jsonPath), { recursive: true });
  await mkdir(path.dirname(markdownPath), { recursive: true });
  await writeFile(jsonPath, stringifyDeterministicJson(report), 'utf8');
  await writeFile(markdownPath, `${renderTraceReplayReportMarkdown(report)}\n`, 'utf8');
};

export const readTraceFileSnapshot = async (
  tracePath: string,
): Promise<{ mtimeMs: number; size: number }> => {
  const fileStat = await stat(tracePath);
  return { mtimeMs: fileStat.mtimeMs, size: fileStat.size };
};

export const assertTraceFileUnchanged = (
  before: { mtimeMs: number; size: number },
  after: { mtimeMs: number; size: number },
): void => {
  if (before.mtimeMs !== after.mtimeMs || before.size !== after.size) {
    throw new Error('Trace evidence file was modified during replay.');
  }
};

/** Lightweight live summary after re-execute (for debugging softlocks). */
export const summarizeLiveState = (state: GameState): StateSummary => buildStateSummary(state);
