import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CANONICAL_REGRESSION_SEEDS } from '../src/harness/baseline-players/helpers.js';
import {
  buildReviewRelativePath,
  buildScorecardRelativePath,
  buildTraceRelativePath,
  savePlaythroughArtifacts,
} from '../src/harness/artifacts.js';
import { stringifyDeterministicJson } from '../src/harness/json.js';
import { generateDeterministicReview } from '../src/harness/reviewer-client.js';
import { runPlaythrough } from '../src/harness/runner.js';
import {
  deriveScorecardFromTrace,
  validateScorecard,
} from '../src/harness/scorecard.js';
import type {
  HarnessPlayerPolicy,
  PlaythroughScorecard,
  PlaythroughTrace,
} from '../src/harness/types.js';

const TRACE_TOP_LEVEL_FIELDS = [
  'version',
  'seed',
  'persona',
  'result',
  'turns',
  'steps',
] as const;

const TRACE_STEP_FIELDS = [
  'turn',
  'state_summary',
  'render',
  'available_actions',
  'chosen_action',
  'valid',
  'events',
  'terminalStatus',
] as const;

const STATE_SUMMARY_FIELDS = [
  'turn',
  'floor',
  'hp',
  'maxHp',
  'terminalStatus',
  'playerPosition',
  'inventory',
  'enemyCount',
  'itemCount',
] as const;

const SCORECARD_FIELDS = [
  'version',
  'seed',
  'persona',
  'result',
  'turns',
  'floors_reached',
  'damage_taken',
  'items_used',
  'enemies_defeated',
  'invalid_actions',
  'softlocks',
  'reviewer_scores',
  'trace_path',
] as const;

const NULL_REVIEWER_SCORES = {
  fun: null,
  clarity: null,
  fairness: null,
  tactical_depth: null,
  replay_value: null,
};

const assertTraceShape = (trace: PlaythroughTrace): void => {
  for (const field of TRACE_TOP_LEVEL_FIELDS) {
    expect(trace).toHaveProperty(field);
  }

  expect(trace.steps.length).toBeGreaterThan(0);

  for (const step of trace.steps) {
    for (const field of TRACE_STEP_FIELDS) {
      expect(step).toHaveProperty(field);
    }
    for (const field of STATE_SUMMARY_FIELDS) {
      expect(step.state_summary).toHaveProperty(field);
    }
    expect(typeof step.render).toBe('string');
    expect(step.render.length).toBeGreaterThan(0);
    expect(Array.isArray(step.available_actions)).toBe(true);
    expect(step.chosen_action).toMatchObject({
      id: expect.any(String),
      type: expect.any(String),
      label: expect.any(String),
    });
    expect(Array.isArray(step.events)).toBe(true);
    for (const event of step.events) {
      expect(event).toMatchObject({
        id: expect.any(String),
        type: expect.any(String),
        message: expect.any(String),
        turn: expect.any(Number),
      });
    }
    expect(['ACTIVE', 'WIN', 'LOSS', 'ABORTED']).toContain(step.terminalStatus);
  }

  expect(['WIN', 'LOSS', 'ABORTED']).toContain(trace.result);
  expect(trace.steps.at(-1)?.terminalStatus).toBe(trace.result);
};

