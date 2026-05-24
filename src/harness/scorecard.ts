import { deriveTrapResourceMetricsFromEvents } from '../game/traps-resources.js';
import {
  deriveEnemyBehaviorMetrics,
  deriveItemEvaluationMetrics,
  deriveProblemRunDiagnostics,
} from './trace-diagnostics.js';
import { playtestMetadataFromTrace } from './playtest-metadata.js';
import type {
  PlaythroughScorecard,
  PlaythroughTrace,
  ReviewerScores,
  ScorecardReviewInput,
  TraceMetadata,
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
  scores: ScorecardReviewInput['scores'] = {},
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
  reviewInput?: ScorecardReviewInput,
  metadata?: TraceMetadata,
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

  const resolvedMetadata = metadata ?? trace.metadata;
  const enemy_behaviors = deriveEnemyBehaviorMetrics(trace);
  const item_evaluation = deriveItemEvaluationMetrics(trace);
  const trap_resources = deriveTrapResourceMetricsFromEvents(trace.steps);

  const playtestMetadata = playtestMetadataFromTrace(trace);
  const baseScorecard: PlaythroughScorecard = {
    version: trace.version,
    seed: trace.seed,
    persona: trace.persona,
    ...playtestMetadata,
    ...(trace.challenge_mode ? { challenge_mode: trace.challenge_mode } : {}),
    ...(trace.scenario_pack ? { scenario_pack: trace.scenario_pack } : {}),
    ...(trace.scenario_pack_label ? { scenario_pack_label: trace.scenario_pack_label } : {}),
    ...(trace.extension_pack ? { extension_pack: trace.extension_pack } : {}),
    ...(trace.extension_pack_label ? { extension_pack_label: trace.extension_pack_label } : {}),
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
    enemy_behaviors,
    item_evaluation,
    trap_resources,
    ...(reviewInput?.review_path ? { review_path: reviewInput.review_path } : {}),
    ...(reviewInput?.review_id ? { review_id: reviewInput.review_id } : {}),
  };

  return {
    ...baseScorecard,
    diagnostics: deriveProblemRunDiagnostics(trace, baseScorecard, resolvedMetadata),
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

  const optionalSourceFields: readonly (keyof PlaythroughScorecard)[] = ['review_path', 'review_id'];
  for (const field of optionalSourceFields) {
    const value = record[field];
    if (value !== undefined && (typeof value !== 'string' || value.length === 0)) {
      throw new Error(`Scorecard optional review source must be a non-empty string: ${field}`);
    }
  }

  if (
    record.challenge_mode !== undefined &&
    (typeof record.challenge_mode !== 'string' || record.challenge_mode.length === 0)
  ) {
    throw new Error('Scorecard challenge_mode must be a non-empty string when present');
  }

  if (
    record.scenario_pack !== undefined &&
    (typeof record.scenario_pack !== 'string' || record.scenario_pack.length === 0)
  ) {
    throw new Error('Scorecard scenario_pack must be a non-empty string when present');
  }

  if (
    record.scenario_pack_label !== undefined &&
    (typeof record.scenario_pack_label !== 'string' || record.scenario_pack_label.length === 0)
  ) {
    throw new Error('Scorecard scenario_pack_label must be a non-empty string when present');
  }

  if (
    record.extension_pack !== undefined &&
    (typeof record.extension_pack !== 'string' || record.extension_pack.length === 0)
  ) {
    throw new Error('Scorecard extension_pack must be a non-empty string when present');
  }

  if (
    record.extension_pack_label !== undefined &&
    (typeof record.extension_pack_label !== 'string' ||
      record.extension_pack_label.length === 0)
  ) {
    throw new Error('Scorecard extension_pack_label must be a non-empty string when present');
  }

  if (record.player_kind !== undefined) {
    if (record.player_kind !== 'agent' && record.player_kind !== 'human') {
      throw new Error('Scorecard player_kind must be "agent" or "human" when present');
    }
  }

  if (record.agent_policy_class !== undefined) {
    if (record.agent_policy_class !== 'baseline' && record.agent_policy_class !== 'llm_persona') {
      throw new Error(
        'Scorecard agent_policy_class must be "baseline" or "llm_persona" when present',
      );
    }
  }

  if (record.human_play_mode !== undefined) {
    if (
      record.human_play_mode !== 'terminal' &&
      record.human_play_mode !== 'auto' &&
      record.human_play_mode !== 'script' &&
      record.human_play_mode !== 'browser'
    ) {
      throw new Error(
        'Scorecard human_play_mode must be terminal, auto, script, or browser when present',
      );
    }
  }

  if (record.session_label !== undefined) {
    if (typeof record.session_label !== 'string' || record.session_label.length === 0) {
      throw new Error('Scorecard session_label must be a non-empty string when present');
    }
  }

  if (record.enemy_behaviors !== undefined) {
    if (typeof record.enemy_behaviors !== 'object' || record.enemy_behaviors === null) {
      throw new Error('Scorecard enemy_behaviors must be an object when present');
    }
  }

  if (record.item_evaluation !== undefined) {
    if (typeof record.item_evaluation !== 'object' || record.item_evaluation === null) {
      throw new Error('Scorecard item_evaluation must be an object when present');
    }
  }

  if (record.trap_resources !== undefined) {
    if (typeof record.trap_resources !== 'object' || record.trap_resources === null) {
      throw new Error('Scorecard trap_resources must be an object when present');
    }
    const trapResources = record.trap_resources as Record<string, unknown>;
    for (const field of [
      'traps_triggered',
      'trap_damage_taken',
      'hunger_damage_taken',
      'resource_pressure_events',
    ] as const) {
      const value = trapResources[field];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Scorecard trap_resources.${field} must be a finite number when present`);
      }
      if (!Number.isInteger(value) || value < 0) {
        throw new Error(`Scorecard trap_resources.${field} must be a non-negative integer`);
      }
    }
  }

  if (record.diagnostics !== undefined) {
    if (typeof record.diagnostics !== 'object' || record.diagnostics === null) {
      throw new Error('Scorecard diagnostics must be an object when present');
    }
    const diagnostics = record.diagnostics as { categories?: unknown; primary_category?: unknown };
    if (!Array.isArray(diagnostics.categories)) {
      throw new Error('Scorecard diagnostics.categories must be an array when present');
    }
    if (typeof diagnostics.primary_category !== 'string') {
      throw new Error('Scorecard diagnostics.primary_category must be a string when present');
    }
  }
};
