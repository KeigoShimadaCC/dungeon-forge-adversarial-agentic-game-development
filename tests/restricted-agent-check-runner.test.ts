import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  runRestrictedAgentChecks,
  runRestrictedAgentRepairLoop,
  summarizeRestrictedAgentFailedChecks,
  validateRestrictedAgentModelResponse,
  type RestrictedAgentCommandDefinition,
  type RestrictedAgentCommandExecutor,
  type RestrictedAgentTurnInput,
} from '../src/harness/restricted-agent/index.js';

const baseTurnInput = (phase = 'PHASE-30C'): RestrictedAgentTurnInput => ({
  schemaVersion: 1,
  phase,
  taskId: 'task-001',
  objective: 'Test restricted check runner.',
  allowedPaths: ['src/harness/restricted-agent/**'],
  forbiddenPaths: ['.env', 'runs/**'],
  relevantSnippets: [],
  previousFailedChecks: [],
  patchBudget: { maxFiles: 1, maxBytes: 2000 },
  availableCommands: [
    { id: 'focused_tests', label: 'Focused tests', description: 'Focused test command.' },
  ],
});

const registry = {
  focused_tests: {
    id: 'focused_tests',
    label: 'Focused tests',
    description: 'Focused test command.',
    command: ['pnpm', 'test', 'tests/restricted-agent-check-runner.test.ts'],
  },
  failing_check: {
    id: 'failing_check',
    label: 'Failing check',
    description: 'Fake failing command.',
    command: ['node', 'fake-fail.js'],
  },
};

const fakeExecutor = (
  resultById: Record<string, { exitCode: number; stdout?: string; stderr?: string }>,
): RestrictedAgentCommandExecutor => async (command: RestrictedAgentCommandDefinition) => {
  const result = resultById[command.id] ?? { exitCode: 0, stdout: 'ok', stderr: '' };
  return {
    exitCode: result.exitCode,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    durationMs: 7,
  };
};

describe('Phase 30C restricted check runner and repair loop', () => {
  it('blocks unknown command IDs and raw shell-looking requests', async () => {
    const results = await runRestrictedAgentChecks({
      cwd: process.cwd(),
      registry,
      requestedChecks: ['missing_check', 'pnpm test'],
      executor: fakeExecutor({}),
    });

    expect(results).toEqual([
      expect.objectContaining({ commandId: 'missing_check', status: 'blocked' }),
      expect.objectContaining({ commandId: 'pnpm test', status: 'blocked' }),
    ]);
    expect(results.flatMap((result) => result.diagnostics)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('Unknown restricted-agent command ID') }),
        expect.objectContaining({ message: expect.stringContaining('not raw shell command strings') }),
      ]),
    );
  });

  it('records passing and failing check evidence with bounded summaries', async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), 'df-check-runner-'));
    const results = await runRestrictedAgentChecks({
      cwd: process.cwd(),
      registry,
      requestedChecks: ['focused_tests', 'failing_check'],
      executor: fakeExecutor({
        focused_tests: { exitCode: 0, stdout: 'pass output' },
        failing_check: { exitCode: 1, stderr: 'failure details' },
      }),
      evidenceDir: outDir,
    });

    expect(results).toEqual([
      expect.objectContaining({ commandId: 'focused_tests', status: 'pass', summary: 'focused_tests: pass' }),
      expect.objectContaining({ commandId: 'failing_check', status: 'fail', summary: expect.stringContaining('failure details') }),
    ]);
    expect(summarizeRestrictedAgentFailedChecks(results)).toEqual([
      { commandId: 'failing_check', summary: expect.stringContaining('failing_check: fail') },
    ]);
    expect(await readFile(path.join(outDir, 'check-results.json'), 'utf8')).toContain('failing_check');
  });

  it('feeds failed-check summaries into the next repair attempt and stops at max attempts', async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), 'df-repair-loop-'));
    const response = JSON.stringify({
      schemaVersion: 1,
      phase: 'PHASE-30C',
      taskId: 'task-001',
      action: 'request_check',
      rationale: 'Request fake failing check.',
      requestedChecks: ['failing_check'],
    });

    const report = await runRestrictedAgentRepairLoop({
      turnInput: baseTurnInput(),
      cwd: process.cwd(),
      outDir,
      maxAttempts: 2,
      registry,
      fakeResponses: [response, response],
      executor: fakeExecutor({
        failing_check: { exitCode: 1, stderr: 'still failing' },
      }),
    });

    expect(report.status).toBe('max_attempts');
    expect(report.attempts).toHaveLength(2);
    expect(report.finalFailedChecks[0]?.summary).toContain('still failing');
    const secondPrompt = await readFile(path.join(outDir, 'attempt-002', 'prompt-context.json'), 'utf8');
    expect(secondPrompt).toContain('still failing');
  });

  it('produces passing repair-loop evidence without commit, merge, or phase-state authority', async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), 'df-repair-loop-pass-'));
    const response = JSON.stringify({
      schemaVersion: 1,
      phase: 'PHASE-30C',
      taskId: 'task-001',
      action: 'request_check',
      rationale: 'Request passing check.',
      requestedChecks: ['focused_tests'],
    });

    const report = await runRestrictedAgentRepairLoop({
      turnInput: baseTurnInput(),
      cwd: process.cwd(),
      outDir,
      maxAttempts: 1,
      registry,
      fakeResponses: [response],
      executor: fakeExecutor({
        focused_tests: { exitCode: 0, stdout: 'all good' },
      }),
    });

    expect(report.status).toBe('pass');
    expect(report.authority).toEqual({
      canCommit: false,
      canMerge: false,
      canChangePhaseState: false,
    });
    expect(await readFile(path.join(outDir, 'repair-loop-report.json'), 'utf8')).toContain('"status": "pass"');
  });

  it('rejects model outputs that try to claim commit or merge authority', () => {
    const result = validateRestrictedAgentModelResponse({
      schemaVersion: 1,
      phase: 'PHASE-30C',
      taskId: 'task-001',
      action: 'request_check',
      rationale: 'Try forbidden authority.',
      requestedChecks: ['focused_tests'],
      commit: true,
      merge: true,
    }, { commandRegistry: registry });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'forbidden', field: '$.commit' }),
        expect.objectContaining({ category: 'forbidden', field: '$.merge' }),
      ]),
    );
  });
});
