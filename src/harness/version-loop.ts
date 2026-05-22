import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  type ArtifactWriteOptions,
  type ArtifactWritePolicyContext,
  fileExists,
  resolveVersionId,
  writeArtifactFile,
  VERSION_ID_ALIAS_ENTRIES,
} from './artifact-write-policy.js';
import {
  compareBalanceSummaries,
  loadBalanceSummary,
  type BalanceSummaryComparison,
} from './balance-tuning.js';
import {
  buildComparisonRelativePaths,
  renderComparisonMarkdown,
} from './version-comparison-artifacts.js';
import {
  buildReviewRelativePath,
  buildScorecardRelativePath,
  buildTraceRelativePath,
  savePlaythroughReview,
} from './artifacts.js';
import { stringifyDeterministicJson } from './json.js';
import { awaitPolicyDecision, resolveBaselinePolicy } from './policy-registry.js';
import { generateDeterministicReview, type ReviewerPersona } from './reviewer-client.js';
import { runPlaythrough } from './runner.js';
import { deriveScorecardFromTrace, validateScorecard } from './scorecard.js';
import type {
  HarnessPlayerPolicy,
  LlmPlayerPersona,
  PlaythroughScorecard,
  PlaythroughTrace,
  ReviewerScores,
} from './types.js';

export const VERSION_ID_PATTERN = /^v\d{3}$/;

export const VERSION_MARKDOWN_FILES = [
  'patch_plan.md',
  'changelog.md',
  'developer_notes.md',
  'acceptance.md',
] as const;

export type VersionMarkdownFile = (typeof VERSION_MARKDOWN_FILES)[number];

export const VERSION_ARTIFACT_DIRS = ['traces', 'reviews', 'scorecards'] as const;

export type VersionArtifactDir = (typeof VERSION_ARTIFACT_DIRS)[number];

export interface VersionPaths {
  version: string;
  versionDir: string;
  tracesDir: string;
  reviewsDir: string;
  scorecardsDir: string;
  patchPlanPath: string;
  changelogPath: string;
  developerNotesPath: string;
  acceptancePath: string;
}

export interface EnsureVersionResult {
  paths: VersionPaths;
  createdMarkdown: string[];
  preservedMarkdown: string[];
}

export interface VersionRunSpec {
  seed: string;
  persona: LlmPlayerPersona;
}

export interface VersionRunResult {
  seed: string;
  persona: LlmPlayerPersona;
  result: PlaythroughTrace['result'];
  turns: number;
  tracePath: string;
  reviewPath: string;
  scorecardPath: string;
  reviewerScores: ReviewerScores;
}

export interface VersionRunOutput {
  version: string;
  runs: VersionRunResult[];
}

export interface ArtifactCoverage {
  traces: { expected: number; present: number; missing: string[] };
  reviews: { expected: number; present: number; missing: string[] };
  scorecards: { expected: number; present: number; missing: string[] };
  markdown: Record<VersionMarkdownFile, { path: string; present: boolean; nonEmpty: boolean }>;
}

export interface VersionSummaryRun {
  seed: string;
  persona: string;
  result: PlaythroughScorecard['result'];
  turns: number;
  metrics: Pick<
    PlaythroughScorecard,
    | 'floors_reached'
    | 'damage_taken'
    | 'items_used'
    | 'enemies_defeated'
    | 'invalid_actions'
    | 'softlocks'
  >;
  reviewer_scores: ReviewerScores;
  trace_path: string;
  review_path?: string;
  scorecard_path: string;
}

export interface VersionSummary {
  version: string;
  versionDir: string;
  status: 'complete' | 'partial';
  artifact_coverage: ArtifactCoverage;
  runs: VersionSummaryRun[];
  links: {
    patch_plan: string;
    changelog: string;
    developer_notes: string;
    acceptance: string;
  };
  acceptance_status: 'accepted' | 'rejected' | 'pending' | 'blocked' | 'unknown';
}

export interface MetricDelta {
  base: number;
  target: number;
  delta: number;
}

