import type { PlaythroughScorecard, PlaythroughTrace, TraceStep } from './types.js';

export const REVIEWER_PERSONA_IDS = [
  'careful_player',
  'naive_player',
  'bug_hunter',
] as const;

export type ReviewerPersona = (typeof REVIEWER_PERSONA_IDS)[number];

export type ReviewSeverity = 'minor' | 'moderate' | 'major' | 'critical';

export type ReviewEvidenceKind =
  | 'turn'
  | 'result'
  | 'invalid'
  | 'event'
  | 'render'
  | 'scorecard';

export interface ReviewIssueEvidence {
  kind: ReviewEvidenceKind;
  turn?: number;
  detail: string;
  quote?: string;
}

export interface ReviewIssue {
  severity: ReviewSeverity;
  observation: string;
  diagnosis: string;
  recommendation: string;
  evidence: ReviewIssueEvidence[];
}

export interface ReviewerScores {
  fun: number;
  clarity: number;
  fairness: number;
  tactical_depth: number;
  replay_value: number;
}

export type ReviewEvidenceQuality = 'full' | 'partial' | 'minimal';

export interface ReviewerPersonaMetadata {
  id: ReviewerPersona;
  display_name: string;
  description: string;
  emphasis: string[];
  player_policy_hint: string;
}

export interface PlaythroughReview {
  version: string;
  seed: string;
  persona: ReviewerPersona;
  summary: string;
  scores: ReviewerScores;
  top_issues: ReviewIssue[];
  suggested_next_changes: string[];
  trace_path?: string;
  scorecard_path?: string;
  scorecard_result?: PlaythroughScorecard['result'];
  scorecard_turns?: number;
  review_markdown_path?: string;
  persona_metadata?: ReviewerPersonaMetadata;
  evidence_quality: ReviewEvidenceQuality;
  review_metadata?: {
    generation?: 'llm' | 'deterministic';
    fallback_used?: boolean;
    fallback_reason?: string;
    model_summary?: string;
  };
}

export interface ReviewerCriticInput {
  trace: PlaythroughTrace;
  scorecard: PlaythroughScorecard;
  persona: ReviewerPersona;
  keyRenderedStates?: string[];
}

export class ReviewGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewGenerationError';
  }
}

export const isReviewerPersona = (value: string): value is ReviewerPersona =>
  (REVIEWER_PERSONA_IDS as readonly string[]).includes(value);

const clampScore = (value: number): number => Math.min(10, Math.max(1, Math.round(value)));

const terminalStatuses = new Set(['ACTIVE', 'WIN', 'LOSS', 'ABORTED']);

export const isTraceStructurallyUsable = (trace: PlaythroughTrace): boolean =>
  typeof trace.version === 'string' &&
  trace.version.length > 0 &&
  typeof trace.seed === 'string' &&
  trace.seed.length > 0 &&
  typeof trace.persona === 'string' &&
  terminalStatuses.has(trace.result) &&
  typeof trace.turns === 'number' &&
  Number.isFinite(trace.turns) &&
  Array.isArray(trace.steps);

export const isScorecardStructurallyUsable = (scorecard: PlaythroughScorecard): boolean =>
  typeof scorecard.version === 'string' &&
  scorecard.version.length > 0 &&
  typeof scorecard.seed === 'string' &&
  scorecard.seed.length > 0 &&
  typeof scorecard.persona === 'string' &&
  terminalStatuses.has(scorecard.result) &&
  typeof scorecard.turns === 'number' &&
  Number.isFinite(scorecard.turns);

const assessEvidenceQuality = (
  trace: PlaythroughTrace,
  keyRenderedStates?: string[],
): ReviewEvidenceQuality => {
  if (trace.steps.length === 0) {
    return 'minimal';
  }

  const renderSamples =
    keyRenderedStates && keyRenderedStates.length > 0
      ? keyRenderedStates
      : trace.steps.map((step) => step.render).filter((render) => render.length > 0);

  if (renderSamples.length === 0) {
    return 'minimal';
  }

  const thinRenderCount = renderSamples.filter((render) => render.trim().length < 24).length;
  if (trace.steps.length < 3 || thinRenderCount === renderSamples.length) {
    return 'partial';
  }

  return 'full';
};

