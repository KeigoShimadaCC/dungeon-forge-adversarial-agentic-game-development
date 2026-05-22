import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ReviewValidationError,
  savePlaythroughReview,
} from '../src/harness/artifacts.js';
import { deriveScorecardFromTrace } from '../src/harness/scorecard.js';
import {
  buildReviewMarkdownRelativePath,
  enrichPlaythroughReview,
  renderReviewMarkdown,
} from '../src/harness/review-report.js';
import {
  collectReviewValidationDiagnostics,
  isReviewStructurallyUsable,
} from '../src/harness/review-validation.js';
import {
  REVIEWER_PERSONA_IDS,
  generateDeterministicReview,
  type PlaythroughReview,
} from '../src/harness/reviewer-client.js';
import {
  getReviewerPersonaMetadata,
  listReviewerPersonaMetadata,
} from '../src/harness/reviewer-personas.js';
import { runPlaythrough } from '../src/harness/runner.js';
import type { PlaythroughTrace } from '../src/harness/types.js';

const makeMinimalStep = (): PlaythroughTrace['steps'][number] => ({
  turn: 1,
  state_summary: {
    turn: 1,
    floor: 1,
    hp: 18,
    maxHp: 20,
    terminalStatus: 'WIN',
    playerPosition: { x: 1, y: 1 },
    inventory: [],
    enemyCount: 0,
    itemCount: 0,
    npcCount: 0,
    inDialogue: false,
  },
  render: 'Floor 1 / Turn 1\n########\n#@..s..#\n########\nHP 18/20',
  available_actions: [{ id: 'wait', type: 'wait', label: 'Wait' }],
  chosen_action: { id: 'wait', type: 'wait', label: 'Wait' },
  valid: true,
  events: [{ id: 'e1', type: 'wait', message: 'You wait.', turn: 1 }],
  terminalStatus: 'WIN',
});