export interface VersionComparison {
  baseVersion: string;
  targetVersion: string;
  counts: {
    baseRuns: number;
    targetRuns: number;
    baseMissingArtifacts: number;
    targetMissingArtifacts: number;
  };
  objective_metric_deltas: Record<string, MetricDelta>;
  reviewer_score_deltas: Record<keyof ReviewerScores, MetricDelta>;
  missing_artifacts: {
    base: string[];
    target: string[];
  };
  balance_comparison?: BalanceSummaryComparison;
  interpretation: string;
}

const DEFAULT_VERSION_RUNS = [
  { seed: 'seed_001', persona: 'careful_player' },
  { seed: 'seed_002', persona: 'naive_player' },
  { seed: 'seed_003', persona: 'bug_hunter' },
] as const satisfies readonly VersionRunSpec[];

const PERSONA_BASELINE_POLICY: Record<LlmPlayerPersona, 'cautious-low-hp' | 'random' | 'stairs-seeking'> = {
  careful_player: 'cautious-low-hp',
  naive_player: 'random',
  bug_hunter: 'stairs-seeking',
};

const MARKDOWN_TEMPLATES: Record<VersionMarkdownFile, string> = {
  'patch_plan.md':
    '# Patch Plan\n\nStatus: pending\n\nPlanned changes should be written here before implementation.\n',
  'changelog.md':
    '# Changelog\n\nStatus: pending\n\nRecord implemented changes for this version here.\n',
  'developer_notes.md':
    '# Developer Notes\n\nStatus: pending\n\nRecord implementation notes, risks, and follow-ups here.\n',
  'acceptance.md':
    '# Acceptance\n\nStatus: pending\n\nRecord accepted/rejected status and reasons here.\n',
};

export const getDefaultVersionRuns = (): VersionRunSpec[] =>
  DEFAULT_VERSION_RUNS.map((run) => ({ ...run }));

export const validateVersionId = (version: string): void => {
  const resolved = resolveVersionId(version);
  if (!VERSION_ID_PATTERN.test(resolved)) {
    const aliasHint =
      VERSION_ID_ALIAS_ENTRIES.length > 0
        ? ` Known aliases: ${VERSION_ID_ALIAS_ENTRIES.map(([alias, target]) => `${alias}→${target}`).join(', ')}.`
        : '';
    throw new Error(
      `Invalid version id "${version}". Expected v001-style format (v + three digits).${aliasHint}`,
    );
  }
};

export const getVersionPaths = (runsRoot: string, version: string): VersionPaths => {
  const resolvedVersion = resolveVersionId(version);
  validateVersionId(version);
  const versionDir = path.join(runsRoot, 'runs', resolvedVersion);
  return {
    version: resolvedVersion,
    versionDir,
    tracesDir: path.join(versionDir, 'traces'),
    reviewsDir: path.join(versionDir, 'reviews'),
    scorecardsDir: path.join(versionDir, 'scorecards'),
    patchPlanPath: path.join(versionDir, 'patch_plan.md'),
    changelogPath: path.join(versionDir, 'changelog.md'),
    developerNotesPath: path.join(versionDir, 'developer_notes.md'),
    acceptancePath: path.join(versionDir, 'acceptance.md'),
  };
};

const markdownPath = (paths: VersionPaths, file: VersionMarkdownFile): string => {
  switch (file) {
    case 'patch_plan.md':
      return paths.patchPlanPath;
    case 'changelog.md':
      return paths.changelogPath;
    case 'developer_notes.md':
      return paths.developerNotesPath;
    case 'acceptance.md':
      return paths.acceptancePath;
  }
};

export const buildVersionSummaryRelativePath = (version: string): string =>
  path.join('runs', resolveVersionId(version), 'version_summary.json');

export interface RunVersionOptions {
  onExisting?: ArtifactWriteOptions['onExisting'];
  policyContext?: ArtifactWritePolicyContext;
}

export interface PersistVersionSummaryOptions {
  onExisting?: ArtifactWriteOptions['onExisting'];
  policyContext?: ArtifactWritePolicyContext;
}

export interface PersistVersionComparisonOptions {
  onExisting?: ArtifactWriteOptions['onExisting'];
  policyContext?: ArtifactWritePolicyContext;
}

