import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CHALLENGE_MODES_SCHEMA_VERSION,
  assertChallengeModeId,
  getChallengeModePreset,
  loadChallengeModes,
  mergeGameConfig,
  resolveGameConfigForRun,
  validateChallengeModesBundle,
} from '../src/game/challenge-modes.js';
import { start } from '../src/game/engine.js';
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

const validChallengeModesBundle = () => ({
  schemaVersion: CHALLENGE_MODES_SCHEMA_VERSION,
  presets: [
    {
      id: 'short_mode',
      label: 'Short Mode',
      description: 'A tiny finite challenge mode for validation tests.',
      gameConfig: {
        totalFloors: 1,
      },
    },
  ],
});

const runToTerminal = async (seed: string, challengeMode: string): Promise<void> => {
  const result = await runPlaythrough({
    seed,
    policyId: 'stairs-seeking',
    version: 'v016',
    challengeMode,
    dryRun: true,
    maxSteps: 4096,
  });
  expect(['WIN', 'LOSS', 'ABORTED']).toContain(result.trace.result);
};

describe('Phase 16B challenge modes', () => {
  it('loads and validates challenge mode presets', () => {
    const bundle = loadChallengeModes();
    expect(bundle.schemaVersion).toBe(CHALLENGE_MODES_SCHEMA_VERSION);
    expect(bundle.presets.length).toBeGreaterThanOrEqual(2);
    expect(getChallengeModePreset('enemy_gauntlet')?.gameConfig.totalFloors).toBe(3);
    expect(getChallengeModePreset('item_sparse')?.gameConfig.totalFloors).toBe(4);
    expect(() => assertChallengeModeId('not_a_mode')).toThrow(/Unknown challenge mode/);
  });

  it('rejects malformed challenge mode bundles', () => {
    expect(() =>
      validateChallengeModesBundle({
        ...validChallengeModesBundle(),
        schemaVersion: 'future',
      }),
    ).toThrow(/schemaVersion/);

    expect(() =>
      validateChallengeModesBundle({
        ...validChallengeModesBundle(),
        presets: [
          {
            ...validChallengeModesBundle().presets[0],
            gameConfig: {},
          },
        ],
      }),
    ).toThrow(/totalFloors/);

    expect(() => {
      const bundle = validChallengeModesBundle();
      validateChallengeModesBundle({
        ...bundle,
        presets: [...bundle.presets, { ...bundle.presets[0], label: 'Duplicate Mode' }],
      });
    }).toThrow(/duplicates preset/);
  });

  it('keeps default gameplay unchanged when challenge mode is omitted', () => {
    const defaultConfig = resolveGameConfigForRun('v016');
    const explicitDefaultConfig = resolveGameConfigForRun('v016', 'default');
    const versionOnly = resolveGameConfigForVersion('v016');
    expect(defaultConfig).toEqual(versionOnly);
    expect(explicitDefaultConfig).toEqual(versionOnly);
    expect(start('seed_001').meta.totalFloors).toBe(5);
  });

  it('normalizes direct default challenge runs to unlabeled default evidence', async () => {
    const result = await runPlaythrough({
      seed: 'seed_001',
      policyId: 'random',
      version: 'v016',
      challengeMode: 'default',
      policy: abortPolicy,
      dryRun: true,
      maxSteps: 4,
    });

    expect(result.trace.challenge_mode).toBeUndefined();
    expect(result.scorecard.challenge_mode).toBeUndefined();
  });

  it('reproduces the same initial setup for the same seed and challenge mode', () => {
    const first = start('seed_002', resolveGameConfigForRun('v016', 'enemy_gauntlet'));
    const second = start('seed_002', resolveGameConfigForRun('v016', 'enemy_gauntlet'));
    expect(second).toEqual(first);
    expect(first.meta.totalFloors).toBe(3);
    expect(first.items.every((item) => ['potion', 'smoke_bomb'].includes(item.type))).toBe(true);
  });

  it('records challenge_mode on trace and scorecard', async () => {
    const result = await runPlaythrough({
      seed: 'seed_003',
      policyId: 'random',
      version: 'v016',
      challengeMode: 'item_sparse',
      policy: abortPolicy,
      dryRun: true,
      maxSteps: 8,
    });

    expect(result.trace.challenge_mode).toBe('item_sparse');
    const scorecard = deriveScorecardFromTrace(result.trace, 'runs/v016/traces/seed_003-random.json');
    expect(scorecard.challenge_mode).toBe('item_sparse');
    validateScorecard(scorecard);
    expect(() =>
      validateScorecard({ ...scorecard, challenge_mode: 42 } as unknown as typeof scorecard),
    ).toThrow(/challenge_mode/);
  });

  it('reaches explicit terminal states for each preset', async () => {
    await runToTerminal('seed_002', 'enemy_gauntlet');
    await runToTerminal('seed_003', 'item_sparse');
    await runToTerminal('seed_001', 'full_depth');
  });

  it('labels version summary and comparison artifacts with challenge mode', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-challenge-'));
    try {
      await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v016',
        challengeMode: 'enemy_gauntlet',
        runsRoot,
        maxSteps: 24,
        onExisting: 'overwrite',
      });

      const summary = await summarizeVersion(runsRoot, 'v016');
      expect(summary.challenge_mode).toBe('enemy_gauntlet');
      expect(summary.runs[0]?.challenge_mode).toBe('enemy_gauntlet');

      const comparison = await compareVersions(runsRoot, 'v016', 'v016');
      expect(comparison.challenge_mode?.target).toBe('enemy_gauntlet');
      const markdown = renderComparisonMarkdown(comparison);
      expect(markdown).toContain('Challenge mode');
      expect(markdown).toContain('enemy_gauntlet');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('labels acceptance markdown with challenge mode evidence', () => {
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
        challenge_mode: 'enemy_gauntlet',
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

    expect(markdown).toContain('- Challenge mode: enemy_gauntlet');
  });

  it('merges opening logs without dropping version profile fields', () => {
    const merged = mergeGameConfig(resolveGameConfigForVersion('v002'), {
      totalFloors: 2,
      openingLog: ['Challenge overlay line.'],
    });
    expect(merged.totalFloors).toBe(2);
    expect(merged.allowedEnemyIds).toEqual(resolveGameConfigForVersion('v002').allowedEnemyIds);
    expect(merged.openingLog).toContain('Challenge overlay line.');
  });
});
