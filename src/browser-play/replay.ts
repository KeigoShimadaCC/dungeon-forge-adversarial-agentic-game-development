import { readFile } from 'node:fs/promises';

import {
  buildTraceReplayInspectOutput,
  collectTraceReplayDiagnostics,
  formatReplayStep,
  formatTraceReplayHeader,
  parseTraceJson,
  readTraceFileSnapshot,
  type TraceReplayDiagnostic,
} from '../harness/trace-replay.js';
import type { PlaythroughTrace, TraceStep } from '../harness/types.js';

export interface BrowserReplayStepView {
  index: number;
  total: number;
  turn: number;
  render: string;
  action: TraceStep['chosen_action'];
  availableActions: TraceStep['available_actions'];
  events: TraceStep['events'];
  state: TraceStep['state_summary'];
  terminalStatus: TraceStep['terminalStatus'];
  valid: boolean;
  formatted: string;
}

export interface BrowserReplayLoadResult {
  label: 'Read-only trace replay inspection';
  ok: boolean;
  tracePath: string;
  diagnostics: TraceReplayDiagnostic[];
  readOnly: boolean;
  fileSnapshot?: {
    before: { mtimeMs: number; size: number };
    after: { mtimeMs: number; size: number };
  };
  trace?: {
    version: string;
    seed: string;
    persona: string;
    result: string;
    turns: number;
    stepCount: number;
    player_kind?: string;
    human_play_mode?: string;
    session_label?: string;
  };
  steps: BrowserReplayStepView[];
  inspectText?: string;
  traceHeader?: string;
}

const toStepView = (
  step: TraceStep,
  index: number,
  trace: PlaythroughTrace,
): BrowserReplayStepView => ({
  index,
  total: trace.steps.length,
  turn: step.turn,
  render: step.render,
  action: step.chosen_action,
  availableActions: step.available_actions,
  events: step.events,
  state: step.state_summary,
  terminalStatus: step.terminalStatus,
  valid: step.valid,
  formatted: formatReplayStep(step, index, {
    includeRender: true,
    previousSummary: index > 0 ? trace.steps[index - 1]?.state_summary : undefined,
  }),
});

export const loadBrowserReplay = async (
  tracePath: string,
): Promise<BrowserReplayLoadResult> => {
  let before: { mtimeMs: number; size: number } | undefined;
  try {
    before = await readTraceFileSnapshot(tracePath);
    const rawText = await readFile(tracePath, 'utf8');
    const parsed = parseTraceJson(rawText);
    const validation = collectTraceReplayDiagnostics(parsed);
    const after = await readTraceFileSnapshot(tracePath);
    const readOnly = before.mtimeMs === after.mtimeMs && before.size === after.size;

    if (!validation.ok) {
      return {
        label: 'Read-only trace replay inspection',
        ok: false,
        tracePath,
        diagnostics: validation.diagnostics,
        readOnly,
        fileSnapshot: { before, after },
        steps: [],
      };
    }

    const trace = parsed as PlaythroughTrace;
    return {
      label: 'Read-only trace replay inspection',
      ok: true,
      tracePath,
      diagnostics: validation.diagnostics,
      readOnly,
      fileSnapshot: { before, after },
      trace: {
        version: trace.version,
        seed: trace.seed,
        persona: trace.persona,
        result: trace.result,
        turns: trace.turns,
        stepCount: trace.steps.length,
        ...(trace.player_kind ? { player_kind: trace.player_kind } : {}),
        ...(trace.human_play_mode ? { human_play_mode: trace.human_play_mode } : {}),
        ...(trace.session_label ? { session_label: trace.session_label } : {}),
      },
      steps: trace.steps.map((step, index) => toStepView(step, index, trace)),
      inspectText: buildTraceReplayInspectOutput(trace, undefined, { includeRender: true }),
      traceHeader: formatTraceReplayHeader(trace),
    };
  } catch (error) {
    const after = before ? await readTraceFileSnapshot(tracePath).catch(() => before) : undefined;
    const message = error instanceof Error ? error.message : String(error);
    return {
      label: 'Read-only trace replay inspection',
      ok: false,
      tracePath,
      diagnostics: [
        {
          category: 'blocker',
          field: 'trace',
          message,
        },
      ],
      readOnly: before !== undefined && after !== undefined
        ? before.mtimeMs === after.mtimeMs && before.size === after.size
        : true,
      ...(before && after ? { fileSnapshot: { before, after } } : {}),
      steps: [],
    };
  }
};