const directoryExists = async (dirPath: string): Promise<boolean> => {
  try {
    const stats = await stat(dirPath);
    return stats.isDirectory();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

export const ensureVersionFolder = async (
  runsRoot: string,
  version: string,
): Promise<EnsureVersionResult> => {
  const paths = getVersionPaths(runsRoot, version);
  await mkdir(paths.tracesDir, { recursive: true });
  await mkdir(paths.reviewsDir, { recursive: true });
  await mkdir(paths.scorecardsDir, { recursive: true });

  const createdMarkdown: string[] = [];
  const preservedMarkdown: string[] = [];

  for (const file of VERSION_MARKDOWN_FILES) {
    const filePath = markdownPath(paths, file);
    if (await fileExists(filePath)) {
      preservedMarkdown.push(filePath);
      continue;
    }
    await writeFile(filePath, MARKDOWN_TEMPLATES[file], { encoding: 'utf8', flag: 'wx' });
    createdMarkdown.push(filePath);
  }

  return { paths, createdMarkdown, preservedMarkdown };
};

const createPersonaPolicy = (persona: LlmPlayerPersona, seed: string): HarnessPlayerPolicy => {
  const baselinePolicy = resolveBaselinePolicy(PERSONA_BASELINE_POLICY[persona], seed);
  return async (input) => {
    const decision = await awaitPolicyDecision(baselinePolicy(input));
    return {
      ...decision,
      reason: decision.reason ?? `${persona} deterministic local policy.`,
      decision_metadata: {
        ...decision.decision_metadata,
        persona,
        fallback_used: false,
      },
    };
  };
};

export const runVersion = async (
  runsRoot: string,
  version: string,
  specs: readonly VersionRunSpec[] = DEFAULT_VERSION_RUNS,
  options: RunVersionOptions = {},
): Promise<VersionRunOutput> => {
  const resolvedVersion = resolveVersionId(version);
  validateVersionId(version);
  await ensureVersionFolder(runsRoot, resolvedVersion);
  const runs: VersionRunResult[] = [];
  const saveOptions = {
    write: { onExisting: options.onExisting },
    policyContext: options.policyContext,
  };

  for (const spec of specs) {
    const playthrough = await runPlaythrough({
      seed: spec.seed,
      policyId: spec.persona,
      version: resolvedVersion,
      runsRoot,
      policy: createPersonaPolicy(spec.persona, spec.seed),
      onExisting: options.onExisting,
      policyContext: options.policyContext,
    });
    const tracePath = buildTraceRelativePath(resolvedVersion, spec.seed, spec.persona);
    const traceOnlyScorecard = deriveScorecardFromTrace(playthrough.trace, tracePath);
    const review = generateDeterministicReview({
      trace: playthrough.trace,
      scorecard: traceOnlyScorecard,
      persona: spec.persona as ReviewerPersona,
    });
    const reviewPath = buildReviewRelativePath(resolvedVersion, spec.seed, spec.persona);
    const scorecard = deriveScorecardFromTrace(playthrough.trace, tracePath, {
      scores: review.scores,
      review_path: reviewPath,
      review_id: `${spec.persona}:${spec.seed}`,
    });
    validateScorecard(scorecard);

    const scorecardAbsolutePath = path.join(
      runsRoot,
      buildScorecardRelativePath(resolvedVersion, spec.seed, spec.persona),
    );
    await writeArtifactFile(
      scorecardAbsolutePath,
      stringifyDeterministicJson(scorecard),
      { onExisting: 'overwrite' },
      {
        runsRoot,
        policyContext: options.policyContext,
        artifactLabel: buildScorecardRelativePath(resolvedVersion, spec.seed, spec.persona),
      },
    );

    await savePlaythroughReview(
      runsRoot,
      {
        ...review,
        trace_path: tracePath,
        scorecard_path: buildScorecardRelativePath(resolvedVersion, spec.seed, spec.persona),
      },
      saveOptions,
    );

    runs.push({
      seed: spec.seed,
      persona: spec.persona,
      result: playthrough.trace.result,
      turns: playthrough.trace.turns,
      tracePath: playthrough.artifacts.tracePath,
      reviewPath: path.join(runsRoot, reviewPath),
      scorecardPath: playthrough.artifacts.scorecardPath,
      reviewerScores: scorecard.reviewer_scores,
    });
  }

  return { version: resolvedVersion, runs };
};

export const persistVersionSummary = async (
  runsRoot: string,
  version: string,
  specs: readonly VersionRunSpec[] = DEFAULT_VERSION_RUNS,
  options: PersistVersionSummaryOptions = {},
): Promise<{ summary: VersionSummary; summaryPath: string }> => {
  const summary = await summarizeVersion(runsRoot, version, specs);
  const summaryRelative = buildVersionSummaryRelativePath(summary.version);
  const summaryAbsolute = path.join(runsRoot, summaryRelative);
  await writeArtifactFile(
    summaryAbsolute,
    stringifyDeterministicJson(summary),
    { onExisting: options.onExisting },
    {
      runsRoot,
      policyContext: options.policyContext,
      artifactLabel: summaryRelative,
    },
  );
  return { summary, summaryPath: summaryAbsolute };
};

export const persistVersionComparison = async (
  runsRoot: string,
  baseVersion: string,
  targetVersion: string,
  options: PersistVersionComparisonOptions = {},
): Promise<{
  comparison: VersionComparison;
  jsonPath: string;
  markdownPath: string;
}> => {
  const comparison = await compareVersions(runsRoot, baseVersion, targetVersion);
  const { jsonPath, markdownPath } = buildComparisonRelativePaths(
    comparison.baseVersion,
    comparison.targetVersion,
  );
  const writeOpts = { onExisting: options.onExisting };
  const context = {
    runsRoot,
    policyContext: options.policyContext,
  };
  await mkdir(path.join(runsRoot, 'runs', 'comparisons'), { recursive: true });
  await writeArtifactFile(
    path.join(runsRoot, jsonPath),
    stringifyDeterministicJson(comparison),
    writeOpts,
    { ...context, artifactLabel: jsonPath },
  );
  await writeArtifactFile(
    path.join(runsRoot, markdownPath),
    renderComparisonMarkdown(comparison),
    writeOpts,
    { ...context, artifactLabel: markdownPath },
  );
  return {
    comparison,
    jsonPath,
    markdownPath,
  };
};

const expectedArtifactPaths = (
  version: string,
  specs: readonly VersionRunSpec[],
): Record<VersionArtifactDir, string[]> => ({
  traces: specs.map((spec) => buildTraceRelativePath(version, spec.seed, spec.persona)),
  reviews: specs.map((spec) => buildReviewRelativePath(version, spec.seed, spec.persona)),
  scorecards: specs.map((spec) => buildScorecardRelativePath(version, spec.seed, spec.persona)),
});

const coverageFor = async (
  runsRoot: string,
  expected: string[],
): Promise<{ expected: number; present: number; missing: string[] }> => {
  const missing: string[] = [];
  for (const relativePath of expected) {
    if (!(await fileExists(path.join(runsRoot, relativePath)))) {
      missing.push(relativePath);
    }
  }
  return {
    expected: expected.length,
    present: expected.length - missing.length,
    missing,
  };
};

const markdownCoverage = async (
  paths: VersionPaths,
): Promise<ArtifactCoverage['markdown']> => {
  const coverage = {} as ArtifactCoverage['markdown'];
  for (const file of VERSION_MARKDOWN_FILES) {
    const filePath = markdownPath(paths, file);
    const present = await fileExists(filePath);
    const contents = present ? await readFile(filePath, 'utf8') : '';
    coverage[file] = {
      path: filePath,
      present,
      nonEmpty: contents.trim().length > 0,
    };
  }
  return coverage;
};

const readJsonFile = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, 'utf8')) as T;

