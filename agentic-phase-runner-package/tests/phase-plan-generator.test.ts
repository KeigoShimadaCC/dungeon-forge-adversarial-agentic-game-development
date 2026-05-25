import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runInitCommand } from '../src/cli/commands/init.js';
import { runPlanCommand } from '../src/cli/commands/plan.js';
import { applyFilePlan } from '../src/core/file-plan.js';
import { validatePhaseGraph, type PhaseGraph, type PhaseState } from '../src/core/phase-runner.js';
import { generateStarterPhasePlan } from '../src/core/phase-plan-generator.js';
import { createRepoProfile } from '../src/core/repo-profiler.js';

const withTempDir = async (fn: (repoRoot: string) => Promise<void>): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-plan-test-'));
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

const silenceStdout = async (fn: () => Promise<void>): Promise<void> => {
  const originalWrite = process.stdout.write;
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = originalWrite;
  }
};

const captureStdout = async (fn: () => Promise<void>): Promise<string> => {
  const originalWrite = process.stdout.write;
  let output = '';
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
    return output;
  } finally {
    process.stdout.write = originalWrite;
  }
};

const idea = 'Build a local-first note app with graph and vector search';

describe('phase plan generator', () => {
  it('dry-runs without writing target repo files', async () => {
    await withTempDir(async (repoRoot) => {
      const output = await captureStdout(async () => {
        await runPlanCommand(repoRoot, { idea, 'dry-run': true });
      });
      const parsed = JSON.parse(output) as { planQuality: { kind: string; requiresHumanReview: boolean } };
      expect(parsed.planQuality.kind).toBe('deterministic-starter');
      expect(parsed.planQuality.requiresHumanReview).toBe(true);
      expect(await exists(path.join(repoRoot, 'concept-and-ideas', '01_NORTH_STAR_AND_VISION.md'))).toBe(false);
      expect(await exists(path.join(repoRoot, 'automation', 'phase-graph.json'))).toBe(false);
    });
  });

  it('applies concept docs, phase plans, graph, state, and policy', async () => {
    await withTempDir(async (repoRoot) => {
      await silenceStdout(async () => {
        await runPlanCommand(repoRoot, { idea, apply: true });
      });

      await expect(readFile(path.join(repoRoot, 'concept-and-ideas', '01_NORTH_STAR_AND_VISION.md'), 'utf8')).resolves.toContain(
        idea,
      );
      await expect(readFile(path.join(repoRoot, 'phase-plans', 'PHASE-01B-CORE-IMPLEMENTATION.md'), 'utf8')).resolves.toContain(
        'Core Implementation',
      );
      const graph = JSON.parse(await readFile(path.join(repoRoot, 'automation', 'phase-graph.json'), 'utf8')) as PhaseGraph;
      const state = JSON.parse(await readFile(path.join(repoRoot, 'automation', 'phase-state.json'), 'utf8')) as PhaseState;
      expect(validatePhaseGraph(graph)).toEqual([]);
      expect(state.currentPhase).toBe('PHASE-01A');
      expect(Object.keys(state.phases)).toEqual(['PHASE-01A', 'PHASE-01B', 'PHASE-01C']);
      await expect(readFile(path.join(repoRoot, 'automation', 'policies', 'automerge-policy.json'), 'utf8')).resolves.toContain(
        '"enabled": false',
      );
      expect(await exists(path.join(repoRoot, '.agentic', 'plan-runs'))).toBe(true);
      const planRuns = await readdir(path.join(repoRoot, '.agentic', 'plan-runs'));
      await expect(readFile(path.join(repoRoot, '.agentic', 'plan-runs', planRuns[0]!, 'plan-summary.md'), 'utf8')).resolves.toContain(
        'Agentic Starter Plan Summary',
      );
    });
  });

  it('does not overwrite existing files without force', async () => {
    await withTempDir(async (repoRoot) => {
      await mkdir(path.join(repoRoot, 'concept-and-ideas'), { recursive: true });
      const target = path.join(repoRoot, 'concept-and-ideas', '01_NORTH_STAR_AND_VISION.md');
      await writeFile(target, 'existing');
      const profile = await createRepoProfile(repoRoot);
      const plan = await generateStarterPhasePlan({ repoRoot, idea, profile });
      const { report } = await applyFilePlan(repoRoot, plan.proposedFiles, {
        timestamp: '2026-05-25T00-00-00-000Z',
      });
      expect(await readFile(target, 'utf8')).toBe('existing');
      expect(report.files.find((file) => file.path === 'concept-and-ideas/01_NORTH_STAR_AND_VISION.md')?.action).toBe(
        'skipped',
      );
    });
  });

  it('overwrites generated files with force', async () => {
    await withTempDir(async (repoRoot) => {
      await mkdir(path.join(repoRoot, 'concept-and-ideas'), { recursive: true });
      const target = path.join(repoRoot, 'concept-and-ideas', '01_NORTH_STAR_AND_VISION.md');
      await writeFile(target, 'existing');
      const profile = await createRepoProfile(repoRoot);
      const plan = await generateStarterPhasePlan({ repoRoot, idea, profile });
      const { report } = await applyFilePlan(repoRoot, plan.proposedFiles, {
        force: true,
        timestamp: '2026-05-25T00-00-00-000Z',
      });
      expect(await readFile(target, 'utf8')).toContain(idea);
      expect(report.files.find((file) => file.path === 'concept-and-ideas/01_NORTH_STAR_AND_VISION.md')?.action).toBe(
        'overwritten',
      );
    });
  });

  it('reports skipped init placeholders without force', async () => {
    await withTempDir(async (repoRoot) => {
      await silenceStdout(async () => {
        await runInitCommand(repoRoot, {});
      });
      const output = await captureStdout(async () => {
        await runPlanCommand(repoRoot, { idea, apply: true });
      });
      const parsed = JSON.parse(output) as { status: string; skippedFiles: string[]; recommendedNextActions: string[] };
      expect(parsed.status).toBe('applied_with_skips');
      expect(parsed.skippedFiles).toContain('automation/phase-graph.json');
      expect(parsed.recommendedNextActions.join('\n')).toContain('--force');
      const graph = JSON.parse(await readFile(path.join(repoRoot, 'automation', 'phase-graph.json'), 'utf8')) as PhaseGraph;
      expect(graph.phases.map((phase) => phase.id)).toEqual(['PHASE-01A']);
    });
  });

  it('replaces init placeholders with force when requested', async () => {
    await withTempDir(async (repoRoot) => {
      await silenceStdout(async () => {
        await runInitCommand(repoRoot, {});
      });
      const output = await captureStdout(async () => {
        await runPlanCommand(repoRoot, { idea, apply: true, force: true });
      });
      const parsed = JSON.parse(output) as { status: string; skippedFiles: string[] };
      expect(parsed.status).toBe('applied');
      expect(parsed.skippedFiles).toEqual([]);
      const graph = JSON.parse(await readFile(path.join(repoRoot, 'automation', 'phase-graph.json'), 'utf8')) as PhaseGraph;
      expect(graph.phases.map((phase) => phase.id)).toEqual(['PHASE-01A', 'PHASE-01B', 'PHASE-01C']);
    });
  });

  it('resolves dry-run preview output relative to repo root and blocks target repo writes', async () => {
    await withTempDir(async (repoRoot) => {
      await expect(
        silenceStdout(async () => {
          await runPlanCommand(repoRoot, {
            idea,
            'dry-run': true,
            output: '.agentic/plan-preview',
          });
        }),
      ).rejects.toThrow('must point outside --repo-root');
    });
  });

  it('rejects conflicting dry-run and apply flags', async () => {
    await withTempDir(async (repoRoot) => {
      await expect(
        silenceStdout(async () => {
          await runPlanCommand(repoRoot, { idea, 'dry-run': true, apply: true });
        }),
      ).rejects.toThrow('Choose either --dry-run or --apply');
      expect(await exists(path.join(repoRoot, '.agentic'))).toBe(false);
    });
  });

  it('adds stack-aware notes to generated phase plans', async () => {
    await withTempDir(async (repoRoot) => {
      await writeFile(path.join(repoRoot, 'package.json'), JSON.stringify({ scripts: { typecheck: 'tsc --noEmit' } }));
      await writeFile(path.join(repoRoot, 'tsconfig.json'), '{}');
      await writeFile(path.join(repoRoot, 'next.config.js'), 'module.exports = {};');
      const profile = await createRepoProfile(repoRoot);
      const plan = await generateStarterPhasePlan({ repoRoot, idea, profile });
      const foundation = plan.proposedFiles.find((file) => file.path === 'phase-plans/PHASE-01A-PROJECT-FOUNDATION.md');
      expect(foundation?.contents).toContain('Preserve app/router or pages/router conventions.');
      expect(foundation?.contents).toContain('Preserve strict typecheck behavior where configured.');
    });
  });
});
