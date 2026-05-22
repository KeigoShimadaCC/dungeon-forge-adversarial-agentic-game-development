import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildReviewRelativePath, buildScorecardRelativePath } from '../src/harness/artifacts.js';
import { runDeveloperTaskCli } from '../src/harness/developer-workflow-cli.js';
import {
  DEFAULT_DEVELOPER_TEST_COMMANDS,
  DeveloperTaskValidationError,
  GLOBAL_FORBIDDEN_CHANGES,
  generateDeveloperTask,
  renderChangelogTemplate,
  renderDeveloperTaskMarkdown,
  renderPatchPlanTemplate,
  validateDeveloperTaskInput,
} from '../src/harness/developer-workflow.js';
import type { PlaythroughReview } from '../src/harness/reviewer-client.js';
import type { PlaythroughScorecard } from '../src/harness/types.js';
import { runVersion } from '../src/harness/version-loop.js';

const withTempRunsRoot = async (fn: (runsRoot: string) => Promise<void>): Promise<void> => {
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-developer-workflow-'));
  try {
    await fn(runsRoot);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
};

const makeReview = (): PlaythroughReview => ({
  version: 'v001',
  seed: 'seed_001',
  persona: 'careful_player',
  summary:
    'As a careful player, the run ended in WIN after 42 turns, but item decisions were too obvious.',
  scores: {
    fun: 6,
    clarity: 7,
    fairness: 7,
    tactical_depth: 5,
    replay_value: 5,
  },
  top_issues: [
    {
      severity: 'major',
      observation: 'Most combat turns were simple attack choices.',
      diagnosis: 'The player rarely weighs tactical alternatives once adjacent to a Slime.',
      recommendation: 'Add one tactical item or combat option that creates a bounded escape choice.',
      evidence: [
        {
          kind: 'turn',
          turn: 12,
          detail: 'The trace showed repeated attack actions against an adjacent enemy.',
          quote: 'You attack the Slime.',
        },
      ],
    },
  ],
  suggested_next_changes: [
    'Add one panic item.',
    'Improve the ASCII legend.',
    'Tune early enemy pressure.',
  ],
  trace_path: 'runs/v001/traces/seed_001_careful_player.json',
  scorecard_path: 'runs/v001/scorecards/seed_001_careful_player.json',
  evidence_quality: 'full',
});

const makeScorecard = (): PlaythroughScorecard => ({
  version: 'v001',
  seed: 'seed_001',
  persona: 'careful_player',
  result: 'WIN',
  turns: 42,
  floors_reached: 5,
  damage_taken: 7,
  items_used: 1,
  enemies_defeated: 3,
  invalid_actions: 0,
  softlocks: 0,
  reviewer_scores: {
    fun: 6,
    clarity: 7,
    fairness: 7,
    tactical_depth: 5,
    replay_value: 5,
  },
  trace_path: 'runs/v001/traces/seed_001_careful_player.json',
  review_path: 'runs/v001/reviews/seed_001_careful_player.json',
  review_id: 'careful_player:seed_001',
});

const makeInput = (overrides: Partial<Parameters<typeof generateDeveloperTask>[0]> = {}) => ({
  review: makeReview(),
  scorecard: makeScorecard(),
  previousReviewPath: 'runs/v001/reviews/seed_001_careful_player.json',
  previousScorecardPath: 'runs/v001/scorecards/seed_001_careful_player.json',
  targetVersion: 'v002',
  targetScope: 'Add one bounded tactical clarity improvement from the previous review.',
  allowedChanges: ['Add one deterministic tactical item.', 'Improve ASCII legend text.'],
  forbiddenChanges: ['Do not touch generated run evidence by hand.'],
  proposedChanges: ['Add one panic item.', 'Improve the ASCII legend.'],
  runsRoot: '/tmp/df-task-test',
  ...overrides,
});

describe('Phase 08A developer workflow', () => {
  it('generates a bounded developer task with evidence, artifacts, and default gates', () => {
    const task = generateDeveloperTask(makeInput());
    const markdown = renderDeveloperTaskMarkdown(task);

    expect(task).toMatchObject({
      previous_review_path: 'runs/v001/reviews/seed_001_careful_player.json',
      previous_scorecard_path: 'runs/v001/scorecards/seed_001_careful_player.json',
      target_version: 'v002',
      target_scope: 'Add one bounded tactical clarity improvement from the previous review.',
      governance: {
        human_governed: true,
        autonomous_patch_execution: false,
      },
    });
    expect(task.allowed_changes).toContain('Add one deterministic tactical item.');
    expect(task.forbidden_changes).toEqual(
      expect.arrayContaining([...GLOBAL_FORBIDDEN_CHANGES, 'Do not touch generated run evidence by hand.']),
    );
    expect(task.required_test_commands).toEqual([...DEFAULT_DEVELOPER_TEST_COMMANDS]);
    expect(task.required_patch_plan_path).toBe('/tmp/df-task-test/runs/v002/patch_plan.md');
    expect(task.required_changelog_path).toBe('/tmp/df-task-test/runs/v002/changelog.md');
    expect(task.expected_implementation_summary).toContain('Implement 2 bounded change(s) for v002');
    expect(task.evidence.review_issues[0]).toMatchObject({
      severity: 'major',
      observation: 'Most combat turns were simple attack choices.',
    });

    expect(markdown).toContain('Evidence-backed review issues');
    expect(markdown).toContain('The trace showed repeated attack actions');
    expect(markdown).toContain('pnpm run build');
    expect(markdown).toContain('git diff --check');
    expect(markdown).toContain('GameEngine interface');
  });

  it('renders patch plan and changelog templates with scoped workflow fields', () => {
    const task = generateDeveloperTask(makeInput());
    const patchPlan = renderPatchPlanTemplate(task, makeReview());
    const changelog = renderChangelogTemplate(task);

    expect(patchPlan).toContain('## Review issues being addressed');
    expect(patchPlan).toContain('## Proposed scoped changes (1-3)');
    expect(patchPlan).toContain('## Expected files/modules');
    expect(patchPlan).toContain('## Non-goals');
    expect(patchPlan).toContain('GameEngine interface');
    expect(changelog).toContain('## Implemented changes');
    expect(changelog).toContain('## Tests and evidence');
    expect(changelog).toContain('Seed determinism and explicit terminal states preserved.');
  });

  it('rejects malformed required fields and protocol-breaking allowed work', () => {
    expect(() => validateDeveloperTaskInput(makeInput({ targetVersion: 'v2' }))).toThrow(
      'Invalid version id "v2"',
    );
    expect(() => validateDeveloperTaskInput(makeInput({ targetScope: '   ' }))).toThrow(
      'targetScope must be a non-empty string',
    );
    expect(() =>
      validateDeveloperTaskInput(
        makeInput({ proposedChanges: ['One', 'Two', 'Three', 'Four'] }),
      ),
    ).toThrow('at most 3 scoped changes');
    expect(() =>
      validateDeveloperTaskInput(
        makeInput({ allowedChanges: ['Change the GameEngine interface to accept free text.'] }),
      ),
    ).toThrow(DeveloperTaskValidationError);
  });

  it('writes a developer task from real Phase 07A review and scorecard evidence', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runVersion(runsRoot, 'v001');
      const reviewPath = buildReviewRelativePath('v001', 'seed_001', 'careful_player');
      const scorecardPath = buildScorecardRelativePath('v001', 'seed_001', 'careful_player');

      const result = await runDeveloperTaskCli([
        '--runs-root',
        runsRoot,
        '--review',
        reviewPath,
        '--scorecard',
        scorecardPath,
        '--target-version',
        'v002',
        '--scope',
        'Improve one clarity issue from the careful_player review.',
        '--allowed',
        'Improve render text and legend clarity.',
        '--forbidden',
        'Do not edit src/game/engine.ts.',
        '--proposed',
        'Clarify item and enemy symbols in the ASCII legend.',
        '--test-command',
        'pnpm test tests/render.test.ts',
        '--write',
      ]);

      expect(result.outputPath).toBe(path.join(runsRoot, 'runs', 'v002', 'developer_task.md'));
      const markdown = await readFile(result.outputPath ?? '', 'utf8');
      expect(markdown).toContain(`Previous review: \`${reviewPath}\``);
      expect(markdown).toContain(`Previous scorecard: \`${scorecardPath}\``);
      expect(markdown).toContain('Target version: `v002`');
      expect(markdown).toContain('Improve render text and legend clarity.');
      expect(markdown).toContain('Do not edit src/game/engine.ts.');
      expect(markdown).toContain('pnpm test tests/render.test.ts');
    });
  });
});
