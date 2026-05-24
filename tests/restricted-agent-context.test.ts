import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildRestrictedAgentContext,
  diagnoseRestrictedAgentPath,
  readRestrictedAgentFileRange,
  searchRestrictedAgentAllowed,
  type RestrictedAgentContextScope,
} from '../src/harness/restricted-agent/index.js';

const withRepo = async (fn: (repoRoot: string) => Promise<void>): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'df-restricted-context-'));
  await mkdir(path.join(repoRoot, 'src/harness/restricted-agent'), { recursive: true });
  await mkdir(path.join(repoRoot, 'docs'), { recursive: true });
  await mkdir(path.join(repoRoot, 'runs/v001'), { recursive: true });
  await mkdir(path.join(repoRoot, 'private'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'src/harness/restricted-agent/a.ts'),
    ['alpha one', 'needle beta', 'alpha three', 'omega four'].join('\n'),
    'utf8',
  );
  await writeFile(
    path.join(repoRoot, 'src/harness/restricted-agent/b.ts'),
    ['needle first', 'second line', 'needle third'].join('\n'),
    'utf8',
  );
  await writeFile(path.join(repoRoot, 'docs/RESTRICTED-API-CODING-AGENT.md'), 'needle doc\n', 'utf8');
  await writeFile(path.join(repoRoot, '.env'), 'SECRET_TOKEN=value\n', 'utf8');
  await writeFile(path.join(repoRoot, 'private/token.txt'), 'secret\n', 'utf8');
  await writeFile(path.join(repoRoot, 'runs/v001/evidence.json'), '{"secret":"no"}\n', 'utf8');
  await writeFile(path.join(repoRoot, 'src/harness/restricted-agent/binary.bin'), Buffer.from([1, 0, 2]));
  await fn(repoRoot);
};

const makeScope = (repoRoot: string): RestrictedAgentContextScope => ({
  repoRoot,
  phaseAllowedPaths: [
    'src/harness/restricted-agent/**',
    'docs/RESTRICTED-API-CODING-AGENT.md',
    'tests/restricted-agent-context.test.ts',
  ],
  taskAllowedPaths: ['src/harness/restricted-agent/**'],
  forbiddenPaths: ['src/harness/restricted-agent/forbidden.ts', '.env', 'private/**', 'runs/**'],
});

