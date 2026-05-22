import {
  isReviewerPersona,
  type PlaythroughReview,
  type ReviewEvidenceKind,
  type ReviewEvidenceQuality,
  type ReviewIssue,
  type ReviewSeverity,
  type ReviewerScores,
} from './reviewer-client.js';

export type ReviewValidationDiagnosticCategory = 'blocker' | 'warning';

export interface ReviewValidationDiagnostic {
  category: ReviewValidationDiagnosticCategory;
  field?: string;
  message: string;
}

export interface ReviewValidationResult {
  ok: boolean;
  diagnostics: ReviewValidationDiagnostic[];
  blockers: ReviewValidationDiagnostic[];
  warnings: ReviewValidationDiagnostic[];
}

export class ReviewValidationError extends Error {
  readonly diagnostics: ReviewValidationDiagnostic[];

  constructor(message: string, diagnostics: ReviewValidationDiagnostic[] = []) {
    super(message);
    this.name = 'ReviewValidationError';
    this.diagnostics = diagnostics;
  }
}

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

const SCORE_FIELDS: (keyof ReviewerScores)[] = [
  'fun',
  'clarity',
  'fairness',
  'tactical_depth',
  'replay_value',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const pushBlocker = (
  diagnostics: ReviewValidationDiagnostic[],
  field: string,
  message: string,
): void => {
  diagnostics.push({ category: 'blocker', field, message });
};

const pushWarning = (
  diagnostics: ReviewValidationDiagnostic[],
  field: string,
  message: string,
): void => {
  diagnostics.push({ category: 'warning', field, message });
};

const validateScores = (
  raw: unknown,
  diagnostics: ReviewValidationDiagnostic[],
): raw is ReviewerScores => {
  if (!isRecord(raw)) {
    pushBlocker(diagnostics, 'scores', 'scores must be an object with numeric 1–10 fields.');
    return false;
  }

  for (const field of SCORE_FIELDS) {
    const value = raw[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 10) {
      pushBlocker(
        diagnostics,
        'scores',
        `scores.${field} must be a finite number between 1 and 10.`,
      );
      return false;
    }
  }

  return true;
};

const validateIssueEvidence = (
  raw: unknown,
  diagnostics: ReviewValidationDiagnostic[],
  issueIndex: number,
): boolean => {
  if (!Array.isArray(raw) || raw.length === 0) {
    pushBlocker(
      diagnostics,
      `top_issues[${issueIndex}].evidence`,
      'Each issue must include at least one evidence entry.',
    );
    return false;
  }

  for (let evidenceIndex = 0; evidenceIndex < raw.length; evidenceIndex += 1) {
    const entry = raw[evidenceIndex];
    if (!isRecord(entry)) {
      pushBlocker(
        diagnostics,
        `top_issues[${issueIndex}].evidence[${evidenceIndex}]`,
        'Evidence entry must be an object.',
      );
      return false;
    }

    const kind = entry.kind;
    const detail = entry.detail;
    if (
      typeof kind !== 'string' ||
      !REVIEW_EVIDENCE_KINDS.has(kind as ReviewEvidenceKind) ||
      typeof detail !== 'string' ||
      detail.trim().length === 0
    ) {
      pushBlocker(
        diagnostics,
        `top_issues[${issueIndex}].evidence[${evidenceIndex}]`,
        'Evidence must include a supported kind and non-empty detail.',
      );
      return false;
    }

    if (entry.turn !== undefined && (typeof entry.turn !== 'number' || !Number.isFinite(entry.turn))) {
      pushBlocker(
        diagnostics,
        `top_issues[${issueIndex}].evidence[${evidenceIndex}].turn`,
        'Evidence turn must be a finite number when provided.',
      );
      return false;
    }
  }

  return true;
};

const validateTopIssues = (
  raw: unknown,
  diagnostics: ReviewValidationDiagnostic[],
): raw is ReviewIssue[] => {
  if (!Array.isArray(raw)) {
    pushBlocker(diagnostics, 'top_issues', 'top_issues must be an array.');
    return false;
  }

  if (raw.length === 0) {
    pushWarning(diagnostics, 'top_issues', 'Review has no top_issues; confirm evidence still supports the summary.');
    return true;
  }

  for (let index = 0; index < raw.length; index += 1) {
    const issue = raw[index];
    if (!isRecord(issue)) {
      pushBlocker(diagnostics, `top_issues[${index}]`, 'Issue must be an object.');
      return false;
    }

    const severity = issue.severity;
    const observation = issue.observation;
    const diagnosis = issue.diagnosis;
    const recommendation = issue.recommendation;

    if (
      typeof severity !== 'string' ||
      !REVIEW_SEVERITIES.has(severity as ReviewSeverity)
    ) {
      pushBlocker(
        diagnostics,
        `top_issues[${index}].severity`,
        'Issue severity must be minor, moderate, major, or critical.',
      );
      return false;
    }

    for (const [field, value] of [
      ['observation', observation],
      ['diagnosis', diagnosis],
      ['recommendation', recommendation],
    ] as const) {
      if (typeof value !== 'string' || value.trim().length === 0) {
        pushBlocker(
          diagnostics,
          `top_issues[${index}].${field}`,
          `Issue ${field} must be a non-empty string.`,
        );
        return false;
      }
    }

    if (
      observation === diagnosis ||
      diagnosis === recommendation ||
      observation === recommendation
    ) {
      pushWarning(
        diagnostics,
        `top_issues[${index}]`,
        'Observation, diagnosis, and recommendation should remain distinct.',
      );
    }

    if (!validateIssueEvidence(issue.evidence, diagnostics, index)) {
      return false;
    }
  }

  return true;
};

export const isReviewStructurallyUsable = (review: PlaythroughReview): boolean =>
  collectReviewValidationDiagnostics(review).blockers.length === 0;

export const collectReviewValidationDiagnostics = (
  review: unknown,
): ReviewValidationResult => {
  const diagnostics: ReviewValidationDiagnostic[] = [];

  if (!isRecord(review)) {
    pushBlocker(diagnostics, 'review', 'Review must be a JSON object.');
    return finalizeReviewValidation(diagnostics);
  }

  const version = review.version;
  const seed = review.seed;
  const persona = review.persona;
  const summary = review.summary;

  if (typeof version !== 'string' || version.length === 0) {
    pushBlocker(diagnostics, 'version', 'version must be a non-empty string.');
  }
  if (typeof seed !== 'string' || seed.length === 0) {
    pushBlocker(diagnostics, 'seed', 'seed must be a non-empty string.');
  }
  if (typeof persona !== 'string' || !isReviewerPersona(persona)) {
    pushBlocker(
      diagnostics,
      'persona',
      'persona must be one of careful_player, naive_player, or bug_hunter.',
    );
  }
  if (typeof summary !== 'string' || summary.trim().length === 0) {
    pushBlocker(diagnostics, 'summary', 'summary must be a non-empty string.');
  }

  const evidenceQuality = review.evidence_quality;
  if (
    typeof evidenceQuality !== 'string' ||
    !REVIEW_EVIDENCE_QUALITIES.has(evidenceQuality as ReviewEvidenceQuality)
  ) {
    pushBlocker(
      diagnostics,
      'evidence_quality',
      'evidence_quality must be full, partial, or minimal.',
    );
  }

  if (!validateScores(review.scores, diagnostics)) {
    return finalizeReviewValidation(diagnostics);
  }

  if (!validateTopIssues(review.top_issues, diagnostics)) {
    return finalizeReviewValidation(diagnostics);
  }

  const suggested = review.suggested_next_changes;
  if (!Array.isArray(suggested)) {
    pushBlocker(
      diagnostics,
      'suggested_next_changes',
      'suggested_next_changes must be an array of strings.',
    );
  } else {
    if (suggested.length > 3) {
      pushBlocker(
        diagnostics,
        'suggested_next_changes',
        `suggested_next_changes must include at most 3 items (received ${suggested.length}).`,
      );
    }
    for (let index = 0; index < suggested.length; index += 1) {
      const entry = suggested[index];
      if (typeof entry !== 'string' || entry.trim().length === 0) {
        pushBlocker(
          diagnostics,
          `suggested_next_changes[${index}]`,
          'Each suggested change must be a non-empty string.',
        );
      }
    }
  }

  return finalizeReviewValidation(diagnostics);
};

const finalizeReviewValidation = (
  diagnostics: ReviewValidationDiagnostic[],
): ReviewValidationResult => {
  const blockers = diagnostics.filter((entry) => entry.category === 'blocker');
  const warnings = diagnostics.filter((entry) => entry.category === 'warning');
  return {
    ok: blockers.length === 0,
    diagnostics,
    blockers,
    warnings,
  };
};

export const formatReviewValidationMessage = (result: ReviewValidationResult): string => {
  const formatDiagnostic = (diagnostic: ReviewValidationDiagnostic): string => {
    const prefix = diagnostic.field ? `${diagnostic.category} (${diagnostic.field})` : diagnostic.category;
    return `- [${prefix}]: ${diagnostic.message}`;
  };

  if (result.ok) {
    const lines = ['Review JSON is valid.'];
    if (result.diagnostics.length > 0) {
      lines.push('Diagnostics:');
      lines.push(...result.diagnostics.map(formatDiagnostic));
    }
    return lines.join('\n');
  }

  return ['Review validation failed:', ...result.diagnostics.map(formatDiagnostic)].join('\n');
};

export const assertValidPlaythroughReview = (review: unknown): void => {
  const result = collectReviewValidationDiagnostics(review);
  if (!result.ok) {
    throw new ReviewValidationError(formatReviewValidationMessage(result), result.diagnostics);
  }
};
