import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { validateRestrictedSourcePatches } from '../src/harness/restricted-agent/index.js';

const withRepo = async (fn: (repoRoot: string) => Promise<void>): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'df-restricted-patch-'));
  await mkdir(path.join(repoRoot, 'src/harness/restricted-agent'), { recursive: true });
  await mkdir(path.join(repoRoot, 'docs'), { recursive: true });
  await mkdir(path.join(repoRoot, 'runs/v001'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'src/harness/restricted-agent/example.ts'),
    ['export const value = 1;', 'export const other = 2;'].join('\n'),
    'utf8',
  );
  await writeFile(
    path.join(repoRoot, 'src/harness/restricted-agent/duplicate.ts'),
    ['same', 'same'].join('\n'),
    'utf8',
  );
  await writeFile(path.join(repoRoot, 'docs/RESTRICTED-API-CODING-AGENT.md'), '# Doc\n', 'utf8');
  await writeFile(path.join(repoRoot, 'package.json'), '{}\n', 'utf8');
  await writeFile(path.join(repoRoot, 'runs/v001/evidence.json'), '{}\n', 'utf8');
  await fn(repoRoot);
};

const scope = (repoRoot: string) => ({
  repoRoot,
  phaseAllowedPaths: [
    'src/harness/restricted-agent/**',
    'docs/RESTRICTED-API-CODING-AGENT.md',
  ],
  taskAllowedPaths: ['src/harness/restricted-agent/**'],
  forbiddenPaths: ['.env', 'runs/**', 'private/**'],
});

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

describe('Phase 30A restricted source patch validator', () => {
  it('normalizes a safe exact replacement without mutating the file', async () => {
    await withRepo(async (repoRoot) => {
      const target = path.join(repoRoot, 'src/harness/restricted-agent/example.ts');
      const before = await readFile(target, 'utf8');
      const beforeHash = sha256(before);
      const result = await validateRestrictedSourcePatches({
        ...scope(repoRoot),
        patches: [
          {
            path: 'src/harness/restricted-agent/example.ts',
            kind: 'replace_exact',
            expected: 'export const value = 1;',
            replacement: 'export const value = 2;',
          },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.plan?.operations).toEqual([
        expect.objectContaining({
          path: 'src/harness/restricted-agent/example.ts',
          kind: 'replace_exact',
          expected: 'export const value = 1;',
          replacement: 'export const value = 2;',
        }),
      ]);
      expect(sha256(await readFile(target, 'utf8'))).toBe(beforeHash);
    });
  });

  it('blocks out-of-scope, generated evidence, dependency, unsafe, and forbidden paths', async () => {
    await withRepo(async (repoRoot) => {
      const patches = [
        'docs/RESTRICTED-API-CODING-AGENT.md',
        'runs/v001/evidence.json',
        'package.json',
        '../outside.ts',
        '.env',
      ].map((patchPath) => ({
        path: patchPath,
        kind: 'replace_exact',
        expected: 'x',
        replacement: 'y',
      }));
      const result = await validateRestrictedSourcePatches({
        ...scope(repoRoot),
        patches,
      });

      expect(result.ok).toBe(false);
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'out_of_scope' }),
          expect.objectContaining({ code: 'forbidden_path' }),
          expect.objectContaining({ code: 'forbidden_dependency_change' }),
          expect.objectContaining({ code: 'unsafe_path' }),
        ]),
      );
    });
  });

  it('blocks unknown operations, missing anchors, duplicate anchors, and existing create files', async () => {
    await withRepo(async (repoRoot) => {
      const result = await validateRestrictedSourcePatches({
        ...scope(repoRoot),
        patches: [
          {
            path: 'src/harness/restricted-agent/example.ts',
            kind: 'delete_file',
            replacement: '',
          },
          {
            path: 'src/harness/restricted-agent/example.ts',
            kind: 'replace_exact',
            expected: 'not present',
            replacement: 'new',
          },
          {
            path: 'src/harness/restricted-agent/duplicate.ts',
            kind: 'insert_after_exact',
            expected: 'same',
            replacement: 'new',
          },
          {
            path: 'src/harness/restricted-agent/example.ts',
            kind: 'create_file',
            replacement: 'new',
          },
        ],
      });

      expect(result.ok).toBe(false);
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'unknown_operation' }),
          expect.objectContaining({ code: 'context_mismatch' }),
          expect.objectContaining({ code: 'ambiguous_anchor' }),
          expect.objectContaining({ code: 'existing_file' }),
        ]),
      );
    });
  });

  it('blocks secret-like content and oversize budgets without echoing secret values', async () => {
    await withRepo(async (repoRoot) => {
      const secretSuffix = ['abcde', 'fghij', 'klmno', 'pqrst', 'uvwxy', 'z'].join('');
      const result = await validateRestrictedSourcePatches({
        ...scope(repoRoot),
        budgets: { maxReplacementBytes: 4, maxTotalReplacementBytes: 8 },
        patches: [
          {
            path: 'src/harness/restricted-agent/example.ts',
            kind: 'replace_exact',
            expected: 'export const value = 1;',
            replacement: `api_${'key'} = ${'sk'}-${secretSuffix}`,
          },
        ],
      });

      expect(result.ok).toBe(false);
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'secret_like_content' }),
          expect.objectContaining({ code: 'budget_exceeded' }),
        ]),
      );
      expect(JSON.stringify(result.diagnostics)).not.toContain(secretSuffix);
    });
  });

  it('validates create_file for a new allowed target and blocks disallowed extensions', async () => {
    await withRepo(async (repoRoot) => {
      const valid = await validateRestrictedSourcePatches({
        ...scope(repoRoot),
        patches: [
          {
            path: 'src/harness/restricted-agent/new-file.ts',
            kind: 'create_file',
            replacement: 'export const created = true;\n',
          },
        ],
      });
      expect(valid.ok).toBe(true);

      const invalid = await validateRestrictedSourcePatches({
        ...scope(repoRoot),
        patches: [
          {
            path: 'src/harness/restricted-agent/blob.bin',
            kind: 'create_file',
            replacement: 'binary-ish',
          },
        ],
      });
      expect(invalid.ok).toBe(false);
      expect(invalid.diagnostics).toContainEqual(
        expect.objectContaining({ code: 'forbidden_file_type' }),
      );
    });
  });
});
