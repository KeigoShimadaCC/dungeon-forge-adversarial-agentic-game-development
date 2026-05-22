import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildReviewRelativePath,
  buildScorecardRelativePath,
  buildTraceRelativePath,
} from '../src/harness/artifacts.js';
import { start } from '../src/game/engine.js';
import { resolveGameConfigForVersion } from '../src/game/version-profiles.js';
import {
  compareVersions,
  ensureVersionFolder,
  getVersionPaths,
  runVersion,
  summarizeVersion,
  validateVersionId,
} from '../src/harness/version-loop.js';
import { runPlaythrough } from '../src/harness/runner.js';
import type { PlaythroughReview } from '../src/harness/reviewer-client.js';
import type { PlaythroughScorecard } from '../src/harness/types.js';

const withTempRunsRoot = async (fn: (runsRoot: string) => Promise<void>): Promise<void> => {
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-version-loop-'));
  try {
    await fn(runsRoot);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
};

describe('Phase 07A version loop', () => {
  it('creates version folders and markdown stubs without overwriting existing markdown', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const paths = getVersionPaths(runsRoot, 'v001');
      await ensureVersionFolder(runsRoot, 'v001');
      await writeFile(paths.patchPlanPath, '# Custom patch plan\n\nKeep me.\n', 'utf8');

      const result = await ensureVersionFolder(runsRoot, 'v001');

      expect(await readFile(paths.patchPlanPath, 'utf8')).toBe('# Custom patch plan\n\nKeep me.\n');
      expect(await readFile(paths.changelogPath, 'utf8')).toContain('# Changelog');
      expect(await readFile(paths.developerNotesPath, 'utf8')).toContain('# Developer Notes');
      expect(await readFile(paths.acceptancePath, 'utf8')).toContain('Status: pending');
      expect(result.preservedMarkdown).toContain(paths.patchPlanPath);
    });
  });

  it('uses Phase 07A single-underscore artifact names', () => {
    expect(buildTraceRelativePath('v001', 'seed_001', 'careful_player')).toBe(
      'runs/v001/traces/seed_001_careful_player.json',
    );
    expect(buildReviewRelativePath('v001', 'seed_001', 'careful_player')).toBe(
      'runs/v001/reviews/seed_001_careful_player.json',
    );
    expect(buildScorecardRelativePath('v001', 'seed_001', 'careful_player')).toBe(
      'runs/v001/scorecards/seed_001_careful_player.json',
    );
  });

  it('rejects malformed version IDs clearly', () => {
    expect(() => validateVersionId('001')).toThrow('Invalid version id "001"');
    expect(() => getVersionPaths(process.cwd(), 'v1')).toThrow('Invalid version id "v1"');
  });

  it('starts the engine with the requested demo version profile', () => {
    const state = start('seed_001', resolveGameConfigForVersion('v001'));
    expect(state.version).toBe('v001');
    expect(state.meta.totalFloors).toBe(2);
  });

  it('records requested version in runPlaythrough traces', async () => {
    const { trace } = await runPlaythrough({
      seed: 'seed_002',
      policyId: 'stairs-seeking',
      version: 'v001',
      runsRoot: process.cwd(),
      maxSteps: 24,
    });
    expect(trace.version).toBe('v001');
  });

  it('runs the default evidence matrix with trace-grounded reviews and enriched scorecards', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const result = await runVersion(runsRoot, 'v001');

      expect(result.runs).toHaveLength(3);
      for (const run of result.runs) {
        const scorecard = JSON.parse(await readFile(run.scorecardPath, 'utf8')) as PlaythroughScorecard;
        const review = JSON.parse(await readFile(run.reviewPath, 'utf8')) as PlaythroughReview;

        expect(await readFile(run.tracePath, 'utf8')).toContain(`"seed": "${run.seed}"`);
        expect(review.top_issues.length).toBeGreaterThan(0);
        expect(review.top_issues[0]?.evidence.length).toBeGreaterThan(0);
        expect(scorecard.review_path).toBe(
          buildReviewRelativePath('v001', run.seed, run.persona),
        );
        expect(scorecard.review_id).toBe(`${run.persona}:${run.seed}`);
        expect(scorecard.reviewer_scores).toEqual(review.scores);
      }
    });
  });

  it('summarizes coverage, run outcomes, scorecard metrics, and acceptance status', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runVersion(runsRoot, 'v001');
      const summary = await summarizeVersion(runsRoot, 'v001');

      expect(summary.status).toBe('complete');
      expect(summary.artifact_coverage.traces).toMatchObject({ expected: 3, present: 3, missing: [] });
      expect(summary.artifact_coverage.reviews.present).toBe(3);
      expect(summary.artifact_coverage.scorecards.present).toBe(3);
      expect(summary.artifact_coverage.markdown['patch_plan.md'].present).toBe(true);
      expect(summary.links.patch_plan.endsWith('runs/v001/patch_plan.md')).toBe(true);
      expect(summary.acceptance_status).toBe('pending');
      expect(summary.runs).toHaveLength(3);
      expect(summary.runs[0]?.metrics).toHaveProperty('floors_reached');
      expect(summary.runs[0]?.reviewer_scores).toHaveProperty('fun');
    });
  });

  it('compares versions with counts, metric deltas, reviewer deltas, and interpretation', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runVersion(runsRoot, 'v001');
      await runVersion(runsRoot, 'v002');

      const comparison = await compareVersions(runsRoot, 'v001', 'v002');

      expect(comparison).toMatchObject({
        baseVersion: 'v001',
        targetVersion: 'v002',
        counts: {
          baseRuns: 3,
          targetRuns: 3,
          baseMissingArtifacts: 0,
          targetMissingArtifacts: 0,
        },
      });
      expect(comparison.objective_metric_deltas).toHaveProperty('floors_reached');
      expect(comparison.objective_metric_deltas).toHaveProperty('invalid_actions');
      expect(comparison.reviewer_score_deltas).toHaveProperty('fun');
      expect(comparison.missing_artifacts).toEqual({ base: [], target: [] });
      expect(comparison.interpretation.length).toBeGreaterThan(0);
    });
  });

  it('fails summary and comparison when required versions are missing', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await expect(summarizeVersion(runsRoot, 'v999')).rejects.toThrow(
        'Version does not exist: v999',
      );
      await ensureVersionFolder(runsRoot, 'v001');
      await expect(compareVersions(runsRoot, 'v001', 'v002')).rejects.toThrow(
        'Version does not exist: v002',
      );
    });
  });
});
