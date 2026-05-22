import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  generateDeveloperTask,
  renderChangelogTemplate,
  renderDeveloperTaskMarkdown,
  renderPatchPlanTemplate,
  type DeveloperTask,
  type DeveloperTaskInput,
} from './developer-workflow.js';
import { stringifyDeterministicJson } from './json.js';
import type { PlaythroughReview } from './reviewer-client.js';
import type { PlaythroughScorecard } from './types.js';
import {
  compareVersions,
  getDefaultVersionRuns,
  getVersionPaths,
  type VersionComparison,
  type VersionRunSpec,
} from './version-loop.js';

const DEFAULT_HANDOFF_RUN: VersionRunSpec = {
  seed: 'seed_001',
  persona: 'careful_player',
};

export const buildComparisonArtifactBasename = (
  baseVersion: string,
  targetVersion: string,
): string => `${baseVersion}_vs_${targetVersion}`;

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

const loadJsonFile = async <T>(filePath: string): Promise<T> => {
  const contents = await readFile(filePath, 'utf8');
  return JSON.parse(contents) as T;
};

export const loadVersionReviewAndScorecard = async (
  runsRoot: string,
  version: string,
  spec: VersionRunSpec = DEFAULT_HANDOFF_RUN,
): Promise<{ review: PlaythroughReview; scorecard: PlaythroughScorecard }> => {
  const paths = getVersionPaths(runsRoot, version);
  const basename = `${spec.seed}_${spec.persona}`;
  const reviewPath = path.join(paths.reviewsDir, `${basename}.json`);
  const scorecardPath = path.join(paths.scorecardsDir, `${basename}.json`);
  const review = await loadJsonFile<PlaythroughReview>(reviewPath);
  const scorecard = await loadJsonFile<PlaythroughScorecard>(scorecardPath);
  return { review, scorecard };
};

export const buildProposedChangesFromReview = (review: PlaythroughReview): string[] => {
  const proposed: string[] = [];
  const clarityIssue = review.top_issues.find((issue) =>
    issue.recommendation.toLowerCase().includes('ascii render'),
  );
  if (clarityIssue) {
    proposed.push(
      'Show held-item effect summaries and active tactical status in ASCII render and recent log output.',
    );
  }

  const tacticalIssue = review.top_issues.find((issue) =>
    issue.diagnosis.toLowerCase().includes('item') ||
    issue.recommendation.toLowerCase().includes('tactical'),
  );
  if (tacticalIssue || review.suggested_next_changes.some((entry) => entry.length > 0)) {
    proposed.push(
      'Expose Smoke Bomb in the target version profile with floor-1 spawn via allowedItemIds.',
    );
  }

  proposed.push('Emit a deterministic tutorial log when Smoke Bomb is first picked up.');

  return [...new Set(proposed)].slice(0, 3);
};

export const buildReviewerDrivenHandoffInput = (
  runsRoot: string,
  baseVersion: string,
  targetVersion: string,
  review: PlaythroughReview,
  scorecard: PlaythroughScorecard,
): DeveloperTaskInput => {
  const proposedChanges = buildProposedChangesFromReview(review);
  const handoffRun = DEFAULT_HANDOFF_RUN;

  return {
    review,
    scorecard,
    previousReviewPath: path.join(
      'runs',
      baseVersion,
      'reviews',
      `${handoffRun.seed}_${handoffRun.persona}.json`,
    ),
    previousScorecardPath: path.join(
      'runs',
      baseVersion,
      'scorecards',
      `${handoffRun.seed}_${handoffRun.persona}.json`,
    ),
    targetVersion,
    targetScope: `Reviewer-driven tactical/clarity improvement for ${targetVersion} responding to ${baseVersion} trace and review evidence.`,
    allowedChanges: [
      'Adjust demo version profiles and bounded content allow-lists.',
      'Improve ASCII render/log clarity for items and tactical effects.',
      'Add deterministic pickup guidance for Smoke Bomb inside existing engine step flow.',
    ],
    proposedChanges,
    expectedImplementationSummary: `Implement the ${proposedChanges.length} scoped ${targetVersion} changes grounded in ${baseVersion} review ${review.seed}/${review.persona}, then regenerate playthrough and comparison evidence.`,
    runsRoot,
    forbiddenChanges: [
      `Do not modify committed ${baseVersion} trace/review/scorecard JSON artifacts in place.`,
    ],
  };
};

