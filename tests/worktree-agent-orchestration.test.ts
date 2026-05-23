import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildWorktreeAuditorTaskBundle,
  buildWorktreeImplementationTaskBundle,
  buildWorktreeTaskBundleFromPhase,
  collectWorktreeTaskDiagnostics,
  collectWorktreeResultSummaryDiagnostics,
  inferOverallResultStatus,
  normalizeWorktreeResultSummary,
  validateWorktreeResultSummary,
  WORKTREE_TASK_BUNDLE_SCHEMA_VERSION,
  type WorktreeImplementationTaskBundle,
  type WorktreeResultSummary,
} from '../src/harness/worktree-agent-orchestration.js';
import { runWorktreeAgentCli } from '../src/harness/worktree-agent-cli.js';
import type { PhaseDefinition } from '../src/harness/phase-runner.js';
import { PATCH_PROPOSAL_SCHEMA_VERSION } from '../src/harness/structured-patch-proposal.js';

const withTempRepo = async (
  fn: (repoRoot: string) => Promise<void>,
): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'df-worktree-agent-'));
  try {
    await mkdir(path.join(repoRoot, 'phase-plans'), { recursive: true });
    await writeFile(
      path.join(repoRoot, 'phase-plans', 'PHASE-TEST-PLAN.md'),
      '# test plan\n',
      'utf8',
    );
    await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
};

const testPhase = (): PhaseDefinition => ({
  id: 'PHASE-TEST',
  plan: 'phase-plans/PHASE-TEST-PLAN.md',
  dependsOn: [],
  allowedPaths: ['src/harness/**', 'tests/**', 'docs/**'],
  parallelGroup: 'test',
  automerge: false,
});

const writePhaseRunnerFiles = async (
  repoRoot: string,
  validationCommands: string[] = ['pnpm test', 'pnpm run typecheck'],
): Promise<void> => {
  await mkdir(path.join(repoRoot, 'automation', 'policies'), { recursive: true });
  await writeFile(
    path.join(repoRoot, 'automation', 'phase-graph.json'),
    JSON.stringify({
      schemaVersion: 1,
      defaultStartPhase: 'PHASE-TEST',
      defaultParallelism: 1,
      globalValidationCommands: validationCommands,
      phases: [testPhase()],
    }),
    'utf8',
  );
  await writeFile(
    path.join(repoRoot, 'automation', 'phase-state.json'),
    JSON.stringify({
      schemaVersion: 1,
      lastUpdated: '2026-05-23',
      currentPhase: 'PHASE-TEST',
      phases: { 'PHASE-TEST': { status: 'queued' } },
    }),
    'utf8',
  );
  await writeFile(
    path.join(repoRoot, 'automation', 'policies', 'automerge-policy.json'),
    JSON.stringify({
      schemaVersion: 1,
      enabled: false,
      mergeMethod: 'squash',
      deleteBranchAfterMerge: true,
      removeCleanWorktreeAfterMerge: true,
      allowNoRemoteChecksWhenLocalGatePasses: true,
      requiredLocalCommands: [],
      requiredPreflight: [],
      requiredArtifacts: [],
      blockMergeWhen: [],
      gapPolicy: {
        blocking: 'fix',
        non_blocking: 'defer',
        out_of_scope: 'defer',
      },
    }),
    'utf8',
  );
};

