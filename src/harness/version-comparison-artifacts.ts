import path from 'node:path';

import { resolveVersionId } from './artifact-write-policy.js';
import type { VersionComparison } from './version-loop.js';

export const buildComparisonArtifactBasename = (
  baseVersion: string,
  targetVersion: string,
): string => `${resolveVersionId(baseVersion)}_vs_${resolveVersionId(targetVersion)}`;

export const buildComparisonRelativePaths = (
  baseVersion: string,
  targetVersion: string,
): { jsonPath: string; markdownPath: string } => {
  const basename = buildComparisonArtifactBasename(baseVersion, targetVersion);
  return {
    jsonPath: path.join('runs', 'comparisons', `${basename}.json`),
    markdownPath: path.join('runs', 'comparisons', `${basename}.md`),
  };
};

export const renderComparisonMarkdown = (comparison: VersionComparison): string => {
  const metricLines = Object.entries(comparison.objective_metric_deltas).map(
    ([metric, delta]) =>
      `- ${metric}: ${delta.base} -> ${delta.target} (delta ${delta.delta >= 0 ? '+' : ''}${delta.delta})`,
  );
  const reviewerLines = Object.entries(comparison.reviewer_score_deltas).map(
    ([metric, delta]) =>
      `- ${metric}: ${delta.base} -> ${delta.target} (delta ${delta.delta >= 0 ? '+' : ''}${delta.delta})`,
  );

  return [
    '# Version Comparison',
    '',
    `Base: \`${comparison.baseVersion}\``,
    `Target: \`${comparison.targetVersion}\``,
    '',
    '## Interpretation',
    '',
    comparison.interpretation,
    '',
    '## Objective metric deltas',
    '',
    ...metricLines,
    '',
    '## Reviewer score deltas (persona-run averages)',
    '',
    ...reviewerLines,
    '',
    '## Artifact coverage',
    '',
    `- Base missing artifacts: ${comparison.counts.baseMissingArtifacts}`,
    `- Target missing artifacts: ${comparison.counts.targetMissingArtifacts}`,
    ...(comparison.balance_comparison
      ? [
          '',
          '## Balance comparison',
          '',
          comparison.balance_comparison.interpretation,
        ]
      : []),
    '',
  ].join('\n');
};
