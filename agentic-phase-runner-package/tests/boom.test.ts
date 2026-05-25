import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runBoom } from '../src/core/boom.js';

const withTempDir = async (fn: (repoRoot: string) => Promise<void>): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-boom-test-'));
  try {
    await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
};

const exists = async (filePath: string): Promise<boolean> =>
  access(filePath)
    .then(() => true)
    .catch(() => false);

const idea = 'Build a local-first knowledge app';

describe('boom workflow', () => {
  it('dry-runs without writing inside the target repo', async () => {
    await withTempDir(async (repoRoot) => {
      const report = await runBoom(repoRoot, { idea, dryRun: true });
      expect(report.status).toBe('planned');
      expect(report.dryRun).toBe(true);
      expect(await exists(path.join(repoRoot, 'concept-and-ideas'))).toBe(false);
      expect(await exists(path.join(repoRoot, '.agentic'))).toBe(false);
    });
  });

  it('writes previews outside the repo in dry-run output mode', async () => {
    await withTempDir(async (repoRoot) => {
      const output = await mkdtemp(path.join(os.tmpdir(), 'agentic-boom-preview-'));
      try {
        const report = await runBoom(repoRoot, { idea, dryRun: true, output });
        expect(report.status).toBe('planned');
        if (!report.dryRun) throw new Error('expected dry-run boom report');
        expect(report.previewOutputDir).toBe(output);
        await expect(readFile(path.join(output, 'boom-report.json'), 'utf8')).resolves.toContain('"status": "planned"');
        expect(await exists(path.join(repoRoot, '.agentic'))).toBe(false);
      } finally {
        await rm(output, { recursive: true, force: true });
      }
    });
  });

  it('applies generated starter files and boom report', async () => {
    await withTempDir(async (repoRoot) => {
      const report = await runBoom(repoRoot, {
        idea,
        apply: true,
        timestamp: '2026-05-25T00-00-00-000Z',
      });
      expect(report.status).toBe('applied');
      expect(report.dryRun).toBe(false);
      expect(report.plan.proposedFileCount).toBeGreaterThan(0);
      expect(report.plan.planQuality.kind).toBe('deterministic-starter');
      await expect(readFile(path.join(repoRoot, 'concept-and-ideas', '01_NORTH_STAR_AND_VISION.md'), 'utf8')).resolves.toContain(
        idea,
      );
      await expect(readFile(path.join(repoRoot, '.agentic', 'boom-runs', '2026-05-25T00-00-00-000Z', 'boom-report.json'), 'utf8')).resolves.toContain(
        '"doctorStatusBefore"',
      );
      await expect(readFile(path.join(repoRoot, '.agentic', 'repo-profile.json'), 'utf8')).resolves.toContain(
        '"schemaVersion": 1',
      );
    });
  });

  it('does not overwrite existing generated files without force', async () => {
    await withTempDir(async (repoRoot) => {
      await runBoom(repoRoot, {
        idea,
        apply: true,
        timestamp: '2026-05-25T00-00-00-000Z',
      });
      const target = path.join(repoRoot, 'concept-and-ideas', '01_NORTH_STAR_AND_VISION.md');
      await writeFile(target, 'existing');
      const report = await runBoom(repoRoot, {
        idea: 'Build something else',
        apply: true,
        timestamp: '2026-05-25T00-00-01-000Z',
      });
      if (report.dryRun) throw new Error('expected apply boom report');
      expect(report.status).toBe('applied_with_skips');
      expect(report.skippedFiles).toContain('concept-and-ideas/01_NORTH_STAR_AND_VISION.md');
      expect(await readFile(target, 'utf8')).toBe('existing');
    });
  });

  it('overwrites generated starter files with force', async () => {
    await withTempDir(async (repoRoot) => {
      await runBoom(repoRoot, {
        idea,
        apply: true,
        timestamp: '2026-05-25T00-00-00-000Z',
      });
      const target = path.join(repoRoot, 'concept-and-ideas', '01_NORTH_STAR_AND_VISION.md');
      await writeFile(target, 'existing');
      const report = await runBoom(repoRoot, {
        idea: 'Build a graph notebook',
        apply: true,
        force: true,
        timestamp: '2026-05-25T00-00-01-000Z',
      });
      if (report.dryRun) throw new Error('expected apply boom report');
      expect(report.status).toBe('applied');
      expect(report.skippedFiles).toEqual([]);
      expect(await readFile(target, 'utf8')).toContain('Build a graph notebook');
    });
  });

  it('rejects conflicting dry-run and apply flags', async () => {
    await withTempDir(async (repoRoot) => {
      await expect(runBoom(repoRoot, { idea, dryRun: true, apply: true })).rejects.toThrow(
        'Choose either --dry-run or --apply',
      );
      expect(await exists(path.join(repoRoot, '.agentic'))).toBe(false);
    });
  });
});
