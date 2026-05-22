import type {
  MockReviewScoreInput,
  PlaythroughScorecard,
  PlaythroughTrace,
  ReviewerScores,
} from './types.js';

const REVIEWER_SCORE_KEYS = [
  'fun',
  'clarity',
  'fairness',
  'tactical_depth',
  'replay_value',
] as const satisfies readonly (keyof ReviewerScores)[];

const OBJECTIVE_SCORECARD_FIELDS = [
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
  'trace_path',
] as const satisfies readonly (keyof PlaythroughScorecard)[];

const numberPayload = (
  payload: PlaythroughTrace['steps'][number]['events'][number]['payload'],
  key: string,
): number | undefined => {
  const value = payload?.[key];
  return typeof value === 'number' ? value : undefined;
};

const STATE_SUMMARY_KEY = (summary: PlaythroughTrace['steps'][number]['state_summary']): string =>
  JSON.stringify({
    turn: summary.turn,
    floor: summary.floor,
    hp: summary.hp,
    playerPosition: summary.playerPosition,
    inventory: summary.inventory,
    enemyCount: summary.enemyCount,
    itemCount: summary.itemCount,
  });

const normalizeReviewerScores = (
  scores: MockReviewScoreInput['scores'] = {},
): ReviewerScores => ({
  fun: scores.fun ?? null,
  clarity: scores.clarity ?? null,
  fairness: scores.fairness ?? null,
  tactical_depth: scores.tactical_depth ?? null,
  replay_value: scores.replay_value ?? null,
});

export const deriveScorecardFromTrace = (
  trace: PlaythroughTrace,
  tracePath: string,
  reviewInput?: MockReviewScoreInput,
): PlaythroughScorecard => {
  let floorsReached = 0;
  let damageTaken = 0;
  let itemsUsed = 0;
  let enemiesDefeated = 0;
  let invalidActions = 0;
  let softlocks = 0;

  let repeatCount = 0;
  let previousSummaryKey: string | undefined;

  for (const step of trace.steps) {
    floorsReached = Math.max(floorsReached, step.state_summary.floor);

    if (!step.valid) {
      invalidActions += 1;
    }

    for (const event of step.events) {
      if (event.type === 'enemy_attack') {
        damageTaken += numberPayload(event.payload, 'damage') ?? 0;
      }

      if (event.type === 'enemy_defeated') {
        enemiesDefeated += 1;
      }

      if (event.type === 'use_item') {
        itemsUsed += 1;
      }
    }

    if (step.valid) {
      const summaryKey = STATE_SUMMARY_KEY(step.state_summary);
      if (summaryKey === previousSummaryKey) {
        repeatCount += 1;
      } else {
        repeatCount = 0;
        previousSummaryKey = summaryKey;
      }

      if (repeatCount >= 2) {
        softlocks += 1;
      }
    }
  }

  if (
    trace.result === 'ABORTED' &&
    trace.steps.some((step) =>
      step.events.some((event) => event.type === 'aborted'),
    )
  ) {
    softlocks = Math.max(softlocks, 1);
  }

  return {
    version: trace.version,
    seed: trace.seed,
    persona: trace.persona,
    result: trace.result,
    turns: trace.turns,
    floors_reached: floorsReached,
    damage_taken: damageTaken,
    items_used: itemsUsed,
    enemies_defeated: enemiesDefeated,
    invalid_actions: invalidActions,
    softlocks,
    reviewer_scores: normalizeReviewerScores(reviewInput?.scores),
    trace_path: tracePath,
    ...(reviewInput?.review_path ? { review_path: reviewInput.review_path } : {}),
    ...(reviewInput?.review_id ? { review_id: reviewInput.review_id } : {}),
  };
};

export const validateScorecard = (scorecard: PlaythroughScorecard): void => {
  const record = scorecard as unknown as Record<string, unknown>;

  for (const field of OBJECTIVE_SCORECARD_FIELDS) {
    if (record[field] === undefined || record[field] === null) {
      throw new Error(`Scorecard missing required field: ${field}`);
    }
  }

  const stringFields: readonly (keyof PlaythroughScorecard)[] = [
    'version',
    'seed',
    'persona',
    'result',
    'trace_path',
  ];
  for (const field of stringFields) {
    if (typeof record[field] !== 'string' || record[field].length === 0) {
      throw new Error(`Scorecard field must be a non-empty string: ${field}`);
    }
  }

  const numberFields: readonly (keyof PlaythroughScorecard)[] = [
    'turns',
    'floors_reached',
    'damage_taken',
    'items_used',
    'enemies_defeated',
    'invalid_actions',
    'softlocks',
  ];
  for (const field of numberFields) {
    if (typeof record[field] !== 'number' || !Number.isFinite(record[field])) {
      throw new Error(`Scorecard field must be a finite number: ${field}`);
    }
  }

  if (record.reviewer_scores === null || typeof record.reviewer_scores !== 'object') {
    throw new Error('Scorecard missing required field: reviewer_scores');
  }

  const reviewerScores = record.reviewer_scores as Record<string, unknown>;
  for (const field of REVIEWER_SCORE_KEYS) {
    const value = reviewerScores[field];
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error(`Scorecard reviewer score must be a finite number or null: ${field}`);
    }
  }
};