const resultEvidence = (trace: PlaythroughTrace): ReviewIssueEvidence => ({
  kind: 'result',
  detail: `Playthrough ended with terminal result ${trace.result} after ${trace.turns} recorded turns.`,
  quote: trace.result,
});

const scorecardEvidence = (
  scorecard: PlaythroughScorecard,
  detail: string,
): ReviewIssueEvidence => ({
  kind: 'scorecard',
  detail,
  quote: JSON.stringify({
    invalid_actions: scorecard.invalid_actions,
    softlocks: scorecard.softlocks,
    floors_reached: scorecard.floors_reached,
    result: scorecard.result,
  }),
});

const findFirstInvalidStep = (steps: TraceStep[]): TraceStep | undefined =>
  steps.find((step) => !step.valid);

const findNotableEventStep = (steps: TraceStep[]): TraceStep | undefined =>
  steps.find((step) =>
    step.events.some((event) =>
      ['enemy_attack', 'enemy_defeated', 'use_item', 'aborted', 'harness_max_steps'].includes(
        event.type,
      ),
    ),
  );

const findThinRenderStep = (steps: TraceStep[]): TraceStep | undefined =>
  steps.find((step) => step.render.trim().length < 24);

const personaSummaryPrefix = (persona: ReviewerPersona): string => {
  switch (persona) {
    case 'careful_player':
      return 'As a careful player,';
    case 'naive_player':
      return 'As a less tactical player,';
    case 'bug_hunter':
      return 'As a bug-hunting reviewer,';
    default:
      return 'This review';
  }
};

const buildSuggestedChanges = (
  issues: ReviewIssue[],
  persona: ReviewerPersona,
  evidenceQuality: ReviewEvidenceQuality,
): string[] => {
  const suggestions = new Set<string>();

  for (const issue of issues) {
    if (issue.recommendation.length > 0) {
      suggestions.add(issue.recommendation);
    }
  }

  if (evidenceQuality !== 'full') {
    suggestions.add(
      'Preserve full trace and ASCII render output so critiques can cite concrete turns and screens.',
    );
  }

  if (persona === 'bug_hunter' && suggestions.size < 2) {
    suggestions.add(
      'Add regression coverage for invalid-action handling and terminal ABORTED paths without changing the GameEngine interface.',
    );
  }

  if (persona === 'naive_player' && suggestions.size < 2) {
    suggestions.add(
      'Clarify item and enemy effects in render text or short log messages so first-time players understand available actions.',
    );
  }

  if (persona === 'careful_player' && suggestions.size < 2) {
    suggestions.add(
      'Tune early-floor pressure and item cadence using seeded simulations before adding new mechanics.',
    );
  }

  return [...suggestions].slice(0, 3);
};

