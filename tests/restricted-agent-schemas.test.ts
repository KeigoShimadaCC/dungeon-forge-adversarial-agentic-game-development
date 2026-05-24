import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RESTRICTED_AGENT_COMMAND_REGISTRY,
  RESTRICTED_AGENT_SCHEMA_VERSION,
  buildRestrictedAgentEvidenceRecord,
  validateRestrictedAgentModelResponse,
} from '../src/harness/restricted-agent/index.js';

const baseResponse = {
  schemaVersion: RESTRICTED_AGENT_SCHEMA_VERSION,
  phase: 'PHASE-29A',
  taskId: 'task-001',
  rationale: 'Validate the restricted agent contract.',
};

describe('Phase 29A restricted API coding agent schemas', () => {
  it('accepts the fixed v1 action set', () => {
    expect(
      validateRestrictedAgentModelResponse({
        ...baseResponse,
        action: 'search_allowed',
      }).ok,
    ).toBe(true);
    expect(
      validateRestrictedAgentModelResponse({
        ...baseResponse,
        action: 'read_file_range',
      }).ok,
    ).toBe(true);
    expect(
      validateRestrictedAgentModelResponse({
        ...baseResponse,
        action: 'propose_patch',
        patches: [
          {
            path: 'src/harness/example.ts',
            kind: 'replace_exact',
            expected: 'old exact text',
            replacement: 'new exact text',
          },
        ],
        requestedChecks: ['focused_tests'],
      }).ok,
    ).toBe(true);
    expect(
      validateRestrictedAgentModelResponse({
        ...baseResponse,
        action: 'request_check',
        requestedChecks: ['focused_tests', 'typecheck'],
      }).ok,
    ).toBe(true);
    expect(
      validateRestrictedAgentModelResponse({
        ...baseResponse,
        action: 'explain_blocker',
        blockers: [{ code: 'missing_context', message: 'Required context was not provided.' }],
      }).ok,
    ).toBe(true);
  });

  it('blocks invalid action names and malformed action payloads', () => {
    const invalidAction = validateRestrictedAgentModelResponse({
      ...baseResponse,
      action: 'edit_file',
    });
    expect(invalidAction.ok).toBe(false);
    expect(invalidAction.diagnostics).toContainEqual(
      expect.objectContaining({ category: 'action', field: 'action' }),
    );

    const missingPatch = validateRestrictedAgentModelResponse({
      ...baseResponse,
      action: 'propose_patch',
    });
    expect(missingPatch.ok).toBe(false);
    expect(missingPatch.diagnostics).toContainEqual(
      expect.objectContaining({ field: 'patches' }),
    );

    const incompatible = validateRestrictedAgentModelResponse({
      ...baseResponse,
      action: 'request_check',
      requestedChecks: ['focused_tests'],
      patches: [
        {
          path: 'src/harness/example.ts',
          kind: 'create_file',
          replacement: 'export {};\n',
        },
      ],
    });
    expect(incompatible.ok).toBe(false);
    expect(incompatible.diagnostics).toContainEqual(
      expect.objectContaining({ field: 'patches' }),
    );
  });

  it('blocks unknown command IDs and raw shell strings', () => {
    const unknown = validateRestrictedAgentModelResponse({
      ...baseResponse,
      action: 'request_check',
      requestedChecks: ['not_registered'],
    });
    expect(unknown.ok).toBe(false);
    expect(unknown.diagnostics).toContainEqual(
      expect.objectContaining({ category: 'command', entry: 'not_registered' }),
    );

    const rawShell = validateRestrictedAgentModelResponse({
      ...baseResponse,
      action: 'request_check',
      requestedChecks: ['pnpm test tests/restricted-agent-schemas.test.ts'],
    });
    expect(rawShell.ok).toBe(false);
    expect(rawShell.diagnostics).toContainEqual(
      expect.objectContaining({ category: 'command', field: 'requestedChecks' }),
    );
  });

  it('defines command IDs without giving the model raw command authority', () => {
    expect(DEFAULT_RESTRICTED_AGENT_COMMAND_REGISTRY.focused_tests.command).toEqual([
      'pnpm',
      'test',
      'tests/restricted-agent-schemas.test.ts',
    ]);
    expect(Object.keys(DEFAULT_RESTRICTED_AGENT_COMMAND_REGISTRY)).toEqual(
      expect.arrayContaining(['focused_tests', 'typecheck', 'lint', 'diff_check']),
    );
  });

  it('blocks forbidden direct-authority fields', () => {
    const result = validateRestrictedAgentModelResponse({
      ...baseResponse,
      action: 'propose_patch',
      patches: [
        {
          path: 'src/harness/example.ts',
          kind: 'replace_exact',
          expected: 'old',
          replacement: 'new',
          shell: 'git commit -am unsafe',
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ category: 'forbidden', entry: 'shell' }),
    );
  });

  it('blocks forbidden patch paths and unsupported operations', () => {
    const forbiddenPaths = [
      '.env',
      'private/token.txt',
      'runs/phase-runner/PHASE-29A/evidence.json',
      'pnpm-lock.yaml',
      'package.json',
    ];

    for (const forbiddenPath of forbiddenPaths) {
      const result = validateRestrictedAgentModelResponse({
        ...baseResponse,
        action: 'propose_patch',
        patches: [
          {
            path: forbiddenPath,
            kind: 'replace_exact',
            expected: 'old',
            replacement: 'new',
          },
        ],
      });
      expect(result.ok, forbiddenPath).toBe(false);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ category: 'forbidden' }),
      );
    }

    const deleteRequest = validateRestrictedAgentModelResponse({
      ...baseResponse,
      action: 'propose_patch',
      patches: [
        {
          path: 'src/harness/example.ts',
          kind: 'delete_file',
        },
      ],
    });
    expect(deleteRequest.ok).toBe(false);
    expect(deleteRequest.diagnostics).toContainEqual(
      expect.objectContaining({ category: 'patch', field: 'patches[0].kind' }),
    );
  });

  it('requires exact expected text for edit patches and omits it for create_file', () => {
    const missingExpected = validateRestrictedAgentModelResponse({
      ...baseResponse,
      action: 'propose_patch',
      patches: [
        {
          path: 'src/harness/example.ts',
          kind: 'insert_after_exact',
          replacement: 'new',
        },
      ],
    });
    expect(missingExpected.ok).toBe(false);
    expect(missingExpected.diagnostics).toContainEqual(
      expect.objectContaining({ field: 'patches[0].expected' }),
    );

    const createFile = validateRestrictedAgentModelResponse({
      ...baseResponse,
      action: 'propose_patch',
      patches: [
        {
          path: 'src/harness/restricted-agent/example.ts',
          kind: 'create_file',
          replacement: 'export {};\n',
        },
      ],
    });
    expect(createFile.ok).toBe(true);
  });

  it('builds evidence without exposing snippet text', () => {
    const turnInput = {
      schemaVersion: RESTRICTED_AGENT_SCHEMA_VERSION,
      phase: 'PHASE-29A',
      taskId: 'task-001',
      objective: 'Define schemas.',
      allowedPaths: ['src/harness/restricted-agent/**'],
      forbiddenPaths: ['.env'],
      relevantSnippets: [
        {
          path: 'src/harness/example.ts',
          startLine: 1,
          endLine: 2,
          text: 'secret-looking text must not be copied into evidence',
        },
      ],
      previousFailedChecks: [],
      patchBudget: { maxFiles: 2, maxBytes: 4000 },
      availableCommands: [
        {
          id: 'focused_tests',
          label: 'Focused tests',
          description: 'Run focused tests.',
        },
      ],
    };
    const response = validateRestrictedAgentModelResponse({
      ...baseResponse,
      action: 'request_check',
      requestedChecks: ['focused_tests'],
    });
    expect(response.ok).toBe(true);
    if (!response.ok) {
      return;
    }

    const evidence = buildRestrictedAgentEvidenceRecord({
      turnInput,
      response: response.response,
    });
    expect(evidence.exposedContext).toEqual([
      { path: 'src/harness/example.ts', startLine: 1, endLine: 2 },
    ]);
    expect(JSON.stringify(evidence)).not.toContain('secret-looking text');
  });
});
