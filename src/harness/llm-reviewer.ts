import {
  buildLlmReviewerModelInput,
  buildLlmReviewerPrompt,
  type LlmReviewerModelInput,
} from '../agents/prompts/llm-reviewer.js';
import {
  generateDeterministicReview,
  isReviewerPersona,
  isScorecardStructurallyUsable,
  isTraceStructurallyUsable,
  type PlaythroughReview,
  type ReviewEvidenceKind,
  type ReviewEvidenceQuality,
  type ReviewerCriticInput,
  type ReviewerCriticProvider,
  type ReviewIssue,
  type ReviewIssueEvidence,
  type ReviewSeverity,
  type ReviewerScores,
} from './reviewer-client.js';
import type { LlmChatCompletionClient } from './llm-provider.js';

export type LlmReviewerFallbackReason =
  | 'malformed_json'
  | 'invalid_shape'
  | 'timeout'
  | 'client_error';

export interface LlmReviewGenerationMetadata {
  generation: 'llm' | 'deterministic';
  fallback_used?: boolean;
  fallback_reason?: LlmReviewerFallbackReason;
  model_summary?: string;
}

export interface PlaythroughReviewWithMetadata extends PlaythroughReview {
  review_metadata?: LlmReviewGenerationMetadata;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const clampScore = (value: number): number => Math.min(10, Math.max(1, Math.round(value)));

const REVIEW_SEVERITIES = new Set<ReviewSeverity>([
  'minor',
  'moderate',
  'major',
  'critical',
]);

const REVIEW_EVIDENCE_KINDS = new Set<ReviewEvidenceKind>([
  'turn',
  'result',
  'invalid',
  'event',
  'render',
  'scorecard',
]);

const REVIEW_EVIDENCE_QUALITIES = new Set<ReviewEvidenceQuality>([
  'full',
  'partial',
  'minimal',
]);

const parseScores = (raw: unknown): ReviewerScores | undefined => {
  if (!isRecord(raw)) {
    return undefined;
  }
  const fields: (keyof ReviewerScores)[] = [
    'fun',
    'clarity',
    'fairness',
    'tactical_depth',
    'replay_value',
  ];
  const scores = {} as ReviewerScores;
  for (const field of fields) {
    const value = raw[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return undefined;
    }
    scores[field] = clampScore(value);
  }
  return scores;
};

const parseEvidence = (raw: unknown): ReviewIssueEvidence[] | undefined => {
  if (!Array.isArray(raw)) {
    return undefined;
  }

  const evidence: ReviewIssueEvidence[] = [];
  for (const item of raw) {
    if (!isRecord(item)) {
      return undefined;
    }

    const kind = item.kind;
    const detail = item.detail;
    if (
      typeof kind !== 'string' ||
      !REVIEW_EVIDENCE_KINDS.has(kind as ReviewEvidenceKind) ||
      typeof detail !== 'string' ||
      detail.trim().length === 0
    ) {
      return undefined;
    }

    evidence.push({
      kind: kind as ReviewEvidenceKind,
      detail,
      ...(typeof item.turn === 'number' ? { turn: item.turn } : {}),
      ...(typeof item.quote === 'string' ? { quote: item.quote } : {}),
    });
  }

  return evidence;
};

const parseIssues = (raw: unknown): ReviewIssue[] | undefined => {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const issues: ReviewIssue[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      return undefined;
    }
    const severity = entry.severity;
    const observation = entry.observation;
    const diagnosis = entry.diagnosis;
    const recommendation = entry.recommendation;
    const evidence = entry.evidence;
    const parsedEvidence = parseEvidence(evidence);
    if (
      typeof severity !== 'string' ||
      !REVIEW_SEVERITIES.has(severity as ReviewSeverity) ||
      typeof observation !== 'string' ||
      typeof diagnosis !== 'string' ||
      typeof recommendation !== 'string' ||
      !parsedEvidence
    ) {
      return undefined;
    }
    issues.push({
      severity: severity as ReviewIssue['severity'],
      observation,
      diagnosis,
      recommendation,
      evidence: parsedEvidence,
    });
  }
  return issues;
};