const computeScores = (
  trace: PlaythroughTrace,
  scorecard: PlaythroughScorecard,
  persona: ReviewerPersona,
  evidenceQuality: ReviewEvidenceQuality,
): ReviewerScores => {
  let fun = 6;
  let clarity = 6;
  let fairness = 6;
  let tactical_depth = 5;
  let replay_value = 5;

  if (trace.result === 'WIN') {
    fun += 1;
    replay_value += 1;
  } else if (trace.result === 'LOSS') {
    fun -= 1;
    fairness -= 1;
  } else if (trace.result === 'ABORTED') {
    fun -= 2;
    fairness -= 2;
    clarity -= 1;
  }

  if (scorecard.floors_reached >= 4) {
    tactical_depth += 1;
    replay_value += 1;
  } else if (scorecard.floors_reached <= 1 && trace.turns > 8) {
    fairness -= 1;
    fun -= 1;
  }

  if (scorecard.items_used > 0 || scorecard.enemies_defeated > 0) {
    tactical_depth += 1;
  }

  if (scorecard.invalid_actions > 0) {
    clarity -= 2;
    fairness -= 1;
  }

  if (scorecard.softlocks > 0) {
    tactical_depth -= 2;
    replay_value -= 1;
  }

  if (evidenceQuality === 'minimal') {
    clarity -= 2;
  } else if (evidenceQuality === 'partial') {
    clarity -= 1;
  }

  switch (persona) {
    case 'careful_player':
      fairness += 1;
      tactical_depth += 1;
      break;
    case 'naive_player':
      clarity -= 1;
      tactical_depth -= 1;
      break;
    case 'bug_hunter':
      clarity += scorecard.invalid_actions > 0 ? -1 : 1;
      fairness -= scorecard.invalid_actions > 0 ? 1 : 0;
      break;
    default:
      break;
  }

  return {
    fun: clampScore(fun),
    clarity: clampScore(clarity),
    fairness: clampScore(fairness),
    tactical_depth: clampScore(tactical_depth),
    replay_value: clampScore(replay_value),
  };
};