describe('Phase 14C reviewer persona reporting', () => {
  it('exposes persona metadata for each canonical reviewer persona', () => {
    const metadata = listReviewerPersonaMetadata();
    expect(metadata).toHaveLength(REVIEWER_PERSONA_IDS.length);
    for (const persona of REVIEWER_PERSONA_IDS) {
      const entry = getReviewerPersonaMetadata(persona);
      expect(entry.id).toBe(persona);
      expect(entry.display_name.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.emphasis.length).toBeGreaterThan(0);
    }
    const bugHunter = getReviewerPersonaMetadata('bug_hunter');
    const naive = getReviewerPersonaMetadata('naive_player');
    expect(bugHunter.emphasis).not.toEqual(naive.emphasis);
  });

  it('renders Markdown from a valid JSON review with persona, issues, and evidence', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-14c-md-'));
    try {
      const { trace, scorecard } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v014c',
        runsRoot,
      });

      const review = generateDeterministicReview({
        trace,
        scorecard,
        persona: 'careful_player',
      });
      const enriched = enrichPlaythroughReview(review, {
        trace_path: 'runs/v014c/traces/seed_001_stairs-seeking.json',
        scorecard_path: 'runs/v014c/scorecards/seed_001_stairs-seeking.json',
        scorecard_result: scorecard.result,
        scorecard_turns: scorecard.turns,
      });

      const markdown = renderReviewMarkdown(enriched);

      expect(markdown).toContain('# Playthrough Review');
      expect(markdown).toContain('## Persona');
      expect(markdown).toContain('Careful Player');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain(`**Result:** \`${scorecard.result}\``);
      expect(markdown).toContain(review.summary);
      expect(markdown).toContain('## Top issues');
      expect(markdown).toContain('**Evidence:**');
      expect(markdown).toContain('## Suggested next changes');
      expect(markdown).toContain('runs/v014c/traces/seed_001_stairs-seeking.json');
      expect(markdown).toContain('runs/v014c/scorecards/seed_001_stairs-seeking.json');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('shows persona differences explicitly in Markdown reports', () => {
    const trace: PlaythroughTrace = {
      version: 'v001',
      seed: 'seed_persona_diff',
      persona: 'stairs-seeking',
      result: 'WIN',
      turns: 1,
      steps: [makeMinimalStep()],
    };
    const scorecard = deriveScorecardFromTrace(
      trace,
      'runs/v001/traces/seed_persona_diff_stairs-seeking.json',
    );

    const carefulMd = renderReviewMarkdown(
      enrichPlaythroughReview(
        generateDeterministicReview({ trace, scorecard, persona: 'careful_player' }),
      ),
    );
    const bugMd = renderReviewMarkdown(
      enrichPlaythroughReview(
        generateDeterministicReview({ trace, scorecard, persona: 'bug_hunter' }),
      ),
    );

    expect(carefulMd).toContain('Careful Player');
    expect(bugMd).toContain('Bug Hunter');
    expect(carefulMd).not.toContain('Bug Hunter');
    expect(bugMd).not.toContain('Careful Player');
  });

  it('saves JSON and Markdown together with persona_metadata on JSON', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-14c-save-'));
    try {
      const trace: PlaythroughTrace = {
        version: 'v014c',
        seed: 'seed_save',
        persona: 'naive_player',
        result: 'WIN',
        turns: 1,
        steps: [makeMinimalStep()],
      };
      const scorecard = deriveScorecardFromTrace(
        trace,
        'runs/v014c/traces/seed_save_naive_player.json',
      );
      const review = {
        ...generateDeterministicReview({
          trace,
          scorecard,
          persona: 'naive_player',
        }),
        scorecard_result: scorecard.result,
        scorecard_turns: scorecard.turns,
      };

      const { reviewPath, reviewMarkdownPath } = await savePlaythroughReview(runsRoot, review);
      const savedJson = JSON.parse(await readFile(reviewPath, 'utf8')) as PlaythroughReview;
      const savedMd = await readFile(reviewMarkdownPath, 'utf8');

      expect(buildReviewMarkdownRelativePath('v014c', 'seed_save', 'naive_player')).toBe(
        'runs/v014c/reviews/seed_save_naive_player.md',
      );
      expect(savedJson.persona_metadata?.display_name).toBe('Naive Player');
      expect(savedJson.review_markdown_path).toBe('runs/v014c/reviews/seed_save_naive_player.md');
      expect(savedMd).toContain('Naive Player');
      expect(savedMd).toContain(`**Result:** \`${scorecard.result}\``);
      expect(savedMd).toContain(savedJson.summary);
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('rejects malformed review JSON with diagnostics and does not write artifacts', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-14c-invalid-'));
    const targetJson = path.join(
      runsRoot,
      'runs/v014c/reviews/seed_bad_careful_player.json',
    );
    const targetMd = path.join(
      runsRoot,
      'runs/v014c/reviews/seed_bad_careful_player.md',
    );

    try {
      const malformed = {
        version: 'v014c',
        seed: 'seed_bad',
        persona: 'careful_player',
        summary: 'Broken review',
        scores: { fun: 99, clarity: 2, fairness: 2, tactical_depth: 2, replay_value: 2 },
        top_issues: [
          {
            severity: 'not_a_level',
            observation: 'x',
            diagnosis: 'y',
            recommendation: 'z',
            evidence: [],
          },
        ],
        suggested_next_changes: ['a', 'b', 'c', 'd'],
        evidence_quality: 'full',
      };

      const diagnostics = collectReviewValidationDiagnostics(malformed);
      expect(diagnostics.ok).toBe(false);
      expect(diagnostics.blockers.length).toBeGreaterThan(0);
      expect(isReviewStructurallyUsable(malformed as PlaythroughReview)).toBe(false);
      expect(
        collectReviewValidationDiagnostics({
          ...malformed,
          evidence_quality: undefined,
        }).blockers.some((entry) => entry.field === 'evidence_quality'),
      ).toBe(true);

      await expect(
        savePlaythroughReview(runsRoot, malformed as PlaythroughReview),
      ).rejects.toBeInstanceOf(ReviewValidationError);

      await expect(readFile(targetJson, 'utf8')).rejects.toThrow();
      await expect(readFile(targetMd, 'utf8')).rejects.toThrow();
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });
});