export const parseLlmReviewerModelOutput = (
  raw: string,
): { ok: true; review: Omit<PlaythroughReview, 'version' | 'seed' | 'persona'> } | { ok: false; reason: LlmReviewerFallbackReason } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'malformed_json' };
  }

  if (!isRecord(parsed)) {
    return { ok: false, reason: 'invalid_shape' };
  }

  const summary = parsed.summary;
  const scores = parseScores(parsed.scores);
  const top_issues = parseIssues(parsed.top_issues);
  const suggested = parsed.suggested_next_changes;
  const evidence_quality = parsed.evidence_quality;

  if (
    typeof summary !== 'string' ||
    summary.length === 0 ||
    !scores ||
    !top_issues ||
    !Array.isArray(suggested) ||
    !suggested.every((item) => typeof item === 'string') ||
    typeof evidence_quality !== 'string' ||
    !REVIEW_EVIDENCE_QUALITIES.has(evidence_quality as ReviewEvidenceQuality)
  ) {
    return { ok: false, reason: 'invalid_shape' };
  }

  return {
    ok: true,
    review: {
      summary,
      scores,
      top_issues,
      suggested_next_changes: suggested,
      evidence_quality: evidence_quality as PlaythroughReview['evidence_quality'],
    },
  };
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<{ ok: true; value: T } | { ok: false; reason: 'timeout' }> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve({ ok: true, value });
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });

export interface CreateLlmReviewerProviderOptions {
  client: LlmChatCompletionClient;
  timeoutMs?: number;
}

const DEFAULT_REVIEWER_TIMEOUT_MS = 30_000;

export const resolveLlmReview = async (
  input: ReviewerCriticInput,
  options: CreateLlmReviewerProviderOptions,
): Promise<PlaythroughReviewWithMetadata> => {
  const { trace, scorecard, persona } = input;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REVIEWER_TIMEOUT_MS;

  if (!isReviewerPersona(persona)) {
    throw new Error(`Unknown reviewer persona: ${persona}`);
  }
  if (!isTraceStructurallyUsable(trace) || !isScorecardStructurallyUsable(scorecard)) {
    const fallback = generateDeterministicReview(input);
    return {
      ...fallback,
      review_metadata: {
        generation: 'deterministic',
        fallback_used: true,
        fallback_reason: 'invalid_shape',
      },
    };
  }

  const modelInput = buildLlmReviewerModelInput({
    trace,
    scorecard,
    persona,
    keyRenderedStates: input.keyRenderedStates,
  });
  const prompt = buildLlmReviewerPrompt(modelInput);

  try {
    const clientResult = await withTimeout(
      options.client.complete({ prompt }),
      timeoutMs,
    );
    if (!clientResult.ok) {
      const fallback = generateDeterministicReview(input);
      return {
        ...fallback,
        review_metadata: {
          generation: 'deterministic',
          fallback_used: true,
          fallback_reason: 'timeout',
        },
      };
    }

    const parsed = parseLlmReviewerModelOutput(clientResult.value);
    if (!parsed.ok) {
      const fallback = generateDeterministicReview(input);
      return {
        ...fallback,
        review_metadata: {
          generation: 'deterministic',
          fallback_used: true,
          fallback_reason: parsed.reason,
        },
      };
    }

    return {
      version: trace.version,
      seed: trace.seed,
      persona,
      ...parsed.review,
      trace_path: scorecard.trace_path,
      review_metadata: {
        generation: 'llm',
        model_summary: parsed.review.summary,
      },
    };
  } catch {
    const fallback = generateDeterministicReview(input);
    return {
      ...fallback,
      review_metadata: {
        generation: 'deterministic',
        fallback_used: true,
        fallback_reason: 'client_error',
      },
    };
  }
};

export const createLlmReviewerProvider = (
  options: CreateLlmReviewerProviderOptions,
): ReviewerCriticProvider => {
  return (input) => resolveLlmReview(input, options);
};

export type { LlmReviewerModelInput };
