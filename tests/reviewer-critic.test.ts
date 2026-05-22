import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildReviewRelativePath,
  savePlaythroughReview,
} from '../src/harness/artifacts.js';
import { deriveScorecardFromTrace } from '../src/harness/scorecard.js';
import {
  REVIEWER_PERSONA_IDS,
  ReviewGenerationError,
  createReviewerCritic,
  generateDeterministicReview,
  isReviewerPersona,
} from '../src/harness/reviewer-client.js';
import { runPlaythrough } from '../src/harness/runner.js';
import type { PlaythroughScorecard, PlaythroughTrace } from '../src/harness/types.js';

const NULL_REVIEWER_SCORES = {
  fun: null,
  clarity: null,
  fairness: null,
  tactical_depth: null,
  replay_value: null,
};

const makeMinimalStep = (
  overrides: Partial<PlaythroughTrace['steps'][number]> = {},
): PlaythroughTrace['steps'][number] => ({
  turn: 1,
  state_summary: {
    turn: 1,
    floor: 1,
    hp: 18,
    maxHp: 20,
    terminalStatus: 'ACTIVE',
    playerPosition: { x: 1, y: 1 },
    inventory: [],
    enemyCount: 1,
    itemCount: 0,
  },
  render: 'Floor 1 / Turn 1\n########\n#@..s..#\n########\nHP 18/20',
  available_actions: [{ id: 'wait', type: 'wait', label: 'Wait' }],
  chosen_action: { id: 'wait', type: 'wait', label: 'Wait' },
  valid: true,
  events: [{ id: 'e1', type: 'wait', message: 'You wait.', turn: 1 }],
  terminalStatus: 'ACTIVE',
  ...overrides,
});

