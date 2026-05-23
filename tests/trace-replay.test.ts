import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { stringifyDeterministicJson } from '../src/harness/json.js';
import { runPlaythrough } from '../src/harness/runner.js';
import {
  buildTraceReplayInspectOutput,
  collectTraceReplayDiagnostics,
  formatTraceReplayValidationMessage,
  loadTraceFromFile,
  parseTraceJson,
  readTraceFileSnapshot,
  reexecuteTrace,
  TraceReplayValidationError,
} from '../src/harness/trace-replay.js';
import { runTraceReplayCli } from '../src/harness/trace-replay-cli.js';

describe('trace replay', () => {
  it('replays a valid harness trace to the recorded terminal status', async () => {
    const { trace } = await runPlaythrough({
      seed: 'seed_001',
      policyId: 'greedy-item-picker',
      version: 'v001',
      dryRun: true,
    });

    const result = reexecuteTrace(trace);
    expect(result.ok).toBe(true);
    expect(result.actual_result).toBe(trace.result);
    expect(result.steps_replayed).toBe(trace.steps.length);
  });

  it('inspect output includes actions, reasons, events, and renders', async () => {
    const { trace, scorecard } = await runPlaythrough({
      seed: 'seed_002',
      policyId: 'greedy-item-picker',
      version: 'v001',
      dryRun: true,
    });

    const output = buildTraceReplayInspectOutput(trace, scorecard);
    expect(output).toContain('=== trace replay ===');
    expect(output).toContain('--- scorecard context ---');
    expect(output).toContain('action:');
    expect(output).toContain('events:');
    expect(output).toContain('render:');
    expect(output).toContain('softlocks');
  });

  it('reports clear diagnostics for malformed trace JSON', () => {
    const validation = collectTraceReplayDiagnostics({
      version: 'v001',
      seed: 'seed_001',
      persona: 'greedy-fighter',
      result: 'WIN',
      turns: 1,
      steps: [
        {
          turn: 0,
          render: 42,
          available_actions: [],
          chosen_action: { id: 'x' },
          valid: true,
          events: 'not-an-array',
          terminalStatus: 'ACTIVE',
        },
      ],
    });

    expect(validation.ok).toBe(false);
    expect(validation.blockers.length).toBeGreaterThan(0);
    expect(formatTraceReplayValidationMessage(validation)).toContain('[blocker]');
    expect(formatTraceReplayValidationMessage(validation)).toContain('steps[0]');
  });

  it('rejects invalid JSON with a parse diagnostic', () => {
    expect(() => parseTraceJson('{not json')).toThrow(TraceReplayValidationError);
  });

  it('does not modify the original trace file during CLI inspect', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-trace-replay-'));
    try {
      const { trace, artifacts } = await runPlaythrough({
        seed: 'seed_003',
        policyId: 'greedy-item-picker',
        version: 'v001',
        runsRoot,
      });

      const tracePath = artifacts.tracePath;
      const before = await readTraceFileSnapshot(tracePath);
      const beforeText = await readFile(tracePath, 'utf8');

      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      await runTraceReplayCli(['--trace', tracePath, '--mode', 'inspect', '--no-render']);
      stdoutSpy.mockRestore();

      const after = await readTraceFileSnapshot(tracePath);
      const afterText = await readFile(tracePath, 'utf8');
      expect(after).toEqual(before);
      expect(afterText).toBe(beforeText);

      const reloaded = await loadTraceFromFile(tracePath);
      expect(reloaded.result).toBe(trace.result);
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('writes only derived replay report files when requested', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-trace-replay-report-'));
    try {
      const { artifacts, trace } = await runPlaythrough({
        seed: 'seed_004',
        policyId: 'greedy-item-picker',
        version: 'v001',
        runsRoot,
      });

      const tracePath = artifacts.tracePath;
      const reportBase = path.join(runsRoot, 'replay_report');
      const traceBefore = await stat(tracePath);

      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      await runTraceReplayCli([
        '--trace',
        tracePath,
        '--mode',
        'both',
        '--from-step',
        '2',
        '--to-step',
        '999',
        '--write-report',
        reportBase,
      ]);
      stdoutSpy.mockRestore();

      const traceAfter = await stat(tracePath);
      expect(traceAfter.mtimeMs).toBe(traceBefore.mtimeMs);
      expect(traceAfter.size).toBe(traceBefore.size);

      const jsonReport = await readFile(`${reportBase}.json`, 'utf8');
      const parsed = JSON.parse(jsonReport) as {
        inspect_step_count: number;
        schema_version: string;
        reexecute?: { ok: boolean };
      };
      expect(parsed.schema_version).toBe('trace_replay_report_v1');
      expect(parsed.reexecute?.ok).toBe(true);
      expect(parsed.inspect_step_count).toBe(Math.max(0, trace.steps.length - 1));

      const explicitMarkdownPath = path.join(runsRoot, 'nested', 'explicit_replay_report.md');
      const secondStdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      await runTraceReplayCli([
        '--trace',
        tracePath,
        '--mode',
        'inspect',
        '--write-report',
        explicitMarkdownPath,
      ]);
      secondStdoutSpy.mockRestore();

      expect(await readFile(explicitMarkdownPath, 'utf8')).toContain('# Trace Replay Report');
      expect(
        await readFile(path.join(runsRoot, 'nested', 'explicit_replay_report.json'), 'utf8'),
      ).toContain('"trace_replay_report_v1"');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('surfaces problem_run metadata in inspect header for diagnostic runs', async () => {
    const { trace } = await runPlaythrough({
      seed: 'seed_005',
      policyId: 'random',
      version: 'v001',
      dryRun: true,
    });

    const output = buildTraceReplayInspectOutput(trace);
    if (trace.metadata?.problem_run?.categories.length) {
      expect(output).toContain('problem_run:');
    } else {
      expect(output).toContain('result:');
    }
  });

  it('fails verify mode with exit code when re-execute does not reach expected result', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-trace-replay-bad-'));
    try {
      const { trace, artifacts } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'greedy-item-picker',
        version: 'v001',
        runsRoot,
      });

      const corrupted = {
        ...trace,
        result: trace.result === 'WIN' ? 'LOSS' : 'WIN',
      };
      const tracePath = artifacts.tracePath;
      await writeFile(tracePath, `${stringifyDeterministicJson(corrupted)}\n`, 'utf8');

      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const priorExit = process.exitCode;
      process.exitCode = undefined;
      await runTraceReplayCli(['--trace', tracePath, '--mode', 'verify']);
      expect(process.exitCode).toBe(1);
      process.exitCode = priorExit;
      stdoutSpy.mockRestore();
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });
});
