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
  deriveTacticalDepthMetrics,
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
      expect(scorecard.tactical_depth?.enemy_pressure_events).toBe(totalBehaviors);
      expect(scorecard.tactical_depth?.enemy_pressure_per_turn).toBeGreaterThan(0);
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
      expect(scorecard.tactical_depth?.tactical_item_opportunities ?? 0).toBeGreaterThan(0);
      expect(scorecard.tactical_depth?.tactical_item_uses ?? 0).toBeGreaterThan(0);
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
      expect(scorecard.diagnostics?.categories.some((entry) => entry.category === 'policy_issue'))
        .toBe(true);
    });
  });

  it('derives deterministic tactical-depth metrics from trace evidence', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const { trace, scorecard } = await runPlaythrough({
        seed: 'seed_002',
        policyId: 'greedy-item-picker',
        version: 'v002',
        runsRoot,
        maxSteps: 80,
      });

      const first = deriveTacticalDepthMetrics(
        trace,
        scorecard.enemy_behaviors,
        scorecard.item_evaluation,
        scorecard.trap_resources,
      );
      const second = deriveTacticalDepthMetrics(
        trace,
        scorecard.enemy_behaviors,
        scorecard.item_evaluation,
        scorecard.trap_resources,
      );

      expect(first).toEqual(second);
      expect(scorecard.tactical_depth).toEqual(first);
      expect(first.content_interaction_events).toBeGreaterThan(0);
      expect(first.scenario_depth_signals).toBeGreaterThan(0);
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

  it('separates expected hard losses, balance outliers, protocol failures, and missing evidence', () => {
    const lossTrace = {
      version: 'v-diagnostics',
      seed: 'seed_001',
      persona: 'fixture',
      result: 'LOSS' as const,
      turns: 1,
      steps: [
        {
          turn: 1,
          state_summary: {
            turn: 1,
            floor: 1,
            hp: 0,
            maxHp: 12,
            terminalStatus: 'LOSS' as const,
            playerPosition: { x: 1, y: 1 },
            inventory: [],
            enemyCount: 1,
            itemCount: 0,
            npcCount: 0,
            inDialogue: false,
          },
          render: '',
          available_actions: [],
          chosen_action: { id: 'wait', type: 'wait' as const, label: 'Wait' },
          valid: true,
          events: [{ id: 'enemy_attack', type: 'enemy_attack', message: 'hit', turn: 1, payload: { damage: 18 } }],
          terminalStatus: 'LOSS' as const,
        },
      ],
    };
    const lossDiagnostics = deriveProblemRunDiagnostics(lossTrace, {
      result: 'LOSS',
      invalid_actions: 0,
      softlocks: 0,
      items_used: 0,
      turns: 1,
      floors_reached: 1,
      damage_taken: 18,
    });
    expect(lossDiagnostics.categories.map((entry) => entry.category)).toEqual([
      'expected_hard_loss',
      'balance_outlier',
    ]);

    const emptyAbort = deriveProblemRunDiagnostics(
      { ...lossTrace, result: 'ABORTED' as const, turns: 4, steps: [] },
      {
        result: 'ABORTED',
        invalid_actions: 0,
        softlocks: 0,
        items_used: 0,
        turns: 4,
        floors_reached: 0,
        damage_taken: 0,
      },
    );
    expect(emptyAbort.categories.some((entry) => entry.category === 'missing_evidence')).toBe(
      true,
    );
    expect(emptyAbort.categories.some((entry) => entry.category === 'aborted')).toBe(true);

    const protocolDiagnostics = deriveProblemRunDiagnostics(
      {
        ...lossTrace,
        result: 'ABORTED' as const,
        turns: 1,
        steps: [
          {
            ...lossTrace.steps[0]!,
            events: [
              {
                id: 'invalid_state',
                type: 'invalid_state',
                message: 'invalid',
                turn: 1,
              },
            ],
            terminalStatus: 'ABORTED' as const,
          },
        ],
      },
      {
        result: 'ABORTED',
        invalid_actions: 0,
        softlocks: 0,
        items_used: 0,
        turns: 1,
        floors_reached: 1,
        damage_taken: 0,
      },
    );
    expect(
      protocolDiagnostics.categories.some((entry) => entry.category === 'protocol_failure'),
    ).toBe(true);
  });

  it('builds version-scoped trace metadata from demo profiles', () => {
    const metadata = buildTraceMetadata('seed_001', 'v002');
    expect(metadata.map_generation.floors).toHaveLength(2);
  });
});