const listScorecards = async (paths: VersionPaths): Promise<PlaythroughScorecard[]> => {
  if (!(await directoryExists(paths.scorecardsDir))) {
    throw new Error(`Version does not exist or has no scorecards directory: ${paths.version}`);
  }
  const names = (await readdir(paths.scorecardsDir)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(names.map((name) => readJsonFile<PlaythroughScorecard>(path.join(paths.scorecardsDir, name))));
};

const extractSection = (contents: string, heading: string): string => {
  const pattern = new RegExp(`## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
  const match = pattern.exec(contents);
  return match?.[1]?.toLowerCase() ?? '';
};

const readStatusFromSection = (section: string): VersionSummary['acceptance_status'] | null => {
  if (section.includes('status: accepted')) {
    return 'accepted';
  }
  if (section.includes('status: rejected')) {
    return 'rejected';
  }
  if (section.includes('status: blocked')) {
    return 'blocked';
  }
  if (section.includes('status: pending')) {
    return 'pending';
  }
  return null;
};

const readLegacyStatusLine = (contents: string): VersionSummary['acceptance_status'] | null => {
  const match = /^status:\s*(accepted|rejected|blocked|pending)\s*$/im.exec(contents);
  if (!match) {
    return null;
  }
  return match[1]!.toLowerCase() as VersionSummary['acceptance_status'];
};

const inferAcceptanceStatus = async (
  acceptancePath: string,
): Promise<VersionSummary['acceptance_status']> => {
  if (!(await fileExists(acceptancePath))) {
    return 'unknown';
  }
  const contents = await readFile(acceptancePath, 'utf8');
  const humanSection = extractSection(contents, 'Human decision');
  const humanStatus = readStatusFromSection(humanSection);
  if (humanStatus === 'accepted' || humanStatus === 'rejected') {
    return humanStatus;
  }
  if (humanStatus === 'blocked') {
    return 'blocked';
  }

  const machineSection = extractSection(contents, 'Machine recommendation');
  if (machineSection.includes('status: blocked')) {
    return 'blocked';
  }
  if (machineSection.includes('status: fail')) {
    return 'rejected';
  }

  return readLegacyStatusLine(contents) ?? 'unknown';
};

export const summarizeVersion = async (
  runsRoot: string,
  version: string,
  specs: readonly VersionRunSpec[] = DEFAULT_VERSION_RUNS,
): Promise<VersionSummary> => {
  const paths = getVersionPaths(runsRoot, version);
  if (!(await directoryExists(paths.versionDir))) {
    throw new Error(`Version does not exist: ${version}`);
  }

  const expected = expectedArtifactPaths(version, specs);
  const artifact_coverage: ArtifactCoverage = {
    traces: await coverageFor(runsRoot, expected.traces),
    reviews: await coverageFor(runsRoot, expected.reviews),
    scorecards: await coverageFor(runsRoot, expected.scorecards),
    markdown: await markdownCoverage(paths),
  };
  const scorecards = await listScorecards(paths);
  const runs = scorecards.map((scorecard) => ({
    seed: scorecard.seed,
    persona: scorecard.persona,
    result: scorecard.result,
    turns: scorecard.turns,
    metrics: {
      floors_reached: scorecard.floors_reached,
      damage_taken: scorecard.damage_taken,
      items_used: scorecard.items_used,
      enemies_defeated: scorecard.enemies_defeated,
      invalid_actions: scorecard.invalid_actions,
      softlocks: scorecard.softlocks,
    },
    reviewer_scores: scorecard.reviewer_scores,
    trace_path: scorecard.trace_path,
    ...(scorecard.review_path ? { review_path: scorecard.review_path } : {}),
    scorecard_path: buildScorecardRelativePath(version, scorecard.seed, scorecard.persona),
  }));
  const missingCount =
    artifact_coverage.traces.missing.length +
    artifact_coverage.reviews.missing.length +
    artifact_coverage.scorecards.missing.length;

  return {
    version,
    versionDir: paths.versionDir,
    status: missingCount === 0 ? 'complete' : 'partial',
    artifact_coverage,
    runs,
    links: {
      patch_plan: paths.patchPlanPath,
      changelog: paths.changelogPath,
      developer_notes: paths.developerNotesPath,
      acceptance: paths.acceptancePath,
    },
    acceptance_status: await inferAcceptanceStatus(paths.acceptancePath),
  };
};

const sumMetric = (
  runs: readonly VersionSummaryRun[],
  metric: keyof VersionSummaryRun['metrics'],
): number => runs.reduce((total, run) => total + run.metrics[metric], 0);

const averageReviewerScore = (
  runs: readonly VersionSummaryRun[],
  metric: keyof ReviewerScores,
): number => {
  const values = runs
    .map((run) => run.reviewer_scores[metric])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (values.length === 0) {
    return 0;
  }
  return Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(2));
};

const delta = (base: number, target: number): MetricDelta => ({
  base,
  target,
  delta: Number((target - base).toFixed(2)),
});

const allMissing = (summary: VersionSummary): string[] => [
  ...summary.artifact_coverage.traces.missing,
  ...summary.artifact_coverage.reviews.missing,
  ...summary.artifact_coverage.scorecards.missing,
  ...VERSION_MARKDOWN_FILES.filter(
    (file) => !summary.artifact_coverage.markdown[file].present,
  ).map((file) => path.join('runs', summary.version, file)),
];

export const compareVersions = async (
  runsRoot: string,
  baseVersion: string,
  targetVersion: string,
): Promise<VersionComparison> => {
  const base = await summarizeVersion(runsRoot, baseVersion);
  const target = await summarizeVersion(runsRoot, targetVersion);
  const objectiveMetricKeys = [
    'turns',
    'floors_reached',
    'damage_taken',
    'items_used',
    'enemies_defeated',
    'invalid_actions',
    'softlocks',
  ] as const;

  const objective_metric_deltas: Record<string, MetricDelta> = {};
  for (const metric of objectiveMetricKeys) {
    const baseValue =
      metric === 'turns'
        ? base.runs.reduce((total, run) => total + run.turns, 0)
        : sumMetric(base.runs, metric);
    const targetValue =
      metric === 'turns'
        ? target.runs.reduce((total, run) => total + run.turns, 0)
        : sumMetric(target.runs, metric);
    objective_metric_deltas[metric] = delta(baseValue, targetValue);
  }

  const reviewerScoreKeys = [
    'fun',
    'clarity',
    'fairness',
    'tactical_depth',
    'replay_value',
  ] as const;
  const reviewer_score_deltas = {} as Record<keyof ReviewerScores, MetricDelta>;
  for (const metric of reviewerScoreKeys) {
    reviewer_score_deltas[metric] = delta(
      averageReviewerScore(base.runs, metric),
      averageReviewerScore(target.runs, metric),
    );
  }

  const missingBase = allMissing(base);
  const missingTarget = allMissing(target);
  const baseBalance = await loadBalanceSummary(runsRoot, baseVersion);
  const targetBalance = await loadBalanceSummary(runsRoot, targetVersion);
  const balance_comparison =
    baseBalance && targetBalance
      ? compareBalanceSummaries(baseBalance, targetBalance)
      : undefined;

  const interpretation =
    missingBase.length > 0 || missingTarget.length > 0
      ? 'One or both versions are missing expected artifacts; compare gameplay metrics only after evidence coverage is complete.'
      : balance_comparison && balance_comparison.newly_problematic_runs.length > 0
        ? balance_comparison.interpretation
        : objective_metric_deltas.invalid_actions.delta > 0 || objective_metric_deltas.softlocks.delta > 0
          ? 'Target version regressed on protocol stability metrics and needs review before acceptance.'
          : balance_comparison &&
              (balance_comparison.aggregate_metric_deltas.abort_count.delta > 0 ||
                balance_comparison.aggregate_metric_deltas.softlock_count.delta > 0)
            ? balance_comparison.interpretation
            : reviewer_score_deltas.fun.delta > 0 || reviewer_score_deltas.clarity.delta > 0
              ? 'Target version improves at least one reviewer-facing score with complete evidence coverage.'
              : balance_comparison
                ? balance_comparison.interpretation
                : 'Target version has complete evidence coverage with no clear reviewer-score improvement.';

  return {
    baseVersion,
    targetVersion,
    counts: {
      baseRuns: base.runs.length,
      targetRuns: target.runs.length,
      baseMissingArtifacts: missingBase.length,
      targetMissingArtifacts: missingTarget.length,
    },
    objective_metric_deltas,
    reviewer_score_deltas,
    missing_artifacts: {
      base: missingBase,
      target: missingTarget,
    },
    ...(balance_comparison ? { balance_comparison } : {}),
    interpretation,
  };
};
