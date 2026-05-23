import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assessLoopIteration,
  buildLoopCoordinatorCheckpoint,
  getLoopCoordinatorCheckpointPath,
  LOOP_COORDINATOR_STEP_ORDER,
  renderLoopCoordinatorRunbook,
  writeLoopCoordinatorArtifacts,
} from '../src/harness/loop-coordinator.js';
import { runLoopCoordinatorCli } from '../src/harness/loop-coordinator-cli.js';
import { stringifyDeterministicJson } from '../src/harness/json.js';
import { buildReviewRelativePath, buildScorecardRelativePath, buildTraceRelativePath } from '../src/harness/artifacts.js';
import type { PlaythroughScorecard } from '../src/harness/types.js';
import type { VersionRunSpec } from '../src/harness/version-loop.js';

const SINGLE_RUN_SPEC = [
  { seed: 'seed_001', persona: 'careful_player' },
] as const satisfies readonly VersionRunSpec[];

const withTempRunsRoot = async (
  fn: (runsRoot: string) => Promise<void>,
): Promise<void> => {
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-loop-coordinator-'));
  try {
    await fn(runsRoot);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
};

const writeMinimalScorecard = async (
  runsRoot: string,
  version: string,
  seed: string,
  persona: string,
): Promise<void> => {
  const scorecardPath = path.join(
    runsRoot,
    buildScorecardRelativePath(version, seed, persona),
  );
  await mkdir(path.dirname(scorecardPath), { recursive: true });
  const scorecard: PlaythroughScorecard = {
    version,
    seed,
    persona,
    result: 'WIN',
    turns: 12,
    floors_reached: 1,
    damage_taken: 4,
    items_used: 1,
    enemies_defeated: 1,
    invalid_actions: 0,
    softlocks: 0,
    trace_path: buildTraceRelativePath(version, seed, persona),
    reviewer_scores: {
      fun: 5,
      clarity: 5,
      fairness: 5,
      tactical_depth: 5,
      replay_value: 5,
    },
  };
  await writeFile(scorecardPath, `${stringifyDeterministicJson(scorecard)}\n`, 'utf8');
};

const writeMinimalTrace = async (
  runsRoot: string,
  version: string,
  seed: string,
  persona: string,
): Promise<void> => {
  const tracePath = path.join(runsRoot, buildTraceRelativePath(version, seed, persona));
  await mkdir(path.dirname(tracePath), { recursive: true });
  await writeFile(
    tracePath,
    `${stringifyDeterministicJson({
      version,
      seed,
      persona,
      result: 'WIN',
      turns: 12,
      events: [],
    })}\n`,
    'utf8',
  );
};

const writeMinimalReview = async (
  runsRoot: string,
  version: string,
  seed: string,
  persona: string,
): Promise<void> => {
  const reviewPath = path.join(runsRoot, buildReviewRelativePath(version, seed, persona));
  await mkdir(path.dirname(reviewPath), { recursive: true });
  await writeFile(
    reviewPath,
    `${stringifyDeterministicJson({
      version,
      seed,
      persona,
      trace_path: buildTraceRelativePath(version, seed, persona),
      scorecard_path: buildScorecardRelativePath(version, seed, persona),
      scores: {
        fun: 4,
        clarity: 4,
        fairness: 4,
        tactical_depth: 4,
        replay_value: 4,
      },
      issues: [
        {
          id: 'issue-1',
          severity: 'medium',
          summary: 'Opening guidance is thin.',
          evidence: [
            {
              kind: 'trace',
              path: buildTraceRelativePath(version, seed, persona),
              details: 'Player hesitated on floor 1.',
              turns: [3],
            },
          ],
          suggested_changes: ['Clarify opening guidance.'],
        },
      ],
      strengths: ['Deterministic combat is readable.'],
      evidence_quality: 'strong',
    })}\n`,
    'utf8',
  );
};

const seedBaseEvidence = async (runsRoot: string, version: string): Promise<void> => {
  const versionDir = path.join(runsRoot, 'runs', version);
  await mkdir(versionDir, { recursive: true });
  await writeMinimalTrace(runsRoot, version, 'seed_001', 'careful_player');
  await writeMinimalReview(runsRoot, version, 'seed_001', 'careful_player');
  await writeMinimalScorecard(runsRoot, version, 'seed_001', 'careful_player');
  await writeFile(
    path.join(versionDir, 'changelog.md'),
    '# Changelog\n\nImplemented bounded tuning.\n',
    'utf8',
  );
  await writeFile(
    path.join(versionDir, 'developer_notes.md'),
    '# Developer notes\n\nNotes for reviewers.\n',
    'utf8',
  );
  await writeFile(
    path.join(versionDir, 'patch_plan.md'),
    '# Patch plan\n\nScoped changes only.\n',
    'utf8',
  );
};

describe('loop coordinator', () => {
  it('covers ordered steps from run through acceptance', () => {
    expect(LOOP_COORDINATOR_STEP_ORDER).toEqual([
      'run',
      'review',
      'proposal',
      'developer_task',
      'validation',
      'acceptance',
    ]);
  });

  it('detects missing run evidence on base version', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const assessment = await assessLoopIteration({
        runsRoot,
        baseVersion: 'v001',
        targetVersion: 'v002',
        specs: SINGLE_RUN_SPEC,
      });

      expect(assessment.outcome).toBe('blocked');
      expect(assessment.steps.find((step) => step.id === 'run')?.status).toBe('missing');
      expect(assessment.blockers.some((entry) => entry.includes('Missing version directory'))).toBe(
        true,
      );
      expect(assessment.next_commands[0]).toContain('run-version');
    });
  });

  it('detects missing proposal and developer task on target version', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedBaseEvidence(runsRoot, 'v001');

      const assessment = await assessLoopIteration({
        runsRoot,
        baseVersion: 'v001',
        targetVersion: 'v002',
        specs: SINGLE_RUN_SPEC,
      });

      expect(assessment.steps.find((step) => step.id === 'run')?.status).toBe('complete');
      expect(assessment.steps.find((step) => step.id === 'proposal')?.status).toBe('missing');
      expect(assessment.steps.find((step) => step.id === 'developer_task')?.status).toBe('missing');
      expect(assessment.outcome).toBe('blocked');
    });
  });

  it('records validation blockers without fabricating pass when command statuses are absent', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedBaseEvidence(runsRoot, 'v001');
      await seedBaseEvidence(runsRoot, 'v002');
      await writeFile(
        path.join(runsRoot, 'runs', 'v002', 'developer_task.md'),
        '# Developer task\n\nImplement clarity tuning from v001 review.\n',
        'utf8',
      );
      await writeFile(
        path.join(runsRoot, 'runs', 'v002', 'patch_proposal.json'),
        `${stringifyDeterministicJson({ schema_version: '1' })}\n`,
        'utf8',
      );

      const assessment = await assessLoopIteration({
        runsRoot,
        baseVersion: 'v001',
        targetVersion: 'v002',
        specs: SINGLE_RUN_SPEC,
      });

      const validation = assessment.steps.find((step) => step.id === 'validation');
      expect(validation?.status).toBe('not_run');
      expect(validation?.summary).toContain('will not fabricate');
      expect(assessment.validation_preview).toBeUndefined();
      expect(assessment.outcome).not.toBe('ready_for_acceptance');
    });
  });

  it('previews validation blockers when supplied command statuses fail', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedBaseEvidence(runsRoot, 'v001');
      await seedBaseEvidence(runsRoot, 'v002');
      await writeFile(
        path.join(runsRoot, 'runs', 'v002', 'developer_task.md'),
        '# Developer task\n\nImplement clarity tuning from v001 review.\n',
        'utf8',
      );
      await writeFile(
        path.join(runsRoot, 'runs', 'v002', 'patch_proposal.json'),
        `${stringifyDeterministicJson({ schema_version: '1' })}\n`,
        'utf8',
      );

      const assessment = await assessLoopIteration({
        runsRoot,
        baseVersion: 'v001',
        targetVersion: 'v002',
        specs: SINGLE_RUN_SPEC,
        commandStatuses: {
          typecheck: 'pass',
          test: 'fail',
          lint: 'pass',
          build: 'pass',
        },
      });

      expect(assessment.validation_preview?.machine_recommendation).toBe('fail');
      expect(assessment.validation_preview?.command_statuses_supplied).toBe(true);
      expect(assessment.steps.find((step) => step.id === 'validation')?.status).toBe('partial');
      expect(assessment.blockers.some((entry) => entry.toLowerCase().includes('test'))).toBe(true);
    });
  });

  it('keeps governance flags explicitly human-controlled', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const assessment = await assessLoopIteration({
        runsRoot,
        baseVersion: 'v001',
        targetVersion: 'v002',
        specs: SINGLE_RUN_SPEC,
      });

      expect(assessment.governance).toEqual({
        human_governed: true,
        autonomous_code_edit: false,
        autonomous_merge: false,
        coordinator_executes_repo_gates: false,
      });
      expect(renderLoopCoordinatorRunbook(assessment)).toContain('does not edit source');
    });
  });

  it('reports ready for acceptance after complete evidence and passing validation preview', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedBaseEvidence(runsRoot, 'v001');
      await seedBaseEvidence(runsRoot, 'v002');
      await writeFile(
        path.join(runsRoot, 'runs', 'v002', 'developer_task.md'),
        '# Developer task\n\nImplement clarity tuning from v001 review.\n',
        'utf8',
      );
      await writeFile(
        path.join(runsRoot, 'runs', 'v002', 'patch_proposal.json'),
        `${stringifyDeterministicJson({ schema_version: '1' })}\n`,
        'utf8',
      );

      const assessment = await assessLoopIteration({
        runsRoot,
        baseVersion: 'v001',
        targetVersion: 'v002',
        specs: SINGLE_RUN_SPEC,
        commandStatuses: {
          typecheck: 'pass',
          test: 'pass',
          lint: 'pass',
          build: 'pass',
        },
      });

      expect(assessment.outcome).toBe('ready_for_acceptance');
      expect(assessment.validation_preview?.machine_recommendation).toBe('pass');
      expect(assessment.steps.find((step) => step.id === 'acceptance')?.status).toBe('not_run');
      expect(assessment.required_human_decisions).toContain(
        'Human owner must record explicit accepted/rejected decision in acceptance.md.',
      );
    });
  });

  it('reports accepted and rejected outcomes from human acceptance evidence', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedBaseEvidence(runsRoot, 'v001');
      await seedBaseEvidence(runsRoot, 'v002');

      await writeFile(
        path.join(runsRoot, 'runs', 'v002', 'acceptance.md'),
        '# Acceptance\n\n## Human decision\n\nStatus: accepted\n',
        'utf8',
      );
      const accepted = await assessLoopIteration({
        runsRoot,
        baseVersion: 'v001',
        targetVersion: 'v002',
        specs: SINGLE_RUN_SPEC,
      });
      expect(accepted.outcome).toBe('accepted');

      await writeFile(
        path.join(runsRoot, 'runs', 'v002', 'acceptance.md'),
        '# Acceptance\n\n## Human decision\n\nStatus: rejected\n',
        'utf8',
      );
      const rejected = await assessLoopIteration({
        runsRoot,
        baseVersion: 'v001',
        targetVersion: 'v002',
        specs: SINGLE_RUN_SPEC,
      });
      expect(rejected.outcome).toBe('rejected');
    });
  });

  it('dry-run CLI sequences commands without executing repo gates', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedBaseEvidence(runsRoot, 'v001');
      const stdout: string[] = [];
      const originalWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = ((chunk: string | Uint8Array) => {
        stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
        return true;
      }) as typeof process.stdout.write;

      try {
        await runLoopCoordinatorCli([
          '--base-version',
          'v001',
          '--target-version',
          'v002',
          '--runs-root',
          runsRoot,
          '--no-require-proposal',
          '--stdout-only',
        ]);
      } finally {
        process.stdout.write = originalWrite;
      }

      const payload = JSON.parse(stdout.join('')) as {
        next_commands: string[];
        outcome: string;
      };
      expect(payload.outcome).toBe('blocked');
      expect(payload.next_commands.some((entry) => entry.includes('developer-task'))).toBe(
        true,
      );
      expect(payload.next_commands.some((entry) => entry.includes('pnpm run check'))).toBe(
        true,
      );
    });
  });

  it('writes decision checkpoint and runbook artifacts', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedBaseEvidence(runsRoot, 'v001');
      const assessment = await assessLoopIteration({
        runsRoot,
        baseVersion: 'v001',
        targetVersion: 'v002',
        reviewerDriven: true,
        specs: SINGLE_RUN_SPEC,
      });
      const paths = await writeLoopCoordinatorArtifacts(assessment, {
        generatedAt: '2026-05-23T00:00:00.000Z',
      });

      expect(paths.checkpointPath).toBe(
        getLoopCoordinatorCheckpointPath(runsRoot, 'v001_to_v002'),
      );
      const checkpoint = JSON.parse(await readFile(paths.checkpointPath, 'utf8')) as ReturnType<
        typeof buildLoopCoordinatorCheckpoint
      >;
      expect(checkpoint.checkpoint_kind).toBe('loop_coordinator_decision');
      expect(checkpoint.generated_at).toBe('2026-05-23T00:00:00.000Z');
      const runbook = await readFile(paths.runbookPath, 'utf8');
      expect(runbook).toContain('Loop Coordinator Runbook');
      expect(runbook).toContain('blocked');
      expect(renderLoopCoordinatorRunbook(assessment)).toContain('Artifact preservation');
    });
  });
});
