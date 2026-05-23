import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  applyDeterministicJsonPatch,
  collectJsonPatchDiagnostics,
  isGloballyAllowedPatchTarget,
  parseJsonPointer,
  type DeterministicJsonPatch,
} from '../src/harness/deterministic-json-patch.js';
import { runJsonPatchCli } from '../src/harness/json-patch-cli.js';
import { stringifyDeterministicJson } from '../src/harness/json.js';
import {
  assembleStructuredPatchProposal,
  buildPatchProposalChangesFromReview,
} from '../src/harness/structured-patch-proposal.js';
import type { PlaythroughReview } from '../src/harness/reviewer-client.js';
import type { PlaythroughScorecard } from '../src/harness/types.js';

const withTempWorkspace = async (
  fn: (roots: { repoRoot: string; runsRoot: string }) => Promise<void>,
): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'df-json-patch-repo-'));
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-json-patch-runs-'));
  try {
    await fn({ repoRoot, runsRoot });
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(runsRoot, { recursive: true, force: true });
  }
};

const makeReview = (): PlaythroughReview => ({
  version: 'v001',
  seed: 'seed_001',
  persona: 'careful_player',
  summary: 'WIN after 42 turns with clear item choices.',
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
      observation: 'Challenge labels are easy to miss.',
      diagnosis: 'Preset descriptions do not call out the mode in the first sentence.',
      recommendation: 'Clarify the Enemy Gauntlet description for quicker scanning.',
      evidence: [
        {
          kind: 'render',
          detail: 'Challenge label appeared late in the opening log.',
        },
      ],
    },
  ],
  suggested_next_changes: ['Clarify challenge preset descriptions.'],
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
});

const seedWorkspace = async (roots: { repoRoot: string; runsRoot: string }) => {
  const sourceContent = path.resolve('content/challenge-modes.json');
  await mkdir(path.join(roots.repoRoot, 'content'), { recursive: true });
  await cp(sourceContent, path.join(roots.repoRoot, 'content/challenge-modes.json'));

  const review = makeReview();
  const scorecard = makeScorecard();
  const tracePath = path.join(roots.runsRoot, review.trace_path!);
  const reviewPath = path.join(roots.runsRoot, 'runs/v001/reviews/seed_001_careful_player.json');
  const scorecardPath = path.join(roots.runsRoot, 'runs/v001/scorecards/seed_001_careful_player.json');
  await mkdir(path.dirname(tracePath), { recursive: true });
  await mkdir(path.dirname(reviewPath), { recursive: true });
  await mkdir(path.dirname(scorecardPath), { recursive: true });
  await writeFile(
    tracePath,
    JSON.stringify({
      version: review.version,
      seed: review.seed,
      persona: review.persona,
      result: scorecard.result,
      turns: scorecard.turns,
      steps: [],
    }),
    'utf8',
  );
  await writeFile(reviewPath, JSON.stringify(review), 'utf8');
  await writeFile(scorecardPath, JSON.stringify(scorecard), 'utf8');

  const proposal = assembleStructuredPatchProposal({
    review,
    scorecard,
    baseVersion: 'v001',
    targetVersion: 'v002',
    targetScope: 'Clarify challenge preset copy from reviewer evidence.',
    tracePath: review.trace_path!,
    reviewPath: 'runs/v001/reviews/seed_001_careful_player.json',
    scorecardPath: 'runs/v001/scorecards/seed_001_careful_player.json',
    allowedPaths: ['content/'],
    changes: buildPatchProposalChangesFromReview(review),
    runsRoot: roots.runsRoot,
  });

  const proposalPath = path.join(roots.runsRoot, 'runs/v002/patch_proposal.json');
  await mkdir(path.dirname(proposalPath), { recursive: true });
  await writeFile(proposalPath, stringifyDeterministicJson(proposal), 'utf8');

  const patch: DeterministicJsonPatch = {
    schema_version: '1',
    patch_id: 'patch_v002_challenge_copy',
    proposal_id: proposal.proposal_id,
    target_version: 'v002',
    governance: {
      human_governed: true,
      human_approved: true,
      explicit_apply_required: true,
      mutates_runtime_state: false,
    },
    evidence_artifacts: proposal.evidence_artifacts,
    scope: {
      allowed_paths: ['content/'],
      forbidden_changes: proposal.scope.forbidden_changes,
    },
    rationale:
      'Reviewer evidence shows challenge labels are hard to scan; update one preset description only.',
    operations: [
      {
        op: 'set',
        target_file: 'content/challenge-modes.json',
        path: '/presets/0/description',
        value:
          'Three floors with elevated enemy pressure, tighter roster, and a clearer opening challenge label.',
      },
    ],
  };

  const patchPath = path.join(roots.runsRoot, 'runs/v002/json_patch.json');
  await writeFile(patchPath, stringifyDeterministicJson(patch), 'utf8');

  return { proposal, patch, proposalPath, patchPath };
};