describe('Phase 06B reviewer critic', () => {
  it('generates a structured review from a real playthrough trace and scorecard', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-review-'));
    try {
      const { trace, scorecard } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot,
      });

      const review = generateDeterministicReview({
        trace,
        scorecard,
        persona: 'careful_player',
      });

      expect(review.version).toBe(trace.version);
      expect(review.seed).toBe(trace.seed);
      expect(review.persona).toBe('careful_player');
      expect(review.summary.length).toBeGreaterThan(0);
      expect(review.scores).toMatchObject({
        fun: expect.any(Number),
        clarity: expect.any(Number),
        fairness: expect.any(Number),
        tactical_depth: expect.any(Number),
        replay_value: expect.any(Number),
      });
      expect(review.top_issues.length).toBeGreaterThan(0);
      expect(review.suggested_next_changes.length).toBeGreaterThan(0);
      expect(review.suggested_next_changes.length).toBeLessThanOrEqual(3);
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('keeps observation, diagnosis, recommendation, and severity distinct per issue', () => {
    const trace: PlaythroughTrace = {
      version: 'v001',
      seed: 'seed_test',
      persona: 'stairs-seeking',
      result: 'ABORTED',
      turns: 2,
      steps: [
        makeMinimalStep({
          turn: 1,
          valid: false,
          terminalStatus: 'ABORTED',
          chosen_action: {
            id: 'bad_move',
            type: 'move',
            label: 'Bad move',
            payload: { dx: 99, dy: 99 },
          },
        }),
        makeMinimalStep({
          turn: 2,
          valid: false,
          terminalStatus: 'ABORTED',
          events: [{ id: 'e2', type: 'aborted', message: 'Invalid state', turn: 2 }],
        }),
      ],
    };

    const scorecard: PlaythroughScorecard = {
      version: 'v001',
      seed: 'seed_test',
      persona: 'stairs-seeking',
      result: 'ABORTED',
      turns: 2,
      floors_reached: 1,
      damage_taken: 0,
      items_used: 0,
      enemies_defeated: 0,
      invalid_actions: 2,
      softlocks: 0,
      reviewer_scores: NULL_REVIEWER_SCORES,
      trace_path: 'runs/v001/traces/seed_test__stairs-seeking.json',
    };

    const review = generateDeterministicReview({
      trace,
      scorecard,
      persona: 'bug_hunter',
    });

    const invalidIssue = review.top_issues.find((issue) =>
      issue.observation.includes('invalid'),
    );
    expect(invalidIssue).toBeDefined();
    expect(invalidIssue?.severity).toBe('critical');
    expect(invalidIssue?.observation).not.toBe(invalidIssue?.diagnosis);
    expect(invalidIssue?.diagnosis).not.toBe(invalidIssue?.recommendation);
    expect(invalidIssue?.evidence.length).toBeGreaterThan(0);
  });

  it('cites concrete trace evidence for result, invalid action, event, render, turn, and scorecard facts', () => {
    const trace: PlaythroughTrace = {
      version: 'v001',
      seed: 'seed_evidence',
      persona: 'bug-hunter-policy',
      result: 'ABORTED',
      turns: 3,
      steps: [
        makeMinimalStep({
          turn: 1,
          render: 'x',
          valid: false,
          chosen_action: {
            id: 'bad_move',
            type: 'move',
            label: 'Bad move',
            payload: { dx: 99, dy: 99 },
          },
          events: [
            {
              id: 'e-invalid',
              type: 'harness_invalid_action',
              message: 'Policy chose invalid action.',
              turn: 1,
            },
          ],
          terminalStatus: 'ABORTED',
        }),
        makeMinimalStep({
          turn: 2,
          events: [{ id: 'e-abort', type: 'aborted', message: 'Invalid state.', turn: 2 }],
          terminalStatus: 'ABORTED',
        }),
      ],
    };

    const scorecard: PlaythroughScorecard = {
      version: 'v001',
      seed: 'seed_evidence',
      persona: 'bug-hunter-policy',
      result: 'ABORTED',
      turns: 3,
      floors_reached: 1,
      damage_taken: 0,
      items_used: 0,
      enemies_defeated: 0,
      invalid_actions: 1,
      softlocks: 1,
      reviewer_scores: NULL_REVIEWER_SCORES,
      trace_path: 'runs/v001/traces/seed_evidence__bug-hunter-policy.json',
    };

    const review = generateDeterministicReview({
      trace,
      scorecard,
      persona: 'bug_hunter',
      keyRenderedStates: ['x'],
    });

    const evidence = review.top_issues.flatMap((issue) => issue.evidence);
    const kinds = new Set(evidence.map((entry) => entry.kind));

    expect([...kinds]).toEqual(
      expect.arrayContaining(['result', 'invalid', 'event', 'turn', 'scorecard']),
    );
    expect(evidence.some((entry) => entry.turn === 1 || entry.turn === 2)).toBe(true);
    expect(evidence.some((entry) => entry.detail.includes('ABORTED'))).toBe(true);

    const renderTrace: PlaythroughTrace = {
      version: 'v001',
      seed: 'seed_render',
      persona: 'stairs-seeking',
      result: 'WIN',
      turns: 1,
      steps: [makeMinimalStep({ render: 'x', terminalStatus: 'WIN' })],
    };
    const renderScorecard = deriveScorecardFromTrace(
      renderTrace,
      'runs/v001/traces/seed_render__stairs-seeking.json',
    );
    const renderReview = generateDeterministicReview({
      trace: renderTrace,
      scorecard: renderScorecard,
      persona: 'careful_player',
      keyRenderedStates: ['x'],
    });

    expect(
      renderReview.top_issues
        .flatMap((issue) => issue.evidence)
        .some((entry) => entry.kind === 'render' && entry.quote === 'x'),
    ).toBe(true);
  });

  it('bounds suggested_next_changes to at most three items', () => {
    const trace: PlaythroughTrace = {
      version: 'v001',
      seed: 'seed_sparse',
      persona: 'random',
      result: 'LOSS',
      turns: 4,
      steps: [
        makeMinimalStep({ turn: 1, render: 'x' }),
        makeMinimalStep({
          turn: 2,
          render: '',
          state_summary: {
            turn: 2,
            floor: 1,
            hp: 0,
            maxHp: 20,
            terminalStatus: 'LOSS',
            playerPosition: { x: 2, y: 2 },
            inventory: [],
            enemyCount: 0,
            itemCount: 0,
          },
          terminalStatus: 'LOSS',
          events: [{ id: 'e3', type: 'enemy_attack', message: 'Slime hits.', turn: 2 }],
        }),
      ],
    };

    const scorecard: PlaythroughScorecard = {
      version: 'v001',
      seed: 'seed_sparse',
      persona: 'random',
      result: 'LOSS',
      turns: 4,
      floors_reached: 1,
      damage_taken: 4,
      items_used: 0,
      enemies_defeated: 0,
      invalid_actions: 1,
      softlocks: 2,
      reviewer_scores: NULL_REVIEWER_SCORES,
      trace_path: 'runs/v001/traces/seed_sparse__random.json',
    };

    const review = generateDeterministicReview({
      trace,
      scorecard,
      persona: 'naive_player',
      keyRenderedStates: [''],
    });

    expect(review.suggested_next_changes.length).toBeLessThanOrEqual(3);
    for (const change of review.suggested_next_changes) {
      expect(change.toLowerCase()).not.toMatch(/real-time|image-only|infinite|free-text/);
    }
  });

  it('saves review JSON under runs/<version>/reviews/<seed>__<persona>.json', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-review-save-'));
    try {
      const { trace, scorecard, artifacts } = await runPlaythrough({
        seed: 'seed_002',
        policyId: 'stairs-seeking',
        version: 'v006b',
        runsRoot,
      });

      const review = generateDeterministicReview({
        trace,
        scorecard: { ...scorecard, trace_path: artifacts.tracePath },
        persona: 'careful_player',
      });

      expect(buildReviewRelativePath('v006b', 'seed_002', 'careful_player')).toBe(
        'runs/v006b/reviews/seed_002__careful_player.json',
      );

      const { reviewPath } = await savePlaythroughReview(runsRoot, review);
      const saved = JSON.parse(await readFile(reviewPath, 'utf8'));

      expect(reviewPath.endsWith('runs/v006b/reviews/seed_002__careful_player.json')).toBe(true);
      expect(saved).toEqual(review);
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('handles missing or thin trace/render data with a bounded review', () => {
    const trace: PlaythroughTrace = {
      version: 'v001',
      seed: 'seed_thin',
      persona: 'random',
      result: 'WIN',
      turns: 0,
      steps: [],
    };

    const scorecard: PlaythroughScorecard = {
      version: 'v001',
      seed: 'seed_thin',
      persona: 'random',
      result: 'WIN',
      turns: 0,
      floors_reached: 0,
      damage_taken: 0,
      items_used: 0,
      enemies_defeated: 0,
      invalid_actions: 0,
      softlocks: 0,
      reviewer_scores: NULL_REVIEWER_SCORES,
      trace_path: 'runs/v001/traces/seed_thin__random.json',
    };

    const review = generateDeterministicReview({
      trace,
      scorecard,
      persona: 'careful_player',
    });

    expect(review.evidence_quality).toBe('minimal');
    expect(review.top_issues.some((issue) => issue.observation.includes('thin'))).toBe(true);
    expect(review.suggested_next_changes.length).toBeGreaterThan(0);
  });

  it('rejects structurally unusable trace or scorecard input', () => {
    const validTrace: PlaythroughTrace = {
      version: 'v001',
      seed: 'seed_ok',
      persona: 'random',
      result: 'WIN',
      turns: 1,
      steps: [makeMinimalStep()],
    };

    const validScorecard = deriveScorecardFromTrace(
      validTrace,
      'runs/v001/traces/seed_ok__random.json',
    );

    expect(() =>
      generateDeterministicReview({
        trace: { ...validTrace, result: 'BROKEN' as PlaythroughTrace['result'] },
        scorecard: validScorecard,
        persona: 'careful_player',
      }),
    ).toThrow(ReviewGenerationError);

    expect(() =>
      generateDeterministicReview({
        trace: validTrace,
        scorecard: { ...validScorecard, seed: '' },
        persona: 'careful_player',
      }),
    ).toThrow(ReviewGenerationError);
  });

  it('does not read API credentials and supports mock providers', () => {
    const trace: PlaythroughTrace = {
      version: 'v001',
      seed: 'seed_mock',
      persona: 'random',
      result: 'WIN',
      turns: 1,
      steps: [makeMinimalStep({ terminalStatus: 'WIN' })],
    };

    const scorecard = deriveScorecardFromTrace(
      trace,
      'runs/v001/traces/seed_mock__random.json',
    );

    let providerCalled = false;
    const mockProvider = () => {
      providerCalled = true;
      return {
      version: 'v001',
      seed: 'seed_mock',
      persona: 'naive_player' as const,
      summary: 'Mocked summary from injected provider.',
      scores: {
        fun: 8,
        clarity: 8,
        fairness: 8,
        tactical_depth: 8,
        replay_value: 8,
      },
      top_issues: [],
      suggested_next_changes: ['Mock change'],
      evidence_quality: 'full' as const,
      };
    };

    const critic = createReviewerCritic(mockProvider);
    const review = critic.generateReview({
      trace,
      scorecard,
      persona: 'naive_player',
    });

    expect(review.summary).toBe('Mocked summary from injected provider.');
    expect(providerCalled).toBe(true);
  });

  it.each(REVIEWER_PERSONA_IDS)('accepts reviewer persona %s', (persona) => {
    expect(isReviewerPersona(persona)).toBe(true);

    const trace: PlaythroughTrace = {
      version: 'v001',
      seed: 'seed_persona',
      persona: 'stairs-seeking',
      result: 'WIN',
      turns: 3,
      steps: [makeMinimalStep({ terminalStatus: 'WIN' })],
    };

    const scorecard = deriveScorecardFromTrace(
      trace,
      'runs/v001/traces/seed_persona__stairs-seeking.json',
    );

    const review = generateDeterministicReview({ trace, scorecard, persona });
    expect(review.persona).toBe(persona);
  });
});
