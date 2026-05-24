import { mkdir, mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildDefaultFakeResponse,
  parseRestrictedAgentStrictJsonResponse,
  runRestrictedAgentDryRun,
  runRestrictedAgentDryRunCli,
  validateRestrictedAgentDryRunResponse,
  type RestrictedAgentTurnInput,
} from '../src/harness/restricted-agent/index.js';

const makeTurnInput = (): RestrictedAgentTurnInput => ({
  schemaVersion: 1,
  phase: 'PHASE-29C',
  taskId: 'task-001',
  objective: 'Dry-run restricted agent.',
  allowedPaths: ['src/harness/restricted-agent/**'],
  forbiddenPaths: ['.env', 'runs/**'],
  relevantSnippets: [
    {
      path: 'src/harness/restricted-agent/example.ts',
      startLine: 1,
      endLine: 2,
      text: 'const safe = true;\nexport { safe };',
    },
  ],
  previousFailedChecks: [{ commandId: 'focused_tests', summary: 'Focused tests failed.' }],
  patchBudget: { maxFiles: 2, maxBytes: 4000 },
  availableCommands: [
    {
      id: 'focused_tests',
      label: 'Focused tests',
      description: 'Run focused tests.',
    },
  ],
});

const withOutDir = async (fn: (outDir: string) => Promise<void>): Promise<void> => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'df-restricted-api-loop-'));
  await fn(outDir);
};

describe('Phase 29C restricted-agent API dry-run loop', () => {
  it('parses raw strict JSON and rejects fenced or surrounding prose', () => {
    expect(parseRestrictedAgentStrictJsonResponse('{"ok":true}').ok).toBe(true);
    expect(parseRestrictedAgentStrictJsonResponse('```json\n{"ok":true}\n```')).toEqual({
      ok: false,
      diagnostic: expect.objectContaining({ field: 'rawResponse' }),
    });
    expect(parseRestrictedAgentStrictJsonResponse('Here is JSON: {"ok":true}')).toEqual({
      ok: false,
      diagnostic: expect.objectContaining({ field: 'rawResponse' }),
    });
  });

  it('accepts valid fake provider output and writes dry-run evidence only', async () => {
    await withOutDir(async (outDir) => {
      const turnInput = makeTurnInput();
      const result = await runRestrictedAgentDryRun({
        turnInput,
        outDir,
        providerMode: 'fake',
      });

      expect(result.decision.status).toBe('accepted');
      expect(result.parsedResponse).toEqual(
        expect.objectContaining({
          phase: 'PHASE-29C',
          taskId: 'task-001',
          action: 'request_check',
        }),
      );
      await expect(stat(path.join(outDir, 'prompt-context.json'))).resolves.toBeTruthy();
      await expect(stat(path.join(outDir, 'raw-response.txt'))).resolves.toBeTruthy();
      await expect(stat(path.join(outDir, 'parsed-response.json'))).resolves.toBeTruthy();
      await expect(stat(path.join(outDir, 'validation-diagnostics.json'))).resolves.toBeTruthy();
      await expect(stat(path.join(outDir, 'dry-run-decision.json'))).resolves.toBeTruthy();

      const promptContext = await readFile(path.join(outDir, 'prompt-context.json'), 'utf8');
      expect(promptContext).toContain('src/harness/restricted-agent/example.ts');
      expect(promptContext).not.toContain('const safe = true');

      await expect(stat(path.join(outDir, 'src/harness/restricted-agent/example.ts'))).rejects.toThrow();
    });
  });

  it('blocks malformed output, unknown checks, and phase or task mismatches', async () => {
    const turnInput = makeTurnInput();
    expect(validateRestrictedAgentDryRunResponse('not json', turnInput).diagnostics).toContainEqual(
      expect.objectContaining({ field: 'rawResponse' }),
    );

    const unknownCheck = JSON.stringify({
      schemaVersion: 1,
      phase: 'PHASE-29C',
      taskId: 'task-001',
      action: 'request_check',
      rationale: 'Unknown check should block.',
      requestedChecks: ['pnpm test'],
    });
    expect(validateRestrictedAgentDryRunResponse(unknownCheck, turnInput).diagnostics).toContainEqual(
      expect.objectContaining({ category: 'command' }),
    );

    const mismatch = JSON.stringify({
      schemaVersion: 1,
      phase: 'PHASE-OTHER',
      taskId: 'task-999',
      action: 'request_check',
      rationale: 'Wrong phase and task.',
      requestedChecks: ['focused_tests'],
    });
    const mismatchDiagnostics = validateRestrictedAgentDryRunResponse(mismatch, turnInput).diagnostics;
    expect(mismatchDiagnostics).toContainEqual(expect.objectContaining({ field: 'phase' }));
    expect(mismatchDiagnostics).toContainEqual(expect.objectContaining({ field: 'taskId' }));
  });

  it('blocks real provider mode without credentials before network access', async () => {
    await withOutDir(async (outDir) => {
      const result = await runRestrictedAgentDryRun({
        turnInput: makeTurnInput(),
        outDir,
        providerMode: 'real',
        env: {},
        client: undefined,
      });

      expect(result.decision.status).toBe('blocked');
      expect(result.validationDiagnostics).toContainEqual(
        expect.objectContaining({ field: 'provider' }),
      );
      const decision = await readFile(path.join(outDir, 'dry-run-decision.json'), 'utf8');
      expect(decision).toContain('blocked');
    });
  });

  it('CLI supports fake smokes and missing-credential real mode without requiring credentials', async () => {
    await withOutDir(async (outDir) => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const fakeExit = await runRestrictedAgentDryRunCli(
        ['--provider', 'fake', '--phase', 'PHASE-29C', '--task', 'task-001', '--out', outDir],
        {
          stdout: { write: (chunk: string) => { stdout.push(chunk); return true; } },
          stderr: { write: (chunk: string) => { stderr.push(chunk); return true; } },
        },
      );
      expect(fakeExit).toBe(0);
      expect(stdout.join('')).toContain('"status": "accepted"');
      expect(stderr).toEqual([]);

      const blockedDir = path.join(outDir, 'blocked');
      await mkdir(blockedDir);
      const malformedExit = await runRestrictedAgentDryRunCli(
        [
          '--provider',
          'fake',
          '--fake-response',
          'malformed',
          '--phase',
          'PHASE-29C',
          '--task',
          'task-001',
          '--out',
          blockedDir,
        ],
        {
          stdout: { write: (chunk: string) => { stdout.push(chunk); return true; } },
          stderr: { write: (chunk: string) => { stderr.push(chunk); return true; } },
        },
      );
      expect(malformedExit).toBe(2);

      const realDir = path.join(outDir, 'real');
      await mkdir(realDir);
      const realExit = await runRestrictedAgentDryRunCli(
        ['--provider', 'real', '--phase', 'PHASE-29C', '--task', 'task-001', '--out', realDir],
        {
          stdout: { write: (chunk: string) => { stdout.push(chunk); return true; } },
          stderr: { write: (chunk: string) => { stderr.push(chunk); return true; } },
        },
      );
      expect(realExit).toBe(2);
    });
  });

  it('default fake response is phase/task bound', () => {
    const response = JSON.parse(buildDefaultFakeResponse(makeTurnInput())) as {
      phase: string;
      taskId: string;
    };
    expect(response).toMatchObject({ phase: 'PHASE-29C', taskId: 'task-001' });
  });
});
