import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assertTraceFileUnchanged,
  buildTraceReplayInspectOutput,
  buildTraceReplayReport,
  formatReexecuteSummary,
  loadScorecardFromFile,
  loadTraceFromFile,
  readTraceFileSnapshot,
  reexecuteTrace,
  resolveScorecardForReplay,
  writeTraceReplayReport,
  type BuildTraceReplayInspectOptions,
} from './trace-replay.js';

export const TRACE_REPLAY_CLI_USAGE = `Usage:
  pnpm run trace-replay -- --trace <path> [options]

Required:
  --trace <path>             Playthrough trace JSON (read-only evidence)

Optional:
  --scorecard <path>         Scorecard JSON for run summary context
  --mode <inspect|verify|both>  Default: inspect (evidence walkthrough without rerunning)
  --from-step <n>            1-based first step to show (default: 1)
  --to-step <n>              1-based last step to show (default: all)
  --no-render                Omit ASCII map render blocks from inspect output
  --write-report <path>      Write derived replay_report JSON + Markdown (does not edit trace)
  --help, -h                 Show this help text

Modes:
  inspect   Print header, scorecard context, and step-by-step evidence from the trace file.
  verify    Re-execute chosen actions against the engine and compare terminal result.
  both      Inspect output followed by verify summary.

Notes:
  Replay treats trace files as immutable evidence. Only --write-report creates new files.
`;

export type TraceReplayCliMode = 'inspect' | 'verify' | 'both';

export interface TraceReplayCliIo {
  stdout?: (value: string) => void;
  stderr?: (value: string) => void;
}

interface ParsedTraceReplayArgs {
  tracePath?: string;
  scorecardPath?: string;
  mode: TraceReplayCliMode;
  fromStep?: number;
  toStep?: number;
  includeRender: boolean;
  writeReportPath?: string;
  help: boolean;
}

const parsePositiveInt = (value: string, flag: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
};

export const parseTraceReplayCliArgs = (argv: string[]): ParsedTraceReplayArgs => {
  const args: ParsedTraceReplayArgs = {
    mode: 'inspect',
    includeRender: true,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--') {
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--trace' && next) {
      args.tracePath = next;
      index += 1;
    } else if (arg === '--scorecard' && next) {
      args.scorecardPath = next;
      index += 1;
    } else if (arg === '--mode' && next) {
      if (next !== 'inspect' && next !== 'verify' && next !== 'both') {
        throw new Error('--mode must be inspect, verify, or both.');
      }
      args.mode = next;
      index += 1;
    } else if (arg === '--from-step' && next) {
      args.fromStep = parsePositiveInt(next, '--from-step');
      index += 1;
    } else if (arg === '--to-step' && next) {
      args.toStep = parsePositiveInt(next, '--to-step');
      index += 1;
    } else if (arg === '--no-render') {
      args.includeRender = false;
    } else if (arg === '--write-report' && next) {
      args.writeReportPath = next;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
};

const resolveInspectRange = (
  fromStep: number | undefined,
  toStep: number | undefined,
  stepCount: number,
): BuildTraceReplayInspectOptions => {
  const from = fromStep !== undefined ? fromStep - 1 : 0;
  const to = toStep !== undefined ? toStep : stepCount;
  return {
    fromStep: from,
    toStep: to,
  };
};

export const runTraceReplayCli = async (
  argv: string[] = process.argv.slice(2),
  io: TraceReplayCliIo = {},
): Promise<void> => {
  const stdout = io.stdout ?? ((value: string) => process.stdout.write(value));
  const args = parseTraceReplayCliArgs(argv);
  if (args.help) {
    stdout(`${TRACE_REPLAY_CLI_USAGE}\n`);
    return;
  }

  if (!args.tracePath) {
    throw new Error('Missing required --trace <path>.');
  }

  const tracePath = path.resolve(args.tracePath);
  const beforeSnapshot = await readTraceFileSnapshot(tracePath);
  const originalBytes = await readFile(tracePath);

  const trace = await loadTraceFromFile(tracePath);
  const scorecard = args.scorecardPath
    ? await loadScorecardFromFile(path.resolve(args.scorecardPath))
    : resolveScorecardForReplay(trace, tracePath);

  const inspectRange = resolveInspectRange(args.fromStep, args.toStep, trace.steps.length);
  const inspectOptions: BuildTraceReplayInspectOptions = {
    ...inspectRange,
    includeRender: args.includeRender,
  };

  const outputParts: string[] = [];

  if (args.mode === 'inspect' || args.mode === 'both') {
    outputParts.push(buildTraceReplayInspectOutput(trace, scorecard, inspectOptions));
  }

  let reexecute;
  if (args.mode === 'verify' || args.mode === 'both') {
    reexecute = reexecuteTrace(trace);
    outputParts.push(formatReexecuteSummary(reexecute));
    if (!reexecute.ok) {
      process.exitCode = 1;
    }
  }

  const inspectStepCount =
    Math.max(
      0,
      Math.min(trace.steps.length, inspectOptions.toStep ?? trace.steps.length) -
        Math.max(0, inspectOptions.fromStep ?? 0),
    );

  if (args.writeReportPath) {
    const report = buildTraceReplayReport({
      tracePath,
      trace,
      scorecard,
      scorecardPath: args.scorecardPath ? path.resolve(args.scorecardPath) : undefined,
      inspectStepCount,
      reexecute,
    });
    await writeTraceReplayReport(path.resolve(args.writeReportPath), report);
    outputParts.push(`Wrote replay report: ${path.resolve(args.writeReportPath)}`);
  }

  if (outputParts.length > 0) {
    stdout(`${outputParts.join('\n\n')}\n`);
  }

  const afterSnapshot = await readTraceFileSnapshot(tracePath);
  assertTraceFileUnchanged(beforeSnapshot, afterSnapshot);

  const afterBytes = await readFile(tracePath);
  if (!originalBytes.equals(afterBytes)) {
    throw new Error('Trace evidence file content changed during replay.');
  }
};

const isMainModule = (): boolean => {
  const entry = process.argv[1];
  return entry !== undefined && entry.endsWith('trace-replay-cli.js');
};

if (isMainModule()) {
  runTraceReplayCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
