import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateDeveloperTask } from '../src/harness/developer-workflow.js';
import { runPatchProposalCli } from '../src/harness/patch-proposal-cli.js';
import {
  assembleStructuredPatchProposal,
  buildPatchProposalChangesFromReview,
  collectPatchProposalDiagnostics,
  developerTaskInputFromPatchProposal,
  validatePatchProposalReviewContext,
  validatePatchProposalForDeveloperTask,
} from '../src/harness/structured-patch-proposal.js';
import type { PlaythroughReview } from '../src/harness/reviewer-client.js';
import type { PlaythroughScorecard } from '../src/harness/types.js';
import { runVersion } from '../src/harness/version-loop.js';

const withTempRunsRoot = async (fn: (runsRoot: string) => Promise<void>): Promise<void> => {
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-patch-proposal-'));
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
  suggested_next_changes: ['Add one panic item.', 'Improve the ASCII legend.'],
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

const writeEvidenceBundle = async (
  runsRoot: string,
  review: PlaythroughReview,
  scorecard: PlaythroughScorecard,
): Promise<void> => {
  const tracePath = path.join(runsRoot, review.trace_path!);
  const reviewPath = path.join(runsRoot, 'runs/v001/reviews/seed_001_careful_player.json');
  const scorecardPath = path.join(runsRoot, 'runs/v001/scorecards/seed_001_careful_player.json');
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
};

describe('Phase 15A structured patch proposals', () => {
  it('assembles a valid proposal with trace, review, and scorecard evidence', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const review = makeReview();
      const scorecard = makeScorecard();
      await writeEvidenceBundle(runsRoot, review, scorecard);

      const proposal = assembleStructuredPatchProposal({
        review,
        scorecard,
        baseVersion: 'v001',
        targetVersion: 'v002',
        targetScope: 'Bounded tactical improvement from v001 review evidence.',
        tracePath: review.trace_path!,
        reviewPath: 'runs/v001/reviews/seed_001_careful_player.json',
        scorecardPath: 'runs/v001/scorecards/seed_001_careful_player.json',
        allowedPaths: ['src/game/', 'content/'],
        changes: buildPatchProposalChangesFromReview(review),
        runsRoot,
      });

      const validation = await collectPatchProposalDiagnostics(proposal, {
        runsRoot,
        verifyEvidenceFiles: true,
      });

      expect(validation.ok).toBe(true);
      expect(proposal.governance.autonomous_patch_execution).toBe(false);
      expect(proposal.changes).toHaveLength(1);
      expect(proposal.changes[0]?.evidence.length).toBeGreaterThan(0);
      expect(proposal.scope.protocol_invariants.length).toBeGreaterThan(0);
    });
  });

  it('blocks proposals with missing required evidence files', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const review = makeReview();
      const scorecard = makeScorecard();
      const proposal = assembleStructuredPatchProposal({
        review,
        scorecard,
        baseVersion: 'v001',
        targetVersion: 'v002',
        targetScope: 'Missing evidence should block acceptance.',
        tracePath: 'runs/v001/traces/missing_trace.json',
        reviewPath: 'runs/v001/reviews/missing_review.json',
        scorecardPath: 'runs/v001/scorecards/missing_scorecard.json',
        allowedPaths: ['src/game/'],
        changes: buildPatchProposalChangesFromReview(review),
        runsRoot,
      });

      const validation = await collectPatchProposalDiagnostics(proposal, {
        runsRoot,
        verifyEvidenceFiles: true,
      });

      expect(validation.ok).toBe(false);
      expect(validation.blockers.some((entry) => entry.message.includes('Missing required'))).toBe(
        true,
      );
    });
  });

  it('flags forbidden MVP features and protocol-breaking proposed changes', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const review = makeReview();
      const scorecard = makeScorecard();
      await writeEvidenceBundle(runsRoot, review, scorecard);

      const proposal = assembleStructuredPatchProposal({
        review,
        scorecard,
        baseVersion: 'v001',
        targetVersion: 'v002',
        targetScope: 'Forbidden feature probe.',
        tracePath: review.trace_path!,
        reviewPath: 'runs/v001/reviews/seed_001_careful_player.json',
        scorecardPath: 'runs/v001/scorecards/seed_001_careful_player.json',
        allowedPaths: ['src/game/'],
        changes: [
          {
            change_id: 'forbidden_1',
            title: 'Add real-time combat timing input',
            description: 'Replace turn-based play with timing-sensitive real-time combat.',
            addresses_issue_indices: [],
            evidence: [{ kind: 'review', detail: 'Synthetic forbidden probe.' }],
          },
        ],
        runsRoot,
      });

      const validation = await collectPatchProposalDiagnostics(proposal, { runsRoot });
      expect(validation.ok).toBe(false);
      expect(
        validation.blockers.some((entry) => entry.message.includes('Forbidden MVP feature')),
      ).toBe(true);
      expect(validation.diagnostics.some((entry) => entry.category === 'forbidden')).toBe(true);
    });
  });

  it('rejects incomplete proposals without per-change evidence', async () => {
    const review = makeReview();
    const scorecard = makeScorecard();
    const proposal = assembleStructuredPatchProposal({
      review,
      scorecard,
      baseVersion: 'v001',
      targetVersion: 'v002',
      targetScope: 'Incomplete change evidence.',
      tracePath: review.trace_path!,
      reviewPath: 'runs/v001/reviews/seed_001_careful_player.json',
      scorecardPath: 'runs/v001/scorecards/seed_001_careful_player.json',
      allowedPaths: ['src/game/'],
      changes: [
        {
          change_id: 'empty_evidence',
          title: 'Change without evidence',
          description: 'This change forgot to cite trace or review facts.',
          addresses_issue_indices: [],
          evidence: [],
        },
      ],
    });

    const validation = await collectPatchProposalDiagnostics(proposal, {
      verifyEvidenceFiles: false,
    });
    expect(validation.ok).toBe(false);
    expect(
      validation.blockers.some((entry) => entry.message.includes('cannot claim scope')),
    ).toBe(true);
  });

  it('rejects evidence entries with unsupported kinds or empty details', async () => {
    const review = makeReview();
    const scorecard = makeScorecard();
    const proposal = assembleStructuredPatchProposal({
      review,
      scorecard,
      baseVersion: 'v001',
      targetVersion: 'v002',
      targetScope: 'Malformed evidence entries.',
      tracePath: review.trace_path!,
      reviewPath: 'runs/v001/reviews/seed_001_careful_player.json',
      scorecardPath: 'runs/v001/scorecards/seed_001_careful_player.json',
      allowedPaths: ['src/game/'],
      changes: [
        {
          change_id: 'bad_evidence',
          title: 'Malformed evidence',
          description: 'This change includes unusable evidence entries.',
          addresses_issue_indices: [],
          evidence: [
            { kind: 'unknown', detail: 'unsupported kind' },
            { kind: 'review', detail: '   ' },
          ] as never,
        },
      ],
    });

    const validation = await collectPatchProposalDiagnostics(proposal, {
      verifyEvidenceFiles: false,
    });
    expect(validation.ok).toBe(false);
    expect(
      validation.blockers.some((entry) => entry.message.includes('is not supported')),
    ).toBe(true);
    expect(
      validation.blockers.some((entry) => entry.message.includes('non-empty string')),
    ).toBe(true);
  });

  it('reports review and scorecard context mismatches before proposal assembly', () => {
    const review = makeReview();
    const mismatchedScorecard = { ...makeScorecard(), version: 'v002' };

    const diagnostics = validatePatchProposalReviewContext(review, mismatchedScorecard);

    expect(diagnostics.some((entry) => entry.field === 'version')).toBe(true);
    expect(diagnostics.some((entry) => entry.category === 'blocker')).toBe(true);
  });

  it('feeds a valid proposal into the developer-task workflow', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const review = makeReview();
      const scorecard = makeScorecard();
      await writeEvidenceBundle(runsRoot, review, scorecard);

      const proposal = assembleStructuredPatchProposal({
        review,
        scorecard,
        baseVersion: 'v001',
        targetVersion: 'v002',
        targetScope: 'Developer-task consumption check.',
        tracePath: review.trace_path!,
        reviewPath: 'runs/v001/reviews/seed_001_careful_player.json',
        scorecardPath: 'runs/v001/scorecards/seed_001_careful_player.json',
        allowedPaths: ['src/game/version-profiles.ts', 'src/game/render.ts'],
        changes: buildPatchProposalChangesFromReview(review),
        runsRoot,
      });

      const combined = await validatePatchProposalForDeveloperTask(
        { proposal, review, scorecard, runsRoot },
        { runsRoot, verifyEvidenceFiles: true },
      );

      expect(combined.proposalValidation.ok).toBe(true);
      expect(combined.developerTaskValidation.ok).toBe(true);

      const task = generateDeveloperTask(
        developerTaskInputFromPatchProposal({ proposal, review, scorecard, runsRoot }),
        { repoRoot: runsRoot },
      );

      expect(task.target_version).toBe('v002');
      expect(task.proposed_changes.length).toBeGreaterThan(0);
      expect(task.governance.autonomous_patch_execution).toBe(false);
    });
  });

  it('writes patch_proposal.json through the CLI without mutating source files', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runVersion(runsRoot, 'v001');
      const reviewPath = path.join(
        runsRoot,
        'runs/v001/reviews/seed_001_careful_player.json',
      );
      const scorecardPath = path.join(
        runsRoot,
        'runs/v001/scorecards/seed_001_careful_player.json',
      );

      const result = await runPatchProposalCli([
        '--runs-root',
        runsRoot,
        '--review',
        reviewPath,
        '--scorecard',
        scorecardPath,
        '--base-version',
        'v001',
        '--target-version',
        'v002',
        '--scope',
        'CLI-assembled proposal from seeded playthrough evidence.',
        '--allowed-path',
        'src/game/',
        '--allowed-path',
        'content/',
        '--write',
      ]);

      expect(result.outputPath).toBe(path.join(runsRoot, 'runs/v002/patch_proposal.json'));
      const written = JSON.parse(await readFile(result.outputPath!, 'utf8')) as {
        schema_version: string;
        changes: unknown[];
      };
      expect(written.schema_version).toBe('1');
      expect(written.changes.length).toBeGreaterThan(0);
    });
  });

  it('validate-only exits non-zero when required evidence files are missing', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const review = makeReview();
      const scorecard = makeScorecard();
      const reviewPath = path.join(runsRoot, 'runs/v001/reviews/seed_001_careful_player.json');
      const scorecardPath = path.join(runsRoot, 'runs/v001/scorecards/seed_001_careful_player.json');
      await mkdir(path.dirname(reviewPath), { recursive: true });
      await mkdir(path.dirname(scorecardPath), { recursive: true });
      await writeFile(reviewPath, JSON.stringify(review), 'utf8');
      await writeFile(scorecardPath, JSON.stringify(scorecard), 'utf8');

      const result = await runPatchProposalCli([
        '--runs-root',
        runsRoot,
        '--review',
        reviewPath,
        '--scorecard',
        scorecardPath,
        '--base-version',
        'v001',
        '--target-version',
        'v002',
        '--scope',
        'Missing trace evidence should block acceptance.',
        '--allowed-path',
        'src/game/',
        '--validate-only',
      ]);

      expect(result.validation?.ok).toBe(false);
      expect(
        result.validation?.blockers.some((entry) =>
          entry.message.includes('Missing required trace evidence'),
        ),
      ).toBe(true);
    });
  });
});