describe('Phase 05A harness', () => {
  it('saves trace and scorecard files for a seeded playthrough', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
    try {
      const { trace, scorecard, artifacts } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot,
      });

      const traceContents = await readFile(artifacts.tracePath, 'utf8');
      const scorecardContents = await readFile(artifacts.scorecardPath, 'utf8');

      expect(traceContents.length).toBeGreaterThan(0);
      expect(scorecardContents.length).toBeGreaterThan(0);
      expect(JSON.parse(traceContents)).toEqual(trace);
      expect(JSON.parse(scorecardContents)).toEqual(scorecard);
      assertTraceShape(trace);
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('produces reproducible trace JSON for a fixed seed and policy', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
    try {
      const first = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot: path.join(runsRoot, 'a'),
      });
      const second = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot: path.join(runsRoot, 'b'),
      });

      expect(stringifyDeterministicJson(first.trace)).toBe(
        stringifyDeterministicJson(second.trace),
      );
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('records terminal status and invalid action metrics', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
    const invalidPolicy: HarnessPlayerPolicy = () => ({
      action: {
        id: 'invalid_action',
        type: 'move',
        label: 'Invalid move',
        payload: { dx: 99, dy: 99 },
      },
    });

    try {
      const { trace, scorecard } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot,
        policy: invalidPolicy,
      });

      expect(trace.result).toBe('ABORTED');
      expect(trace.steps.at(-1)?.valid).toBe(false);
      expect(scorecard.invalid_actions).toBeGreaterThan(0);
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('generates trace-only scorecards with canonical Phase 06C fields and null reviewer scores', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
    try {
      const { trace, scorecard } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot,
      });

      for (const field of SCORECARD_FIELDS) {
        expect(scorecard).toHaveProperty(field);
      }
      expect(scorecard).toMatchObject({
        version: trace.version,
        seed: trace.seed,
        persona: trace.persona,
        result: trace.result,
        turns: trace.turns,
        reviewer_scores: NULL_REVIEWER_SCORES,
        trace_path: buildTraceRelativePath(trace.version, trace.seed, trace.persona),
      });
      validateScorecard(scorecard);
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('merges mocked review scores without changing objective metrics', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
    try {
      const { trace } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot,
      });
      const tracePath = buildTraceRelativePath(trace.version, trace.seed, trace.persona);
      const traceOnly = deriveScorecardFromTrace(trace, tracePath);
      const reviewed = deriveScorecardFromTrace(trace, tracePath, {
        scores: {
          fun: 4,
          clarity: 5,
          fairness: 3,
          tactical_depth: 2,
          replay_value: 4,
        },
        review_path: 'runs/v001-test/reviews/seed_001_stairs-seeking.json',
        review_id: 'mock-review-001',
      });

      const objectiveFields = SCORECARD_FIELDS.filter((field) => field !== 'reviewer_scores');
      for (const field of objectiveFields) {
        expect(reviewed[field]).toEqual(traceOnly[field]);
      }
      expect(reviewed.reviewer_scores).toEqual({
        fun: 4,
        clarity: 5,
        fairness: 3,
        tactical_depth: 2,
        replay_value: 4,
      });
      expect(reviewed.review_path).toBe('runs/v001-test/reviews/seed_001_stairs-seeking.json');
      expect(reviewed.review_id).toBe('mock-review-001');
      validateScorecard(reviewed);
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('merges Phase 06B reviewer output into scorecards with review linkage', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
    try {
      const { trace } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot,
      });
      const tracePath = buildTraceRelativePath(trace.version, trace.seed, trace.persona);
      const traceOnly = deriveScorecardFromTrace(trace, tracePath);
      const review = generateDeterministicReview({
        trace,
        scorecard: traceOnly,
        persona: 'careful_player',
      });
      const reviewPath = buildReviewRelativePath(review.version, review.seed, review.persona);

      const reviewed = deriveScorecardFromTrace(trace, tracePath, {
        ...review,
        review_path: reviewPath,
        review_id: `${review.persona}:${review.seed}`,
      });

      expect(reviewed.reviewer_scores).toEqual(review.scores);
      expect(reviewed.review_path).toBe(reviewPath);
      expect(reviewed.review_id).toBe('careful_player:seed_001');
      validateScorecard(reviewed);
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('normalizes partial mocked reviewer scores to null', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
    try {
      const { trace } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot,
      });
      const scorecard = deriveScorecardFromTrace(
        trace,
        buildTraceRelativePath(trace.version, trace.seed, trace.persona),
        {
          scores: {
            clarity: 5,
          },
        },
      );

      expect(scorecard.reviewer_scores).toEqual({
        ...NULL_REVIEWER_SCORES,
        clarity: 5,
      });
      validateScorecard(scorecard);
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('fails validation when an objective scorecard field is missing', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
    try {
      const { scorecard } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot,
      });
      const incomplete = { ...scorecard };
      delete (incomplete as Partial<PlaythroughScorecard>).floors_reached;

      expect(() => validateScorecard(incomplete as PlaythroughScorecard)).toThrow(
        'Scorecard missing required field: floors_reached',
      );
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('fails validation when optional review source fields are malformed', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
    try {
      const { scorecard } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot,
      });

      expect(() =>
        validateScorecard({
          ...scorecard,
          review_path: '',
        }),
      ).toThrow('Scorecard optional review source must be a non-empty string: review_path');

      expect(() =>
        validateScorecard({
          ...scorecard,
          review_id: 42 as unknown as string,
        }),
      ).toThrow('Scorecard optional review source must be a non-empty string: review_id');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('serializes deterministically for the same trace and mocked review input', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
    try {
      const { trace } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot,
      });
      const tracePath = buildTraceRelativePath(trace.version, trace.seed, trace.persona);
      const reviewInput = {
        scores: {
          fun: 4,
          tactical_depth: 3,
        },
        review_id: 'mock-review-001',
      };

      expect(
        stringifyDeterministicJson(deriveScorecardFromTrace(trace, tracePath, reviewInput)),
      ).toBe(
        stringifyDeterministicJson(deriveScorecardFromTrace(trace, tracePath, reviewInput)),
      );
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('saves scorecard files with canonical Phase 06C fields', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
    try {
      const { artifacts } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot,
      });
      const savedScorecard = JSON.parse(
        await readFile(artifacts.scorecardPath, 'utf8'),
      ) as PlaythroughScorecard;

      for (const field of SCORECARD_FIELDS) {
        expect(savedScorecard).toHaveProperty(field);
      }
      expect(savedScorecard.reviewer_scores).toEqual(NULL_REVIEWER_SCORES);
      validateScorecard(savedScorecard);
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('saves enriched scorecard files with Phase 06B reviewer scores and source linkage', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
    try {
      const { trace } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot: path.join(runsRoot, 'source'),
      });
      const tracePath = buildTraceRelativePath(trace.version, trace.seed, trace.persona);
      const traceOnly = deriveScorecardFromTrace(trace, tracePath);
      const review = generateDeterministicReview({
        trace,
        scorecard: traceOnly,
        persona: 'bug_hunter',
      });
      const reviewPath = buildReviewRelativePath(review.version, review.seed, review.persona);
      const enrichedScorecard = deriveScorecardFromTrace(trace, tracePath, {
        scores: review.scores,
        review_path: reviewPath,
        review_id: `review:${review.persona}:${review.seed}`,
      });

      validateScorecard(enrichedScorecard);
      const artifacts = await savePlaythroughArtifacts(runsRoot, trace, enrichedScorecard);
      const savedScorecard = JSON.parse(
        await readFile(artifacts.scorecardPath, 'utf8'),
      ) as PlaythroughScorecard;

      expect(savedScorecard.reviewer_scores).toEqual(review.scores);
      expect(savedScorecard.review_path).toBe(reviewPath);
      expect(savedScorecard.review_id).toBe('review:bug_hunter:seed_001');
      expect(artifacts.scorecardPath.endsWith('runs/v001-test/scorecards/seed_001_stairs-seeking.json')).toBe(true);
      validateScorecard(savedScorecard);
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('records policy reasons when supplied', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
    const reasonedPolicy: HarnessPlayerPolicy = ({ availableActions }) => ({
      action: availableActions[0],
      reason: 'first safe-looking action',
    });

    try {
      const { trace } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot,
        maxSteps: 1,
        policy: reasonedPolicy,
      });

      expect(trace.steps[0]?.reason).toBe('first safe-looking action');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('stops at terminal status or configured max steps', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
    try {
      const terminalRun = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot: path.join(runsRoot, 'terminal'),
      });
      expect(['WIN', 'LOSS', 'ABORTED']).toContain(terminalRun.trace.result);

      const cappedRun = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot: path.join(runsRoot, 'capped'),
        maxSteps: 1,
      });

      expect(cappedRun.trace.steps.length).toBeLessThanOrEqual(1);
      expect(cappedRun.trace.result).toBe('ABORTED');
      expect(cappedRun.trace.steps.at(-1)?.terminalStatus).toBe('ABORTED');
      expect(
        cappedRun.trace.steps
          .at(-1)
          ?.events.some((event) => event.type === 'harness_max_steps'),
      ).toBe(true);
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it.each(CANONICAL_REGRESSION_SEEDS)(
    'simulates canonical seed %s with stairs-seeking',
    async (seed) => {
      const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
      try {
        const { trace } = await runPlaythrough({
          seed,
          policyId: 'stairs-seeking',
          version: 'v001-test',
          runsRoot,
        });

        assertTraceShape(trace);
        expect(trace.seed).toBe(seed);
        expect(trace.persona).toBe('stairs-seeking');
      } finally {
        await rm(runsRoot, { recursive: true, force: true });
      }
    },
  );

  it('uses stable relative artifact paths', () => {
    expect(buildTraceRelativePath('v001', 'seed_001', 'stairs-seeking')).toBe(
      'runs/v001/traces/seed_001_stairs-seeking.json',
    );
    expect(buildScorecardRelativePath('v001', 'seed_001', 'stairs-seeking')).toBe(
      'runs/v001/scorecards/seed_001_stairs-seeking.json',
    );
  });
});