const buildTopIssues = (
  trace: PlaythroughTrace,
  scorecard: PlaythroughScorecard,
  persona: ReviewerPersona,
  evidenceQuality: ReviewEvidenceQuality,
  keyRenderedStates?: string[],
): ReviewIssue[] => {
  const issues: ReviewIssue[] = [];

  if (evidenceQuality !== 'full') {
    issues.push({
      severity: evidenceQuality === 'minimal' ? 'major' : 'moderate',
      observation:
        'The playthrough evidence is thin: missing steps, empty renders, or no key rendered states were supplied.',
      diagnosis:
        'A trace-grounded critique cannot cite enough turn-by-turn facts to separate rendering problems from policy mistakes.',
      recommendation:
        'Re-run the harness with full trace capture and optional key render snapshots before treating this review as actionable.',
      evidence: [
        scorecardEvidence(
          scorecard,
          `Evidence quality assessed as ${evidenceQuality} with ${trace.steps.length} trace steps.`,
        ),
      ],
    });
  }

  if (scorecard.invalid_actions > 0) {
    const invalidStep = findFirstInvalidStep(trace.steps);
    issues.push({
      severity: persona === 'bug_hunter' ? 'critical' : 'major',
      observation: `The playthrough recorded ${scorecard.invalid_actions} invalid structured action(s).`,
      diagnosis:
        'Invalid actions indicate confusing affordances, broken action validation, or a policy probing disallowed moves.',
      recommendation:
        'Tighten action labels and validation feedback in render/log text, and add regression tests for invalid-action ABORTED handling.',
      evidence: [
        scorecardEvidence(scorecard, 'Scorecard invalid_actions is greater than zero.'),
        ...(invalidStep
          ? [
              {
                kind: 'invalid' as const,
                turn: invalidStep.turn,
                detail: `Turn ${invalidStep.turn} chose ${invalidStep.chosen_action.type} (${invalidStep.chosen_action.id}) but step.valid is false.`,
                quote: invalidStep.chosen_action.label,
              },
              {
                kind: 'turn' as const,
                turn: invalidStep.turn,
                detail: `Turn ${invalidStep.turn} ended in terminalStatus ${invalidStep.terminalStatus}.`,
              },
            ]
          : []),
      ],
    });
  }

  if (scorecard.softlocks > 0) {
    issues.push({
      severity: 'major',
      observation: `The scorecard reports ${scorecard.softlocks} softlock indicator(s) from repeated or stalled states.`,
      diagnosis:
        'Players can get stuck repeating the same summary state without meaningful progress, which reads as a loop rather than tactics.',
      recommendation:
        'Break repeated-state loops with clearer goals, new events, or bounded auto-advance rules while keeping turns finite.',
      evidence: [
        scorecardEvidence(scorecard, 'Scorecard softlocks is greater than zero.'),
        resultEvidence(trace),
      ],
    });
  }

  if (trace.result === 'ABORTED') {
    const abortStep =
      trace.steps.find((step) => step.events.some((event) => event.type === 'aborted')) ??
      trace.steps.at(-1);
    const maxStepEvent = trace.steps
      .flatMap((step) => step.events)
      .find((event) => event.type === 'harness_max_steps');

    issues.push({
      severity: persona === 'bug_hunter' ? 'critical' : 'major',
      observation: 'The run ended in ABORTED rather than a player-facing WIN or LOSS.',
      diagnosis: maxStepEvent
        ? 'The harness stopped the run at a step cap before a normal terminal outcome, so balance conclusions are inconclusive.'
        : 'An abort usually means invalid state, protocol failure, or an unfinished run that should not be scored like a fair loss.',
      recommendation: maxStepEvent
        ? 'Raise or document harness step limits for this seed, or fix early stalls so canonical seeds reach WIN/LOSS.'
        : 'Investigate abort events in the trace and add deterministic regression coverage for the failing path.',
      evidence: [
        resultEvidence(trace),
        ...(abortStep
          ? [
              {
                kind: 'event' as const,
                turn: abortStep.turn,
                detail: `Turn ${abortStep.turn} emitted abort-related events: ${abortStep.events.map((event) => event.type).join(', ')}.`,
              },
            ]
          : []),
        ...(maxStepEvent
          ? [
              {
                kind: 'event' as const,
                turn: maxStepEvent.turn,
                detail: `Harness max-steps event: ${maxStepEvent.message}`,
                quote: maxStepEvent.message,
              },
            ]
          : []),
      ],
    });
  }

  if (trace.result === 'LOSS' && scorecard.floors_reached <= 2) {
    issues.push({
      severity: persona === 'careful_player' ? 'major' : 'moderate',
      observation: `The player lost on floor ${scorecard.floors_reached} after ${trace.turns} turns with ${scorecard.damage_taken} damage taken.`,
      diagnosis:
        'Early losses can be fair tension, but repeated low-floor deaths suggest onboarding or pressure tuning problems.',
      recommendation:
        'Tune early enemy pressure, healing cadence, or tutorial log hints without removing LOSS or changing structured actions.',
      evidence: [
        resultEvidence(trace),
        scorecardEvidence(
          scorecard,
          `Floors reached ${scorecard.floors_reached}; damage_taken ${scorecard.damage_taken}.`,
        ),
      ],
    });
  }

  const notableStep = findNotableEventStep(trace.steps);
  if (notableStep) {
    const event = notableStep.events[0];
    issues.push({
      severity: 'minor',
      observation: `Notable event "${event?.type}" occurred during play.`,
      diagnosis:
        'Combat and item events are present, but their impact on player choices should be visible in render and action labels.',
      recommendation:
        'Surface item and enemy outcomes in the ASCII render or recent log so reviewers can connect events to decisions.',
      evidence: [
        {
          kind: 'event',
          turn: notableStep.turn,
          detail: `Turn ${notableStep.turn} event ${event?.type}: ${event?.message}`,
          quote: event?.message,
        },
        {
          kind: 'turn',
          turn: notableStep.turn,
          detail: `Turn ${notableStep.turn} inventory: ${notableStep.state_summary.inventory.join(', ') || '(empty)'}.`,
        },
      ],
    });
  }

  const thinRenderStep = findThinRenderStep(trace.steps);
  const externalRenders = keyRenderedStates ?? [];
  if (thinRenderStep || externalRenders.some((render) => render.trim().length < 24)) {
    const sample =
      externalRenders.find((render) => render.trim().length > 0) ?? thinRenderStep?.render ?? '';
    issues.push({
      severity: 'moderate',
      observation: 'At least one captured render snapshot is very short or empty.',
      diagnosis:
        'Thin render text makes it hard to judge map readability, legend completeness, and item visibility from trace evidence alone.',
      recommendation:
        'Expand ASCII render output with map symbols, legend, inventory, and recent log lines without adding image or audio dependencies.',
      evidence: [
        ...(thinRenderStep
          ? [
              {
                kind: 'render' as const,
                turn: thinRenderStep.turn,
                detail: `Turn ${thinRenderStep.turn} render snapshot is only ${thinRenderStep.render.trim().length} characters.`,
                quote: thinRenderStep.render.slice(0, 80),
              },
            ]
          : []),
        ...(sample
          ? [
              {
                kind: 'render' as const,
                detail: 'Key rendered state sample is too thin for tactical review.',
                quote: sample.slice(0, 80),
              },
            ]
          : []),
      ],
    });
  }

  if (issues.length === 0) {
    issues.push({
      severity: 'minor',
      observation: `The ${trace.result} run on seed ${trace.seed} completed without invalid actions or softlocks in the scorecard.`,
      diagnosis:
        'No high-severity trace failures were detected; remaining opportunities are polish and depth rather than protocol breakage.',
      recommendation:
        'Add one tactical item or enemy behavior and improve legend clarity while preserving finite turns and structured actions.',
      evidence: [resultEvidence(trace), scorecardEvidence(scorecard, 'Scorecard shows stable metrics.')],
    });
  }

  const maxIssues = persona === 'bug_hunter' ? 5 : 4;
  return issues.slice(0, maxIssues);
};

