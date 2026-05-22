import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getAvailableActions, start, step } from '../src/game/engine.js';
import { render } from '../src/game/render.js';
import { getTrapDefinition, loadGameContent } from '../src/game/content.js';
import {
  SCENARIO_PACKS_SCHEMA_VERSION,
  assertScenarioPackId,
  getGameContentForRun,
  getScenarioPackManifestEntry,
  loadScenarioPackContent,
  loadScenarioPacksManifest,
  mergeScenarioPackContent,
  normalizeScenarioPackId,
  resolveGameConfigForRun,
  validateScenarioPackContentOverlay,
  validateScenarioPacksManifest,
} from '../src/game/scenario-packs.js';
import { resolveGameConfigForVersion } from '../src/game/version-profiles.js';
import {
  renderAcceptanceMarkdown,
  type AcceptanceGateResult,
} from '../src/harness/acceptance-gate.js';
import { runPlaythrough } from '../src/harness/runner.js';
import { deriveScorecardFromTrace, validateScorecard } from '../src/harness/scorecard.js';
import { summarizeVersion } from '../src/harness/version-loop.js';
import { renderComparisonMarkdown } from '../src/harness/version-comparison-artifacts.js';
import { compareVersions } from '../src/harness/version-loop.js';
import type { HarnessPlayerPolicy } from '../src/harness/types.js';

const abortPolicy: HarnessPlayerPolicy = () => ({
  action: { id: 'abort_policy', type: 'wait', label: 'Abort' },
});

const validManifest = () => ({
  schemaVersion: SCENARIO_PACKS_SCHEMA_VERSION,
  packs: [
    {
      id: 'tiny_pack',
      label: 'Tiny Pack',
      description: 'Validation fixture pack.',
      contentFile: 'packs/shrine-trial.json',
      gameConfig: { totalFloors: 2 },
    },
  ],
});

const descendFromCurrentFloor = (state: ReturnType<typeof start>): ReturnType<typeof start> => {
  let stairs: { x: number; y: number } | undefined;
  for (const [y, row] of state.map.tiles.entries()) {
    const x = row.findIndex((tile) => tile.type === 'stairs');
    if (x >= 0) {
      stairs = { x, y };
      break;
    }
  }
  expect(stairs).toBeDefined();
  const stateAtStairs = {
    ...state,
    player: { ...state.player, ...stairs! },
    enemies: [],
  };
  const descendAction = getAvailableActions(stateAtStairs).find(
    (action) => action.type === 'descend',
  );
  expect(descendAction).toBeDefined();
  return step(stateAtStairs, descendAction!).state;
};