export const writeReviewerDrivenHandoff = async (
  runsRoot: string,
  baseVersion: string,
  targetVersion: string,
  spec: VersionRunSpec = DEFAULT_HANDOFF_RUN,
): Promise<DeveloperTask> => {
  const { review, scorecard } = await loadVersionReviewAndScorecard(
    runsRoot,
    baseVersion,
    spec,
  );
  const input = buildReviewerDrivenHandoffInput(
    runsRoot,
    baseVersion,
    targetVersion,
    review,
    scorecard,
  );
  const task = generateDeveloperTask(input);
  const targetPaths = getVersionPaths(runsRoot, targetVersion);
  await mkdir(targetPaths.versionDir, { recursive: true });
  await writeFile(
    path.join(targetPaths.versionDir, 'developer_task.md'),
    renderDeveloperTaskMarkdown(task),
    'utf8',
  );
  await writeFile(targetPaths.patchPlanPath, renderPatchPlanTemplate(task, review), 'utf8');
  await writeFile(targetPaths.changelogPath, renderChangelogTemplate(task), 'utf8');
  return task;
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

export const writeVersionComparisonArtifacts = async (
  runsRoot: string,
  baseVersion: string,
  targetVersion: string,
): Promise<{ comparison: VersionComparison; jsonPath: string; markdownPath: string }> => {
  const comparison = await compareVersions(runsRoot, baseVersion, targetVersion);
  const { jsonPath, markdownPath } = buildComparisonRelativePaths(baseVersion, targetVersion);
  const comparisonsDir = path.join(runsRoot, 'runs', 'comparisons');
  await mkdir(comparisonsDir, { recursive: true });
  await writeFile(
    path.join(runsRoot, jsonPath),
    stringifyDeterministicJson(comparison),
    'utf8',
  );
  await writeFile(path.join(runsRoot, markdownPath), renderComparisonMarkdown(comparison), 'utf8');
  return { comparison, jsonPath, markdownPath };
};

export const writeImplementedVersionMarkdown = async (
  runsRoot: string,
  version: string,
  sections: {
    changelogBullets: string[];
    developerNotesBullets: string[];
    testsAndEvidenceBullets: string[];
    comparisonPath?: string;
    patchPlanStatus?: 'implemented';
  },
): Promise<void> => {
  const paths = getVersionPaths(runsRoot, version);
  const changelog = [
    '# Changelog',
    '',
    `Version: ${version}`,
    '',
    '## Implemented changes',
    '',
    ...sections.changelogBullets.map((entry) => `- ${entry}`),
    '',
    '## Tests and evidence',
    '',
    ...sections.testsAndEvidenceBullets.map((entry) => `- ${entry}`),
    '',
    '## Invariants preserved',
    '',
    '- GameEngine interface unchanged.',
    '- Seed determinism and explicit terminal states preserved.',
    '- Gameplay remains finite, turn-based, and text/ASCII-first.',
    '',
    '## Residual risks',
    '',
    '- v001 softlock/ABORTED paths may still appear on some seeds; v002 adds tactical escape without claiming full loop fixes.',
    '',
    '## Status',
    '',
    'Status: implemented',
    '',
  ].join('\n');

  const developerNotes = [
    '# Developer Notes',
    '',
    `Version: ${version}`,
    '',
    '## Implementation notes',
    '',
    ...sections.developerNotesBullets.map((entry) => `- ${entry}`),
    '',
    '## Evidence',
    '',
    `- Persona matrix: ${getDefaultVersionRuns().length} seeded playthroughs under \`runs/${version}/\`.`,
    `- Balance batch: \`runs/${version}/balance_summary.json\`.`,
    ...(sections.comparisonPath
      ? [`- Comparison: \`${sections.comparisonPath}\` when generated from demo loop.`]
      : []),
    '',
    '## Status',
    '',
    'Status: implemented',
    '',
  ].join('\n');

  await writeFile(paths.changelogPath, changelog, 'utf8');
  await writeFile(paths.developerNotesPath, developerNotes, 'utf8');

  if (sections.patchPlanStatus === 'implemented') {
    const existing = await readFile(paths.patchPlanPath, 'utf8').catch(() => '');
    const updated = existing.replace('Status: pending', 'Status: implemented');
    await writeFile(paths.patchPlanPath, updated, 'utf8');
  }
};