/**
 * Deterministic, mockable reviewer critic. Does not call external APIs.
 */
export const generateDeterministicReview = (input: ReviewerCriticInput): PlaythroughReview => {
  const { trace, scorecard, persona, keyRenderedStates } = input;

  if (!isReviewerPersona(persona)) {
    throw new ReviewGenerationError(`Unknown reviewer persona: ${persona}`);
  }

  if (!isTraceStructurallyUsable(trace)) {
    throw new ReviewGenerationError('Trace input is structurally unusable for review generation.');
  }

  if (!isScorecardStructurallyUsable(scorecard)) {
    throw new ReviewGenerationError(
      'Scorecard input is structurally unusable for review generation.',
    );
  }

  const evidenceQuality = assessEvidenceQuality(trace, keyRenderedStates);
  const top_issues = buildTopIssues(
    trace,
    scorecard,
    persona,
    evidenceQuality,
    keyRenderedStates,
  );
  const scores = computeScores(trace, scorecard, persona, evidenceQuality);
  const suggested_next_changes = buildSuggestedChanges(top_issues, persona, evidenceQuality);

  const outcomePhrase =
    trace.result === 'WIN'
      ? 'reached a win'
      : trace.result === 'LOSS'
        ? 'lost before the end'
        : 'ended in ABORTED';

  const summary = `${personaSummaryPrefix(persona)} the ${trace.version} play on seed ${trace.seed} ${outcomePhrase} in ${trace.turns} turns (floors reached ${scorecard.floors_reached}, invalid actions ${scorecard.invalid_actions}). ${top_issues[0]?.observation ?? 'No major issues were extracted.'}`;

  return {
    version: trace.version,
    seed: trace.seed,
    persona,
    summary,
    scores,
    top_issues,
    suggested_next_changes,
    trace_path: scorecard.trace_path,
    evidence_quality: evidenceQuality,
  };
};

export type ReviewerCriticProvider = (
  input: ReviewerCriticInput,
) => PlaythroughReview | Promise<PlaythroughReview>;

export interface ReviewerCritic {
  generateReview(input: ReviewerCriticInput): PlaythroughReview | Promise<PlaythroughReview>;
}

export const createReviewerCritic = (provider?: ReviewerCriticProvider): ReviewerCritic => ({
  generateReview(input) {
    return (provider ?? generateDeterministicReview)(input);
  },
});