describe('Phase 16D deterministic JSON patching', () => {
  it('allows only bounded JSON and Markdown surfaces', () => {
    expect(isGloballyAllowedPatchTarget('content/challenge-modes.json')).toBe(true);
    expect(isGloballyAllowedPatchTarget('src/agents/prompts/developer.md')).toBe(true);
    expect(isGloballyAllowedPatchTarget('src/game/engine.ts')).toBe(false);
    expect(isGloballyAllowedPatchTarget('src/harness/runner.ts')).toBe(false);
    expect(isGloballyAllowedPatchTarget('runs/v002/patch_plan.md')).toBe(false);
  });

  it('parses JSON pointers for nested content updates', () => {
    expect(parseJsonPointer('/presets/0/description')).toEqual(['presets', '0', 'description']);
  });

  it('dry-run produces a report without modifying target files', async () => {
    await withTempWorkspace(async (roots) => {
      const { proposal, patch } = await seedWorkspace(roots);
      const targetPath = path.join(roots.repoRoot, 'content/challenge-modes.json');
      const before = await readFile(targetPath, 'utf8');

      const report = await applyDeterministicJsonPatch(patch, {
        repoRoot: roots.repoRoot,
        runsRoot: roots.runsRoot,
        proposal,
        mode: 'dry_run',
        writeReport: true,
      });

      const after = await readFile(targetPath, 'utf8');
      expect(report.ok).toBe(true);
      expect(report.applied).toBe(false);
      expect(report.file_summaries[0]?.changed).toBe(true);
      expect(before).toBe(after);
      expect(report.file_summaries[0]?.before_sha256).not.toBe(report.file_summaries[0]?.after_sha256);
    });
  });

  it('explicit apply updates the target file and records rollback evidence', async () => {
    await withTempWorkspace(async (roots) => {
      const { proposal, patch } = await seedWorkspace(roots);
      const targetPath = path.join(roots.repoRoot, 'content/challenge-modes.json');
      const before = await readFile(targetPath, 'utf8');

      const report = await applyDeterministicJsonPatch(patch, {
        repoRoot: roots.repoRoot,
        runsRoot: roots.runsRoot,
        proposal,
        mode: 'apply',
        writeReport: true,
        writeAuditLog: true,
      });

      const after = await readFile(targetPath, 'utf8');
      expect(report.ok).toBe(true);
      expect(report.applied).toBe(true);
      expect(before).not.toBe(after);
      expect(after).toContain('clearer opening challenge label');
      expect(report.file_summaries[0]?.rollback_path).toContain('json_patch_rollback');
    });
  });

  it('blocks patches outside allowed scope and forbidden surfaces', async () => {
    await withTempWorkspace(async (roots) => {
      const { proposal, patch } = await seedWorkspace(roots);
      const blockedPatch: DeterministicJsonPatch = {
        ...patch,
        operations: [
          {
            op: 'set',
            target_file: 'src/game/types.ts',
            path: '/foo',
            value: 'bar',
          },
        ],
      };

      const validation = await collectJsonPatchDiagnostics(blockedPatch, {
        repoRoot: roots.repoRoot,
        runsRoot: roots.runsRoot,
        proposal,
        verifyEvidenceFiles: true,
        mode: 'dry_run',
      });

      expect(validation.ok).toBe(false);
      expect(
        validation.blockers.some((entry) => entry.message.includes('outside bounded')),
      ).toBe(true);

      const traversalPatch: DeterministicJsonPatch = {
        ...patch,
        operations: [
          {
            op: 'set',
            target_file: 'content/../package.json',
            path: '/scripts/test',
            value: 'echo bypassed',
          },
        ],
      };

      const traversalValidation = await collectJsonPatchDiagnostics(traversalPatch, {
        repoRoot: roots.repoRoot,
        runsRoot: roots.runsRoot,
        proposal,
        verifyEvidenceFiles: true,
        mode: 'dry_run',
      });

      expect(traversalValidation.ok).toBe(false);
      expect(
        traversalValidation.blockers.some((entry) => entry.message.includes('safe repo-relative')),
      ).toBe(true);
    });
  });

  it('blocks apply mode when human approval is missing', async () => {
    await withTempWorkspace(async (roots) => {
      const { proposal, patch } = await seedWorkspace(roots);
      const unapprovedPatch: DeterministicJsonPatch = {
        ...patch,
        governance: {
          ...patch.governance,
          human_approved: false,
        },
      };

      const validation = await collectJsonPatchDiagnostics(unapprovedPatch, {
        repoRoot: roots.repoRoot,
        runsRoot: roots.runsRoot,
        proposal,
        verifyEvidenceFiles: true,
        mode: 'apply',
      });

      expect(validation.ok).toBe(false);
      expect(
        validation.blockers.some((entry) => entry.field === 'governance.human_approved'),
      ).toBe(true);
    });
  });

  it('blocks schema-breaking JSON patches before apply', async () => {
    await withTempWorkspace(async (roots) => {
      const { proposal, patch } = await seedWorkspace(roots);
      const invalidPatch: DeterministicJsonPatch = {
        ...patch,
        operations: [
          {
            op: 'set',
            target_file: 'content/challenge-modes.json',
            path: '/presets/0/gameConfig/totalFloors',
            value: -1,
          },
        ],
      };

      await expect(
        applyDeterministicJsonPatch(invalidPatch, {
          repoRoot: roots.repoRoot,
          runsRoot: roots.runsRoot,
          proposal,
          mode: 'dry_run',
        }),
      ).rejects.toThrow(/positive integer/i);
    });
  });

  it('blocks forbidden MVP text in patch rationale or values', async () => {
    await withTempWorkspace(async (roots) => {
      const { proposal, patch } = await seedWorkspace(roots);
      const forbiddenPatch: DeterministicJsonPatch = {
        ...patch,
        rationale: 'Add real-time gameplay pressure to the challenge description.',
        operations: [
          {
            ...patch.operations[0]!,
            value: 'A real-time gameplay challenge with timing-based choices.',
          },
        ],
      };

      const validation = await collectJsonPatchDiagnostics(forbiddenPatch, {
        repoRoot: roots.repoRoot,
        runsRoot: roots.runsRoot,
        proposal,
        verifyEvidenceFiles: true,
        mode: 'dry_run',
      });

      expect(validation.ok).toBe(false);
      expect(
        validation.blockers.some((entry) => entry.message.includes('Forbidden MVP feature')),
      ).toBe(true);
    });
  });

  it('CLI apply writes Markdown changes, report, audit, and rollback evidence', async () => {
    await withTempWorkspace(async (roots) => {
      const { proposal, proposalPath, patch, patchPath } = await seedWorkspace(roots);
      const promptPath = path.join(roots.repoRoot, 'src/agents/prompts/developer.md');
      await mkdir(path.dirname(promptPath), { recursive: true });
      await writeFile(promptPath, '# Developer Prompt\n\nOriginal bounded prompt.\n', 'utf8');

      const markdownProposal = {
        ...proposal,
        scope: {
          ...proposal.scope,
          allowed_paths: ['src/agents/prompts/'],
        },
      };
      const markdownPatch: DeterministicJsonPatch = {
        ...patch,
        patch_id: 'patch_v002_prompt_copy',
        scope: {
          ...patch.scope,
          allowed_paths: ['src/agents/prompts/'],
        },
        operations: [
          {
            op: 'set',
            target_file: 'src/agents/prompts/developer.md',
            path: '/',
            value: '# Developer Prompt\n\nUpdated bounded prompt.\n',
          },
        ],
      };

      await writeFile(proposalPath, stringifyDeterministicJson(markdownProposal), 'utf8');
      await writeFile(patchPath, stringifyDeterministicJson(markdownPatch), 'utf8');

      await expect(
        runJsonPatchCli([
          '--patch',
          patchPath,
          '--proposal',
          proposalPath,
          '--repo-root',
          roots.repoRoot,
          '--runs-root',
          roots.runsRoot,
          '--apply',
          '--write-report',
          '--write-audit',
        ]),
      ).resolves.toMatchObject({ report: { applied: true, ok: true } });

      await expect(readFile(promptPath, 'utf8')).resolves.toContain('Updated bounded prompt');
      await expect(readFile(path.join(roots.runsRoot, 'runs/v002/json_patch_report.json'), 'utf8'))
        .resolves.toContain('patch_v002_prompt_copy');
      await expect(readFile(path.join(roots.runsRoot, 'runs/v002/json_patch_audit.jsonl'), 'utf8'))
        .resolves.toContain('patch_v002_prompt_copy');
      await expect(
        readFile(
          path.join(
            roots.runsRoot,
            'runs/v002/json_patch_rollback/src__agents__prompts__developer.md',
          ),
          'utf8',
        ),
      ).resolves.toContain('Original bounded prompt');
    });
  });

  it('CLI validate-only reports success for a valid patch and proposal pair', async () => {
    await withTempWorkspace(async (roots) => {
      const { proposalPath, patchPath } = await seedWorkspace(roots);
      await expect(
        runJsonPatchCli([
          '--patch',
          patchPath,
          '--proposal',
          proposalPath,
          '--repo-root',
          roots.repoRoot,
          '--runs-root',
          roots.runsRoot,
          '--validate-only',
        ]),
      ).resolves.toEqual({});
    });
  });

  it('CLI rejects structurally invalid patch documents before validation', async () => {
    await withTempWorkspace(async (roots) => {
      const { proposalPath } = await seedWorkspace(roots);
      const malformedPatchPath = path.join(roots.runsRoot, 'runs/v002/malformed_json_patch.json');
      await writeFile(malformedPatchPath, JSON.stringify({ schema_version: '1' }), 'utf8');

      await expect(
        runJsonPatchCli([
          '--patch',
          malformedPatchPath,
          '--proposal',
          proposalPath,
          '--repo-root',
          roots.repoRoot,
          '--runs-root',
          roots.runsRoot,
          '--validate-only',
        ]),
      ).rejects.toThrow(/Patch JSON is structurally invalid/);
    });
  });
});
