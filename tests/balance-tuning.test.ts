import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BALANCE_SUMMARY_FILENAME,
  buildBalanceSummaryRelativePath,
  compareBalanceSummaries,
  getDefaultBalanceBatchSpecs,
  runBalanceBatch,
  type BalanceSummary,
} from '../src/harness/balance-tuning.js';
import { CANONICAL_REGRESSION_SEEDS } from '../src/harness/baseline-players/helpers.js';
import { BASELINE_POLICY_IDS } from '../src/harness/policy-registry.js';
import { compareVersions } from '../src/harness/version-loop.js';

const withTempRunsRoot = async (fn: (runsRoot: string) => Promise<void>): Promise<void> => {
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-balance-'));
  try {
    await fn(runsRoot);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
};

describe('Phase 10B balance tuning', () => {
  it('uses canonical seeds and every deterministic baseline policy by default', () => {
    const specs = getDefaultBalanceBatchSpecs();

    expect(specs).toHaveLength(CANONICAL_REGRESSION_SEEDS.length * BASELINE_POLICY_IDS.length);
    for (const seed of CANONICAL_REGRESSION_SEEDS) {
      for (const policy of BASELINE_POLICY_IDS) {
        expect(specs).toContainEqual({ seed, policy });
      }
    }
  });

  it('runs a balance batch and saves a readable summary artifact with failed runs visible', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const summary = await runBalanceBatch({
        runsRoot,
        version: 'v010',
        seeds: ['seed_001'],
        policies: ['random', 'stairs-seeking'],
      });
      const summaryPath = path.join(runsRoot, buildBalanceSummaryRelativePath('v010'));
      const saved = JSON.parse(await readFile(summaryPath, 'utf8')) as BalanceSummary;

      expect(path.basename(summaryPath)).toBe(BALANCE_SUMMARY_FILENAME);
      expect(summary).toMatchObject({
        version: 'v010',
        mode: 'baseline',
        seeds: ['seed_001'],
        policies: ['random', 'stairs-seeking'],
        total_runs: 2,
        summary_path: 'runs/v010/balance_summary.json',
      });
      expect(saved).toEqual(summary);
      expect(summary.aggregates).toHaveProperty('win_rate');
      expect(summary.aggregates).toHaveProperty('average_turns');
      expect(summary.aggregates).toHaveProperty('average_death_floor');
      expect(summary.aggregates).toHaveProperty('average_items_used');
      expect(summary.aggregates).toHaveProperty('average_damage_taken');
      expect(summary.aggregates).toHaveProperty('average_enemies_defeated');
      expect(summary.aggregates).toHaveProperty('average_invalid_actions');
      expect(summary.aggregates).toHaveProperty('abort_count');
      expect(summary.aggregates).toHaveProperty('softlock_count');
      expect(summary.failed_runs.length).toBeGreaterThan(0);
      expect(summary.failed_runs[0]?.problem_reasons.length).toBeGreaterThan(0);

      for (const run of summary.runs) {
        expect(await readFile(path.join(runsRoot, run.trace_path), 'utf8')).toContain(
          `"seed": "${run.seed}"`,
        );
        expect(await readFile(path.join(runsRoot, run.scorecard_path), 'utf8')).toContain(
          `"persona": "${run.policy}"`,
        );
      }
    });
  });

  it('is reproducible for the same seed and policy matrix', async () => {
    const runOnce = async (): Promise<BalanceSummary> => {
      const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-balance-repro-'));
      try {
        return await runBalanceBatch({
          runsRoot,
          version: 'v010',
          seeds: ['seed_001', 'seed_002'],
          policies: ['greedy-item-picker'],
        });
      } finally {
        await rm(runsRoot, { recursive: true, force: true });
      }
    };

    await expect(runOnce()).resolves.toEqual(await runOnce());
  });

  it('adds balance deltas to version comparison when summaries exist', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runBalanceBatch({
        runsRoot,
        version: 'v010',
        seeds: ['seed_001'],
        policies: ['random', 'stairs-seeking'],
      });
      await runBalanceBatch({
        runsRoot,
        version: 'v011',
        seeds: ['seed_001'],
        policies: ['random', 'stairs-seeking'],
      });

      const comparison = await compareVersions(runsRoot, 'v010', 'v011');
      expect(comparison.balance_comparison).toBeDefined();
      expect(comparison.balance_comparison?.aggregate_metric_deltas).toHaveProperty('win_rate');
      expect(comparison.balance_comparison?.problem_run_count.delta).toBe(0);
    });
  });

  it('compares balance summaries with newly problematic and resolved run details', async () => {
    await withTempRunsRoot(async (baseRoot) => {
      await withTempRunsRoot(async (targetRoot) => {
        const base = await runBalanceBatch({
          runsRoot: baseRoot,
          version: 'v010',
          seeds: ['seed_001'],
          policies: ['greedy-item-picker'],
        });
        const target = await runBalanceBatch({
          runsRoot: targetRoot,
          version: 'v011',
          seeds: ['seed_001'],
          policies: ['random'],
        });

        const comparison = compareBalanceSummaries(base, target);

        expect(comparison.available).toBe(true);
        expect(comparison.aggregate_metric_deltas).toHaveProperty('abort_count');
        expect(comparison.newly_problematic_runs.length).toBeGreaterThan(0);
        expect(comparison.interpretation).toContain('problematic');
      });
    });
  });
});
