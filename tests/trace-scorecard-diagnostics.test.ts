import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runBalanceBatch } from '../src/harness/balance-tuning.js';
import { runPlaythrough } from '../src/harness/runner.js';
import {
  buildPlacementShortfalls,
  buildMapGenerationMetadata,
  buildTraceMetadata,
  deriveEnemyBehaviorMetrics,
  deriveProblemRunDiagnostics,
} from '../src/harness/trace-diagnostics.js';
import { stringifyDeterministicJson } from '../src/harness/json.js';

const withTempRunsRoot = async (fn: (runsRoot: string) => Promise<void>): Promise<void> => {
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-diagnostics-'));
  try {
    await fn(runsRoot);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
};

describe('Phase 13C trace and scorecard diagnostics', () => {
  it('records reproducible map-generation metadata by seed', () => {
    const first = buildMapGenerationMetadata('seed_001');
    const second = buildMapGenerationMetadata('seed_001');

    expect(first).toEqual(second);
    expect(first.floors.length).toBeGreaterThan(0);
    expect(first.floors[0]).toMatchObject({
      floor: 1,
      used_fallback: expect.any(Boolean),
      generation_attempt: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    });
    expect(JSON.parse(stringifyDeterministicJson(first))).toEqual(first);
  });

  it('aggregates non-attack enemy behavior events into scorecards', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const { trace, scorecard } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'careful_player',
        version: 'v001-test',
        runsRoot,
        maxSteps: 12,
        policy: ({ availableActions }) => {
          const wait = availableActions.find((action) => action.type === 'wait');
          if (!wait) {
            throw new Error('wait unavailable');
          }
          return { action: wait };
        },
      });

      const metrics = deriveEnemyBehaviorMetrics(trace);
      const totalBehaviors =
        metrics.enemy_attack +
        metrics.enemy_move +
        metrics.enemy_wait +
        metrics.enemy_steal +
        metrics.enemy_phase;

      expect(totalBehaviors).toBeGreaterThan(0);
      expect(scorecard.enemy_behaviors).toEqual(metrics);
    });
  });

  it('exercises tactical item opportunities via greedy-item-picker', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const { scorecard } = await runPlaythrough({
        seed: 'seed_002',
        policyId: 'greedy-item-picker',
        version: 'v002',
        runsRoot,
        maxSteps: 80,
      });

      expect(scorecard.item_evaluation?.use_item_turns_available ?? 0).toBeGreaterThan(0);
      expect(scorecard.item_evaluation?.tactical_items_used ?? 0).toBeGreaterThan(0);
      expect(
        scorecard.items_used + (scorecard.item_evaluation?.item_pickup_actions ?? 0),
      ).toBeGreaterThan(0);
    });
  });

  it('attaches structured problem-run diagnostics to traces and scorecards', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const { trace, scorecard } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot,
        policy: () => ({
          action: {
            id: 'invalid_action',
            type: 'move',
            label: 'Invalid',
            payload: { dx: 99, dy: 99 },
          },
        }),
      });

      expect(trace.metadata?.map_generation.floors.length).toBeGreaterThan(0);
      expect(trace.metadata?.problem_run?.categories.length).toBeGreaterThan(0);
      expect(scorecard.diagnostics?.categories.some((entry) => entry.category === 'aborted')).toBe(
        true,
      );
      expect(scorecard.diagnostics?.categories.some((entry) => entry.category === 'invalid_actions'))
        .toBe(true);
    });
  });

  it('surfaces problem categories in balance summaries', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const summary = await runBalanceBatch({
        runsRoot,
        version: 'v010',
        seeds: ['seed_001', 'seed_002'],
        policies: ['random', 'stairs-seeking', 'greedy-item-picker'],
      });

      expect(summary.problem_category_counts).toBeDefined();
      expect(Object.keys(summary.problem_category_counts).length).toBeGreaterThan(0);
      expect(summary.failed_runs.length).toBeGreaterThan(0);
      expect(summary.failed_runs[0]?.problem_categories.length).toBeGreaterThan(0);
      expect(summary.repeated_problem_seeds.length).toBeGreaterThan(0);
      expect(
        summary.failed_runs.some((run) =>
          run.problem_categories.some((entry) => entry.category === 'repeated_failure'),
        ),
      ).toBe(true);

      const saved = JSON.parse(
        await readFile(path.join(runsRoot, summary.summary_path), 'utf8'),
      ) as typeof summary;
      expect(saved.problem_category_counts).toEqual(summary.problem_category_counts);
      expect(saved.repeated_problem_seeds).toEqual(summary.repeated_problem_seeds);
    });
  });

  it('categorizes impossible placement and softlock diagnostics without prose parsing', () => {
    const shortfalls = buildPlacementShortfalls('seed_001', {
      totalFloors: 1,
      allowedEnemyIds: ['missing-enemy-id'],
    });
    const baseTrace = {
      version: 'v-diagnostics',
      seed: 'seed_001',
      persona: 'fixture',
      result: 'WIN' as const,
      turns: 7,
      steps: [],
    };
    const diagnostics = deriveProblemRunDiagnostics(
      baseTrace,
      {
        result: 'WIN',
        invalid_actions: 0,
        softlocks: 1,
        items_used: 0,
      },
      {
        map_generation: buildMapGenerationMetadata('seed_001', { totalFloors: 1 }),
        placement: { shortfalls },
      },
    );

    expect(shortfalls.length).toBeGreaterThan(0);
    expect(
      diagnostics.categories.some((entry) => entry.category === 'impossible_placement'),
    ).toBe(true);
    expect(diagnostics.categories.some((entry) => entry.category === 'softlock')).toBe(true);
  });

  it('builds version-scoped trace metadata from demo profiles', () => {
    const metadata = buildTraceMetadata('seed_001', 'v002');
    expect(metadata.map_generation.floors).toHaveLength(2);
  });
});