describe('Phase 16C scenario content packs', () => {
  it('loads and validates the scenario pack manifest', () => {
    const manifest = loadScenarioPacksManifest();
    expect(manifest.schemaVersion).toBe(SCENARIO_PACKS_SCHEMA_VERSION);
    expect(getScenarioPackManifestEntry('shrine_trial')?.label).toBe('Shrine Trial');
    expect(() => assertScenarioPackId('missing_pack')).toThrow(/Unknown scenario pack/);
  });

  it('rejects malformed manifests and conflicting pack overlays', () => {
    expect(() =>
      validateScenarioPacksManifest({
        ...validManifest(),
        schemaVersion: 'future',
      }),
    ).toThrow(/schemaVersion/);

    expect(() =>
      validateScenarioPacksManifest({
        ...validManifest(),
        packs: [
          {
            ...validManifest().packs[0],
            gameConfig: { totalFloors: 0 },
          },
        ],
      }),
    ).toThrow(/gameConfig\.totalFloors/);

    expect(() =>
      validateScenarioPacksManifest({
        ...validManifest(),
        packs: [
          validManifest().packs[0],
          {
            ...validManifest().packs[0],
            label: 'Duplicate Tiny Pack',
          },
        ],
      }),
    ).toThrow(/duplicates pack "tiny_pack"/);

    const base = loadGameContent();
    const potion = base.items.items.find((item) => item.id === 'potion');
    expect(potion).toBeDefined();
    const conflictingItem = JSON.parse(JSON.stringify(potion)) as typeof potion;
    conflictingItem!.displayName = 'Conflicting Potion Name';
    const overlay = validateScenarioPackContentOverlay(
      {
        schemaVersion: '16C',
        items: {
          add: [conflictingItem],
        },
      },
      'fixture.json',
    );

    expect(() => mergeScenarioPackContent(base, overlay, 'fixture.json')).toThrow(
      /conflicts with base content/,
    );

    expect(() =>
      mergeScenarioPackContent(
        base,
        validateScenarioPackContentOverlay(
          {
            schemaVersion: '16C',
            floors: {
              replace: [
                {
                  id: 'bad-floor',
                  floor: 1,
                  width: 9,
                  height: 9,
                  enemyIds: ['not_real_enemy'],
                  itemIds: ['potion'],
                  enemySpawnCount: 1,
                  itemSpawnCount: 1,
                  trapSpawnCount: 0,
                  maxTurns: 10,
                },
              ],
            },
          },
          'fixture.json',
        ),
        'fixture.json',
      ),
    ).toThrow(/unknown enemy id/);
  });

  it('keeps default trap definitions available on vanilla starts', () => {
    const state = start('seed_002');
    expect(getTrapDefinition('spike', getGameContentForRun(state.meta.scenarioPackId)).id).toBe(
      'spike',
    );
  });

  it('keeps default gameplay unchanged when no pack is selected', () => {
    const defaultConfig = resolveGameConfigForRun('v016');
    const explicitDefault = resolveGameConfigForRun('v016', undefined, 'default');
    const versionOnly = resolveGameConfigForVersion('v016');
    expect(defaultConfig).toEqual(versionOnly);
    expect(explicitDefault).toEqual(versionOnly);
    expect(start('seed_001').meta.totalFloors).toBe(5);
    expect(start('seed_001').meta.scenarioPackId).toBeUndefined();
  });

  it('reproduces the same initial setup for the same seed and pack', () => {
    const config = resolveGameConfigForRun('v016', undefined, 'shrine_trial');
    const first = start('seed_002', config);
    const second = start('seed_002', config);
    expect(second).toEqual(first);
    expect(first.meta.totalFloors).toBe(2);
    expect(first.meta.scenarioPackId).toBe('shrine_trial');
    const packContent = loadScenarioPackContent('shrine_trial');
    expect(packContent.events.floorEvents.some((event) => event.id === 'shrine_trial_intro')).toBe(
      true,
    );
    expect(packContent.events.npcs.find((npc) => npc.id === 'shrine_keeper')?.floor).toBe(1);
    expect(packContent.items.items.some((item) => item.id === 'trial_tonic')).toBe(true);
    expect(packContent.enemies.enemies.some((enemy) => enemy.id === 'trial_wisp')).toBe(true);
  });

  it('renders and exposes actions for pack-added items', () => {
    const state = start('seed_002', resolveGameConfigForRun('v016', undefined, 'shrine_trial'));
    const trialTonic = state.items.find((item) => item.type === 'trial_tonic');
    expect(trialTonic).toBeDefined();
    expect(render(state)).toContain('Trial Tonic');

    const stateAtItem = {
      ...state,
      player: { ...state.player, x: trialTonic!.x, y: trialTonic!.y },
      enemies: [],
    };
    const pickupAction = getAvailableActions(stateAtItem).find(
      (action) => action.type === 'pickup' && action.payload?.itemId === trialTonic!.id,
    );
    expect(pickupAction).toBeDefined();
    const holdingTonic = step(stateAtItem, pickupAction!).state;
    const damaged = {
      ...holdingTonic,
      player: { ...holdingTonic.player, hp: 10 },
    };
    const useAction = getAvailableActions(damaged).find(
      (action) => action.type === 'use_item' && action.payload?.itemType === 'trial_tonic',
    );
    expect(useAction?.label).toContain('Trial Tonic');
    const healed = step(damaged, useAction!).state;
    expect(healed.player.hp).toBeGreaterThan(10);
  });

  it('persists merged runConfig and pack content for descent', () => {
    const config = {
      ...resolveGameConfigForRun('v016', undefined, 'shrine_trial'),
      allowedEnemyIds: ['ghost'],
    };
    const state = start('seed_004', config);
    expect(state.floor).toBe(1);
    expect(state.meta.scenarioPackId).toBe('shrine_trial');
    expect(state.meta.runConfig?.totalFloors).toBe(2);
    expect(state.meta.runConfig?.allowedEnemyIds).toEqual(['ghost']);

    const floorTwo = getGameContentForRun('shrine_trial').floors.floors.find(
      (floor) => floor.floor === 2,
    );
    expect(floorTwo?.enemyIds).toEqual(['trial_wisp']);
    expect(getGameContentForRun().floors.floors.find((floor) => floor.floor === 2)?.enemyIds).toEqual(
      ['slime', 'bat'],
    );

    const descended = descendFromCurrentFloor(state);
    expect(descended.floor).toBe(2);
    expect(descended.meta.scenarioPackId).toBe('shrine_trial');
    expect(descended.meta.runConfig?.allowedEnemyIds).toEqual(['ghost']);
    expect(descended.enemies.every((enemy) => enemy.type === 'ghost')).toBe(true);
  });

  it('records scenario_pack metadata on trace and scorecard', async () => {
    const result = await runPlaythrough({
      seed: 'seed_003',
      policyId: 'random',
      version: 'v016',
      scenarioPack: 'shrine_trial',
      policy: abortPolicy,
      dryRun: true,
      maxSteps: 8,
    });

    expect(result.trace.scenario_pack).toBe('shrine_trial');
    expect(result.trace.scenario_pack_label).toBe('Shrine Trial');
    expect(normalizeScenarioPackId('default')).toBeUndefined();

    const scorecard = deriveScorecardFromTrace(
      result.trace,
      'runs/v016/traces/seed_003-random.json',
    );
    expect(scorecard.scenario_pack).toBe('shrine_trial');
    expect(scorecard.scenario_pack_label).toBe('Shrine Trial');
    validateScorecard(scorecard);
    expect(() =>
      validateScorecard({ ...scorecard, scenario_pack: 42 } as unknown as typeof scorecard),
    ).toThrow(/scenario_pack/);
  });

  it('normalizes direct default scenario pack runs to unlabeled evidence', async () => {
    const result = await runPlaythrough({
      seed: 'seed_001',
      policyId: 'random',
      version: 'v016',
      scenarioPack: 'default',
      policy: abortPolicy,
      dryRun: true,
      maxSteps: 4,
    });

    expect(result.trace.scenario_pack).toBeUndefined();
    expect(result.scorecard.scenario_pack).toBeUndefined();
  });

  it('reaches a terminal state for the example pack', async () => {
    const result = await runPlaythrough({
      seed: 'seed_002',
      policyId: 'stairs-seeking',
      version: 'v016',
      scenarioPack: 'shrine_trial',
      dryRun: true,
      maxSteps: 4096,
    });
    expect(['WIN', 'LOSS', 'ABORTED']).toContain(result.trace.result);
  });

  it('labels version summary and comparison artifacts with scenario pack', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-scenario-pack-'));
    try {
      await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v016',
        scenarioPack: 'shrine_trial',
        runsRoot,
        maxSteps: 24,
        onExisting: 'overwrite',
      });

      const summary = await summarizeVersion(runsRoot, 'v016');
      expect(summary.scenario_pack).toBe('shrine_trial');
      expect(summary.scenario_pack_label).toBe('Shrine Trial');
      expect(summary.runs[0]?.scenario_pack).toBe('shrine_trial');

      const comparison = await compareVersions(runsRoot, 'v016', 'v016');
      expect(comparison.scenario_pack?.target).toBe('shrine_trial');
      const markdown = renderComparisonMarkdown(comparison);
      expect(markdown).toContain('Scenario pack');
      expect(markdown).toContain('shrine_trial');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('labels acceptance markdown with scenario pack evidence', () => {
    const markdown = renderAcceptanceMarkdown({
      version: 'v016',
      versionDir: 'runs/v016',
      acceptancePath: 'runs/v016/acceptance.md',
      generatedAt: '2026-05-23T00:00:00.000Z',
      machine_recommendation: 'pass',
      human_decision: 'pending',
      checks: [],
      blockers: [],
      risks: [],
      forbidden_mvp_checklist: [],
      global_forbidden_changes: [],
      counts: {
        pass: 0,
        fail: 0,
        warning: 0,
        skipped: 0,
        blocked: 0,
      },
      summary: {
        version: 'v016',
        versionDir: 'runs/v016',
        status: 'complete',
        scenario_pack: 'shrine_trial',
        scenario_pack_label: 'Shrine Trial',
        acceptance_status: 'pending',
        runs: [],
        score_averages: {},
        terminal_results: {},
        artifact_coverage: {
          traces: { expected: 0, present: 0, missing: [] },
          reviews: { expected: 0, present: 0, missing: [] },
          scorecards: { expected: 0, present: 0, missing: [] },
          markdown: {
            'patch_plan.md': {
              path: 'runs/v016/patch_plan.md',
              present: true,
              nonEmpty: true,
            },
            'changelog.md': {
              path: 'runs/v016/changelog.md',
              present: true,
              nonEmpty: true,
            },
            'developer_notes.md': {
              path: 'runs/v016/developer_notes.md',
              present: true,
              nonEmpty: true,
            },
            'acceptance.md': {
              path: 'runs/v016/acceptance.md',
              present: true,
              nonEmpty: true,
            },
          },
        },
        links: {
          patch_plan: 'runs/v016/patch_plan.md',
          changelog: 'runs/v016/changelog.md',
          developer_notes: 'runs/v016/developer_notes.md',
          acceptance: 'runs/v016/acceptance.md',
        },
      },
    } as AcceptanceGateResult);

    expect(markdown).toContain('- Scenario pack: shrine_trial (Shrine Trial)');
  });
});