describe('worktree agent orchestration', () => {
  it('builds implementation bundle with phase, scope, evidence, and validation commands', async () => {
    await withTempRepo(async (repoRoot) => {
      const bundle = buildWorktreeImplementationTaskBundle({
        phase: testPhase(),
        repoRoot,
        runsRoot: repoRoot,
        targetScope: 'Bounded test implementation',
      });

      expect(bundle.schema_version).toBe(WORKTREE_TASK_BUNDLE_SCHEMA_VERSION);
      expect(bundle.bundle_id).toBe('phase-test-implementation');
      expect(bundle.task_kind).toBe('implementation');
      expect(bundle.phase.id).toBe('PHASE-TEST');
      expect(bundle.scope.allowed_paths).toContain('src/harness/**');
      expect(bundle.scope.forbidden_paths.length).toBeGreaterThan(0);
      expect(bundle.validation_commands.length).toBeGreaterThan(0);
      expect(bundle.evidence.artifacts.some((artifact) => artifact.kind === 'phase_plan')).toBe(
        true,
      );
      expect(bundle.governance.autonomous_merge).toBe(false);
      expect(bundle.delegate.mode).toBe('agent');
    });
  });

  it('blocks validation when required scope or evidence is missing', async () => {
    await withTempRepo(async (repoRoot) => {
      const bundle = buildWorktreeImplementationTaskBundle({
        phase: {
          ...testPhase(),
          allowedPaths: [],
        },
        repoRoot,
        runsRoot: repoRoot,
        targetScope: '',
      });

      const validation = await collectWorktreeTaskDiagnostics(bundle, {
        verifyEvidenceFiles: false,
      });
      expect(validation.ok).toBe(false);
      expect(validation.blockers.some((entry) => entry.field === 'scope.allowed_paths')).toBe(
        true,
      );
      expect(validation.blockers.some((entry) => entry.field === 'inputs.target_scope')).toBe(
        true,
      );
    });
  });

  it('blocks validation when required evidence files are missing on disk', async () => {
    await withTempRepo(async (repoRoot) => {
      const bundle = buildWorktreeImplementationTaskBundle({
        phase: testPhase(),
        repoRoot,
        runsRoot: repoRoot,
        targetScope: 'Missing evidence file case',
        evidenceArtifacts: [
          {
            kind: 'review',
            path: 'runs/v001/reviews/missing.json',
            required: true,
          },
        ],
      });

      const validation = await collectWorktreeTaskDiagnostics(bundle, {
        verifyEvidenceFiles: true,
      });
      expect(validation.ok).toBe(false);
      expect(
        validation.blockers.some((entry) => entry.message.includes('missing.json')),
      ).toBe(true);
    });
  });

  it('builds read-only auditor bundle with audit-only delegate mode', async () => {
    await withTempRepo(async (repoRoot) => {
      const bundle = buildWorktreeAuditorTaskBundle({
        phase: testPhase(),
        repoRoot,
        runsRoot: repoRoot,
        reviewTargets: ['src/harness/**', 'PROGRESS.MD'],
      });

      expect(bundle.task_kind).toBe('read_only_audit');
      expect(bundle.delegate.mode).toBe('ask');
      expect(bundle.instructions.forbidden_actions).toContain('edit');
      expect(bundle.instructions.review_targets.length).toBeGreaterThan(0);
    });
  });

  it('distinguishes pass, fail, blocked, and not-run checks in result summaries', async () => {
    const summary: WorktreeResultSummary = {
      schema_version: '1',
      bundle_id: 'phase-test-implementation-1',
      task_kind: 'implementation',
      phase_id: 'PHASE-TEST',
      branch: 'phase/test',
      worktree_path: '/tmp/wt',
      reported_at: new Date().toISOString(),
      governance: {
        verified_by_orchestrator: false,
        merge_authority: 'human_orchestrator',
        agent_report_advisory: true,
      },
      diff: { status: 'pass', files_changed: ['src/harness/foo.ts'] },
      checks: [
        { command: 'pnpm test', status: 'pass' },
        { command: 'pnpm run lint', status: 'fail', exit_code: 1 },
        { command: 'pnpm run build', status: 'not_run' },
      ],
      blockers: [],
      risks: [],
      advisory_notes: [],
      overall_status: 'pass',
    };

    expect(inferOverallResultStatus(summary)).toBe('fail');
    expect(
      collectWorktreeResultSummaryDiagnostics({
        ...summary,
        checks: [{ command: 'pnpm test', status: 'blocked' }],
        overall_status: 'blocked',
      }).some((entry) => entry.category === 'blocker'),
    ).toBe(false);

    const blockedSummary = {
      ...summary,
      checks: [{ command: 'pnpm test', status: 'pass' as const }],
      blockers: ['orchestrator has not rerun gates'],
    };
    expect(inferOverallResultStatus(blockedSummary)).toBe('blocked');

    const normalized = normalizeWorktreeResultSummary({
      ...summary,
      overall_status: 'pass',
    });
    expect(normalized.overall_status).toBe('fail');
    expect(validateWorktreeResultSummary(normalized).ok).toBe(true);

    const notRunSummary: WorktreeResultSummary = {
      ...summary,
      diff: { status: 'not_run', files_changed: [] },
      checks: [{ command: 'pnpm test', status: 'not_run' }],
      overall_status: 'pass',
    };
    expect(inferOverallResultStatus(notRunSummary)).toBe('blocked');
    expect(validateWorktreeResultSummary(notRunSummary).ok).toBe(false);
  });

  it('links patch proposal evidence into implementation bundles', async () => {
    await withTempRepo(async (repoRoot) => {
      const runsRoot = path.join(repoRoot, 'runs');
      const proposalPath = path.join(runsRoot, 'v002', 'patch_proposal.json');
      await mkdir(path.dirname(proposalPath), { recursive: true });
      await writeFile(
        proposalPath,
        JSON.stringify({
          schema_version: PATCH_PROPOSAL_SCHEMA_VERSION,
          proposal_id: 'proposal-v002',
          base_version: 'v001',
          target_version: 'v002',
          target_scope: 'Tune clarity',
          status: 'draft',
          governance: {
            human_governed: true,
            autonomous_patch_execution: false,
            implementation_authority: 'human_owner',
          },
          evidence_artifacts: {
            trace: {
              kind: 'trace',
              path: 'runs/v001/traces/seed_001_careful_player.json',
              version: 'v001',
              required: true,
            },
            review: {
              kind: 'review',
              path: 'runs/v001/reviews/seed_001_careful_player.json',
              version: 'v001',
              required: true,
            },
            scorecard: {
              kind: 'scorecard',
              path: 'runs/v001/scorecards/seed_001_careful_player.json',
              version: 'v001',
              required: true,
            },
          },
          changes: [],
          scope: {
            allowed_paths: ['src/game/**'],
            forbidden_changes: [],
            forbidden_mvp_features: [],
            global_forbidden_changes: [],
            protocol_invariants: [],
          },
          risks: [],
          validation_commands: ['pnpm test'],
        }),
        'utf8',
      );

      const bundle = buildWorktreeImplementationTaskBundle({
        phase: testPhase(),
        repoRoot,
        runsRoot,
        targetScope: 'Implement v002 from proposal',
        patchProposal: JSON.parse(await readFile(proposalPath, 'utf8')) as never,
        patchProposalPath: 'runs/v002/patch_proposal.json',
      });

      expect(bundle.inputs.target_version).toBe('v002');
      expect(
        bundle.evidence.artifacts.some((artifact) => artifact.kind === 'patch_proposal'),
      ).toBe(true);
      expect(bundle.validation_commands).toContain('pnpm test');
    });
  });

  it('CLI writes implementation bundle and result template for a phase', async () => {
    await withTempRepo(async (repoRoot) => {
      await writePhaseRunnerFiles(repoRoot);

      const result = await runWorktreeAgentCli([
        '--phase',
        'PHASE-TEST',
        '--repo-root',
        repoRoot,
        '--runs-root',
        repoRoot,
        '--target-scope',
        'CLI smoke scope',
        '--write',
        '--write-result-template',
      ]);

      expect(result.bundlePath).toBe(
        path.join(repoRoot, 'runs', 'worktree-tasks', 'PHASE-TEST', 'implementation_task.json'),
      );
      expect(result.resultPath).toBe(
        path.join(repoRoot, 'runs', 'worktree-tasks', 'PHASE-TEST', 'result_summary.json'),
      );

      const writtenBundle = JSON.parse(
        await readFile(result.bundlePath!, 'utf8'),
      ) as WorktreeImplementationTaskBundle;
      expect(writtenBundle.inputs.target_scope).toBe('CLI smoke scope');
    });
  });

  it('CLI validates read-only auditor bundles without writing artifacts', async () => {
    await withTempRepo(async (repoRoot) => {
      await writePhaseRunnerFiles(repoRoot);

      const result = await runWorktreeAgentCli([
        '--phase',
        'PHASE-TEST',
        '--kind',
        'read_only_audit',
        '--repo-root',
        repoRoot,
        '--runs-root',
        repoRoot,
        '--review-target',
        'src/harness/**',
        '--validate-only',
      ]);

      expect(result.bundle?.task_kind).toBe('read_only_audit');
      if (result.bundle?.task_kind !== 'read_only_audit') {
        throw new Error('Expected read_only_audit bundle from CLI');
      }
      expect(result.bundle?.delegate.mode).toBe('ask');
      expect(result.bundle?.instructions.review_targets).toContain('src/harness/**');
    });
  });

  it('buildWorktreeTaskBundleFromPhase loads graph-backed phase metadata', async () => {
    await withTempRepo(async (repoRoot) => {
      await writePhaseRunnerFiles(repoRoot, ['pnpm run check']);

      const bundle = await buildWorktreeTaskBundleFromPhase(repoRoot, 'PHASE-TEST', {
        targetScope: 'Graph-backed bundle',
      });
      expect(bundle.validation_commands).toContain('pnpm run check');
    });
  });
});