describe('Phase 29B restricted-agent context builder', () => {
  it('reads only explicit bounded line ranges from allowed intersection paths', async () => {
    await withRepo(async (repoRoot) => {
      const result = await readRestrictedAgentFileRange(makeScope(repoRoot), {
        path: 'src/harness/restricted-agent/a.ts',
        startLine: 2,
        endLine: 3,
      });

      expect(result.diagnostics).toEqual([]);
      expect(result.snippet).toEqual({
        path: 'src/harness/restricted-agent/a.ts',
        startLine: 2,
        endLine: 3,
        text: 'needle beta\nalpha three',
      });
      expect(result.exposure).toMatchObject({
        path: 'src/harness/restricted-agent/a.ts',
        startLine: 2,
        endLine: 3,
      });
    });
  });

  it('denies forbidden, credential, generated-evidence, absolute, and traversal paths without reading contents', async () => {
    await withRepo(async (repoRoot) => {
      const scope = makeScope(repoRoot);
      const deniedPaths = [
        '.env',
        'private/token.txt',
        'runs/v001/evidence.json',
        '/tmp/outside.txt',
        '../outside.txt',
        'docs/RESTRICTED-API-CODING-AGENT.md',
      ];

      for (const deniedPath of deniedPaths) {
        const result = await readRestrictedAgentFileRange(scope, {
          path: deniedPath,
          startLine: 1,
          endLine: 1,
        });
        expect(result.snippet, deniedPath).toBeUndefined();
        expect(result.diagnostics.length, deniedPath).toBeGreaterThan(0);
      }

      expect(diagnoseRestrictedAgentPath('.env', scope)).toContainEqual(
        expect.objectContaining({ code: 'credential_path' }),
      );
      expect(diagnoseRestrictedAgentPath('runs/v001/evidence.json', scope)).toContainEqual(
        expect.objectContaining({ code: 'generated_evidence_path' }),
      );
      expect(diagnoseRestrictedAgentPath('docs/RESTRICTED-API-CODING-AGENT.md', scope)).toContainEqual(
        expect.objectContaining({ code: 'out_of_scope' }),
      );
    });
  });

  it('reports missing files, binary files, invalid ranges, and oversized files as diagnostics', async () => {
    await withRepo(async (repoRoot) => {
      const scope = makeScope(repoRoot);

      await expect(
        readRestrictedAgentFileRange(scope, {
          path: 'src/harness/restricted-agent/missing.ts',
          startLine: 1,
          endLine: 1,
        }),
      ).resolves.toMatchObject({
        diagnostics: [expect.objectContaining({ code: 'missing_file' })],
      });

      await expect(
        readRestrictedAgentFileRange(scope, {
          path: 'src/harness/restricted-agent/binary.bin',
          startLine: 1,
          endLine: 1,
        }),
      ).resolves.toMatchObject({
        diagnostics: [expect.objectContaining({ code: 'binary_file' })],
      });

      await expect(
        readRestrictedAgentFileRange(scope, {
          path: 'src/harness/restricted-agent/a.ts',
          startLine: 3,
          endLine: 2,
        }),
      ).resolves.toMatchObject({
        diagnostics: [expect.objectContaining({ code: 'invalid_range' })],
      });

      await expect(
        readRestrictedAgentFileRange(
          scope,
          {
            path: 'src/harness/restricted-agent/a.ts',
            startLine: 1,
            endLine: 4,
          },
          { maxSnippetLines: 2 },
        ),
      ).resolves.toMatchObject({
        diagnostics: [expect.objectContaining({ code: 'invalid_range' })],
      });

      await expect(
        readRestrictedAgentFileRange(
          scope,
          {
            path: 'src/harness/restricted-agent/a.ts',
            startLine: 1,
            endLine: 1,
          },
          { maxReadableFileBytes: 2 },
        ),
      ).resolves.toMatchObject({
        diagnostics: [expect.objectContaining({ code: 'oversized_file' })],
      });
    });
  });

  it('searches allowed files deterministically with path/line/previews only', async () => {
    await withRepo(async (repoRoot) => {
      const result = await searchRestrictedAgentAllowed(makeScope(repoRoot), 'needle');

      expect(result.diagnostics).toEqual([
        expect.objectContaining({ code: 'binary_file', path: 'src/harness/restricted-agent/binary.bin' }),
      ]);
      expect(result.results).toEqual([
        {
          path: 'src/harness/restricted-agent/a.ts',
          lineNumber: 2,
          preview: 'needle beta',
        },
        {
          path: 'src/harness/restricted-agent/b.ts',
          lineNumber: 1,
          preview: 'needle first',
        },
        {
          path: 'src/harness/restricted-agent/b.ts',
          lineNumber: 3,
          preview: 'needle third',
        },
      ]);
      expect(JSON.stringify(result.results)).not.toContain('SECRET_TOKEN');
    });
  });

  it('enforces aggregate context budgets and deterministic snippet ordering', async () => {
    await withRepo(async (repoRoot) => {
      const result = await buildRestrictedAgentContext({
        phase: 'PHASE-29B',
        taskId: 'task-005',
        objective: 'Build bounded context.',
        scope: makeScope(repoRoot),
        snippetRequests: [
          { path: 'src/harness/restricted-agent/b.ts', startLine: 1, endLine: 1 },
          { path: 'src/harness/restricted-agent/a.ts', startLine: 2, endLine: 2 },
          { path: 'src/harness/restricted-agent/a.ts', startLine: 3, endLine: 3 },
        ],
        previousFailedChecks: [{ commandId: 'focused_tests', summary: 'Focused tests failed.' }],
        patchBudget: { maxFiles: 2, maxBytes: 2000 },
        budgets: { maxTotalSnippetLines: 2 },
      });

      expect(result.turnInput.relevantSnippets).toEqual([
        {
          path: 'src/harness/restricted-agent/a.ts',
          startLine: 2,
          endLine: 2,
          text: 'needle beta',
        },
        {
          path: 'src/harness/restricted-agent/a.ts',
          startLine: 3,
          endLine: 3,
          text: 'alpha three',
        },
      ]);
      expect(result.exposureReport.exposed).toEqual([
        expect.objectContaining({
          path: 'src/harness/restricted-agent/a.ts',
          startLine: 2,
          endLine: 2,
        }),
        expect.objectContaining({
          path: 'src/harness/restricted-agent/a.ts',
          startLine: 3,
          endLine: 3,
        }),
      ]);
      expect(result.exposureReport.diagnostics).toContainEqual(
        expect.objectContaining({ code: 'budget_exhausted', path: 'src/harness/restricted-agent/b.ts' }),
      );
      expect(JSON.stringify(result.exposureReport)).not.toContain('needle beta');
      expect(result.turnInput.previousFailedChecks).toEqual([
        { commandId: 'focused_tests', summary: 'Focused tests failed.' },
      ]);
      expect(result.turnInput.availableCommands.map((command) => command.id)).toContain('focused_tests');
    });
  });
});
