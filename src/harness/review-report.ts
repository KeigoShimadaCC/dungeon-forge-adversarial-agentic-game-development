import path from 'node:path';

import { getReviewerPersonaMetadata } from './reviewer-personas.js';
import type {
  PlaythroughReview,
  ReviewIssueEvidence,
  ReviewerPersonaMetadata,
} from './reviewer-client.js';

export const buildReviewMarkdownRelativePath = (
  version: string,
  seed: string,
  persona: string,
): string =>
  path.join('runs', version, 'reviews', `${seed}_${persona}.md`);

const formatEvidenceEntry = (entry: ReviewIssueEvidence): string => {
  const turnPrefix =
    entry.turn !== undefined ? `turn ${entry.turn}, ` : '';
  const quoteSuffix = entry.quote ? ` — "${entry.quote}"` : '';
  return `  - [${entry.kind}] ${turnPrefix}${entry.detail}${quoteSuffix}`;
};

const formatScoreLine = (label: string, value: number): string =>
  `- ${label}: ${value}/10`;

export const renderReviewMarkdown = (review: PlaythroughReview): string => {
  const personaMeta: ReviewerPersonaMetadata =
    review.persona_metadata ?? getReviewerPersonaMetadata(review.persona);

  const lines: string[] = [
    '# Playthrough Review',
    '',
    '> Human-readable report generated from validated JSON review data. JSON remains the authoritative contract artifact.',
    '',
    '## Persona',
    '',
    `- **Id:** \`${personaMeta.id}\``,
    `- **Display name:** ${personaMeta.display_name}`,
    `- **Description:** ${personaMeta.description}`,
    `- **Emphasis:** ${personaMeta.emphasis.join(', ')}`,
    `- **Player policy hint:** ${personaMeta.player_policy_hint}`,
    '',
    '## Run',
    '',
    `- **Version:** \`${review.version}\``,
    `- **Seed:** \`${review.seed}\``,
    ...(review.scorecard_result ? [`- **Result:** \`${review.scorecard_result}\``] : []),
    ...(review.scorecard_turns !== undefined
      ? [`- **Turns:** ${review.scorecard_turns}`]
      : []),
    `- **Evidence quality:** ${review.evidence_quality}`,
    ...(review.trace_path ? [`- **Trace (JSON):** \`${review.trace_path}\``] : []),
    ...(review.scorecard_path ? [`- **Scorecard (JSON):** \`${review.scorecard_path}\``] : []),
    `- **Review JSON:** \`${path.join('runs', review.version, 'reviews', `${review.seed}_${review.persona}.json`)}\``,
    '',
    '## Summary',
    '',
    review.summary,
    '',
    '## Reviewer scores',
    '',
    formatScoreLine('Fun', review.scores.fun),
    formatScoreLine('Clarity', review.scores.clarity),
    formatScoreLine('Fairness', review.scores.fairness),
    formatScoreLine('Tactical depth', review.scores.tactical_depth),
    formatScoreLine('Replay value', review.scores.replay_value),
    '',
    '## Top issues',
    '',
  ];

  if (review.top_issues.length === 0) {
    lines.push('_No structured issues were recorded._', '');
  } else {
    for (const [index, issue] of review.top_issues.entries()) {
      lines.push(
        `### ${index + 1}. ${issue.severity.toUpperCase()}`,
        '',
        `**Observation:** ${issue.observation}`,
        '',
        `**Diagnosis:** ${issue.diagnosis}`,
        '',
        `**Recommendation:** ${issue.recommendation}`,
        '',
        '**Evidence:**',
        '',
        ...issue.evidence.map(formatEvidenceEntry),
        '',
      );
    }
  }

  lines.push('## Suggested next changes', '');
  if (review.suggested_next_changes.length === 0) {
    lines.push('_None listed._', '');
  } else {
    lines.push(...review.suggested_next_changes.map((change) => `- ${change}`), '');
  }

  if (review.review_metadata) {
    lines.push('## Generation metadata', '');
    for (const [key, value] of Object.entries(review.review_metadata)) {
      if (value !== undefined) {
        lines.push(`- **${key}:** ${String(value)}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
};

export const enrichPlaythroughReview = (
  review: PlaythroughReview,
  artifactPaths?: {
    trace_path?: string;
    scorecard_path?: string;
    scorecard_result?: PlaythroughReview['scorecard_result'];
    scorecard_turns?: number;
  },
): PlaythroughReview => {
  const markdownPath = buildReviewMarkdownRelativePath(
    review.version,
    review.seed,
    review.persona,
  );

  return {
    ...review,
    persona_metadata: getReviewerPersonaMetadata(review.persona),
    review_markdown_path: markdownPath,
    ...(artifactPaths?.trace_path ? { trace_path: artifactPaths.trace_path } : {}),
    ...(artifactPaths?.scorecard_path ? { scorecard_path: artifactPaths.scorecard_path } : {}),
    ...(artifactPaths?.scorecard_result
      ? { scorecard_result: artifactPaths.scorecard_result }
      : {}),
    ...(artifactPaths?.scorecard_turns !== undefined
      ? { scorecard_turns: artifactPaths.scorecard_turns }
      : {}),
  };
};
