import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  applyRestrictedSourcePatchPlan,
  validateRestrictedSourcePatches,
  type NormalizedRestrictedSourcePatchPlan,
} from '../src/harness/restricted-agent/index.js';

const withRepo = async (fn: (repoRoot: string, evidenceDir: string) => Promise<void>): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'df-restricted-apply-'));
  const evidenceDir = path.join(repoRoot, 'evidence');
  await mkdir(path.join(repoRoot, 'src/harness/restricted-agent'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'src/harness/restricted-agent/example.ts'),
    ['export const value = 1;', 'export const other = 2;'].join('\n'),
    'utf8',
  );
  await writeFile(path.join(repoRoot, 'src/harness/restricted-agent/second.ts'), 'export const second = 1;\n', 'utf8');
  await fn(repoRoot, evidenceDir);
};

const scope = (repoRoot: string) => ({
  repoRoot,
  phaseAllowedPaths: ['src/harness/restricted-agent/**'],
  taskAllowedPaths: ['src/harness/restricted-agent/**'],
  forbiddenPaths: ['.env', 'runs/**', 'private/**'],
});

const validatedPlan = async (
  repoRoot: string,
  patches: unknown[],
): Promise<NormalizedRestrictedSourcePatchPlan> => {
  const validation = await validateRestrictedSourcePatches({
    ...scope(repoRoot),
    patches,
  });
  expect(validation.ok).toBe(true);
  expect(validation.plan).toBeDefined();
  return validation.plan as NormalizedRestrictedSourcePatchPlan;
};

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

describe('Phase 30B restricted source patch applier', () => {
  it('dry-runs a normalized plan without writing target files', async () => {
    await withRepo(async (repoRoot, evidenceDir) => {
      const target = path.join(repoRoot, 'src/harness/restricted-agent/example.ts');
      const before = await readFile(target, 'utf8');
      const plan = await validatedPlan(repoRoot, [
        {
          path: 'src/harness/restricted-agent/example.ts',
          kind: 'replace_exact',
          expected: 'export const value = 1;',
          replacement: 'export const value = 2;',
        },
      ]);

      const report = await applyRestrictedSourcePatchPlan({ repoRoot, plan, evidenceDir });

      expect(report.status).toBe('dry-run');
      expect(await readFile(target, 'utf8')).toBe(before);
      expect(report.files).toEqual([
        expect.objectContaining({
          path: 'src/harness/restricted-agent/example.ts',
          changed: true,
          beforeSha256: sha256(before),
          afterSha256: sha256(before.replace('export const value = 1;', 'export const value = 2;')),
          beforeBytes: Buffer.byteLength(before, 'utf8'),
        }),
      ]);
      expect(await readFile(path.join(evidenceDir, 'patch-report.json'), 'utf8')).toContain('"status": "dry-run"');
    });
  });

  it('applies expected file changes only and writes rollback evidence first for changed existing files', async () => {
    await withRepo(async (repoRoot, evidenceDir) => {
      const target = path.join(repoRoot, 'src/harness/restricted-agent/example.ts');
      const untouched = path.join(repoRoot, 'src/harness/restricted-agent/second.ts');
      const before = await readFile(target, 'utf8');
      const untouchedBefore = await readFile(untouched, 'utf8');
      const plan = await validatedPlan(repoRoot, [
        {
          path: 'src/harness/restricted-agent/example.ts',
          kind: 'insert_after_exact',
          expected: 'export const value = 1;',
          replacement: '\nexport const inserted = true;',
        },
      ]);

      const report = await applyRestrictedSourcePatchPlan({ repoRoot, plan, evidenceDir, mode: 'apply' });

      expect(report.status).toBe('applied');
      const after = await readFile(target, 'utf8');
      expect(after).toContain('export const inserted = true;');
      expect(await readFile(untouched, 'utf8')).toBe(untouchedBefore);
      expect(report.files[0]).toEqual(
        expect.objectContaining({
          beforeSha256: sha256(before),
          afterSha256: sha256(after),
          rollbackPath: expect.stringContaining('rollback'),
        }),
      );
      expect(await readFile(report.files[0].rollbackPath as string, 'utf8')).toBe(before);
    });
  });

  it('creates new files without inventing rollback mutation authority', async () => {
    await withRepo(async (repoRoot, evidenceDir) => {
      const target = path.join(repoRoot, 'src/harness/restricted-agent/new-file.ts');
      const replacement = 'export const created = true;\n';
      const plan = await validatedPlan(repoRoot, [
        {
          path: 'src/harness/restricted-agent/new-file.ts',
          kind: 'create_file',
          replacement,
        },
      ]);

      const report = await applyRestrictedSourcePatchPlan({ repoRoot, plan, evidenceDir, mode: 'apply' });

      expect(await readFile(target, 'utf8')).toBe(replacement);
      expect(report.files).toEqual([
        expect.objectContaining({
          path: 'src/harness/restricted-agent/new-file.ts',
          existedBefore: false,
          beforeSha256: null,
          afterSha256: sha256(replacement),
        }),
      ]);
      expect(report.files[0]).not.toHaveProperty('rollbackPath');
    });
  });

  it('precomputes all operations and leaves files unchanged when apply preflight fails', async () => {
    await withRepo(async (repoRoot, evidenceDir) => {
      const first = path.join(repoRoot, 'src/harness/restricted-agent/example.ts');
      const second = path.join(repoRoot, 'src/harness/restricted-agent/second.ts');
      const firstBefore = await readFile(first, 'utf8');
      const secondBefore = await readFile(second, 'utf8');
      const plan: NormalizedRestrictedSourcePatchPlan = {
        budgets: { maxFiles: 3, maxOperations: 3, maxReplacementBytes: 8000, maxTotalReplacementBytes: 16000 },
        operations: [
          {
            path: 'src/harness/restricted-agent/example.ts',
            kind: 'replace_exact',
            expected: 'export const value = 1;',
            replacement: 'export const value = 2;',
            replacementBytes: Buffer.byteLength('export const value = 2;', 'utf8'),
          },
          {
            path: 'src/harness/restricted-agent/second.ts',
            kind: 'replace_exact',
            expected: 'missing anchor',
            replacement: 'new',
            replacementBytes: Buffer.byteLength('new', 'utf8'),
          },
        ],
      };

      const report = await applyRestrictedSourcePatchPlan({ repoRoot, plan, evidenceDir, mode: 'apply' });

      expect(report.status).toBe('blocked');
      expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'context_mismatch' }));
      expect(await readFile(first, 'utf8')).toBe(firstBefore);
      expect(await readFile(second, 'utf8')).toBe(secondBefore);
      await expect(stat(path.join(evidenceDir, 'rollback'))).rejects.toThrow();
    });
  });

  it('blocks raw model-shaped output that is not a normalized validator plan', async () => {
    await withRepo(async (repoRoot, evidenceDir) => {
      const rawModelOutput = {
        operations: [
          {
            path: 'src/harness/restricted-agent/example.ts',
            kind: 'replace_exact',
            expected: 'export const value = 1;',
            replacement: 'export const value = 2;',
          },
        ],
        budgets: { maxFiles: 3, maxOperations: 3, maxReplacementBytes: 8000, maxTotalReplacementBytes: 16000 },
      };

      const report = await applyRestrictedSourcePatchPlan({
        repoRoot,
        plan: rawModelOutput as unknown as NormalizedRestrictedSourcePatchPlan,
        evidenceDir,
        mode: 'apply',
      });

      expect(report.status).toBe('blocked');
      expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: 'unknown_operation' }));
    });
  });
});
