import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadBalanceSummary, type BalanceSummary } from './balance-tuning.js';
import { stringifyDeterministicJson } from './json.js';
import {
  buildVersionSummaryRelativePath,
  VERSION_ID_PATTERN,
  type VersionSummary,
  type VersionSummaryRun,
} from './version-loop.js';

export const LONGITUDINAL_BENCHMARK_SCHEMA_VERSION = 1 as const;
export const DEFAULT_LONGITUDINAL_BENCHMARK_PATH =
  'runs/benchmarks/PHASE-23C/longitudinal_summary.json';

export type LongitudinalEvidenceStatus = 'complete' | 'partial' | 'missing';
export type LongitudinalTrendLabel = 'improved' | 'regressed' | 'unchanged' | 'missing';
export type LongitudinalAcceptanceStatus =
  | VersionSummary['acceptance_status']
  | 'pass'
  | 'fail'
  | 'warning'
  | 'missing'
  | 'unknown';

export interface LongitudinalMetricSource {
  version_summary?: string;
  balance_summary?: string;
  acceptance?: string;
  traces: string[];
  scorecards: string[];
}

export interface LongitudinalEvidenceState {
  status: LongitudinalEvidenceStatus;
  missing_reasons: string[];
  source_paths: LongitudinalMetricSource;
}

export interface LongitudinalOutcomeMetrics {
  total_runs: number;
  completed_runs: number;
  completion_rate: number;
  win_count: number;
  loss_count: number;
  aborted_count: number;
  win_rate: number;
}

export interface LongitudinalAverageMetrics {
  turns: number;
  damage_taken: number;
  items_used: number;
  invalid_actions: number;
  softlocks: number;
}

export interface LongitudinalScorecardAverages {
  fun: number | null;
  clarity: number | null;
  fairness: number | null;
  tactical_depth: number | null;
  replay_value: number | null;
}

export interface LongitudinalVersionSummary {
  version: string;
  evidence_state: LongitudinalEvidenceState;
  acceptance_status: LongitudinalAcceptanceStatus;
  machine_acceptance_status: LongitudinalAcceptanceStatus;
  human_acceptance_status: LongitudinalAcceptanceStatus;
  outcome_metrics?: LongitudinalOutcomeMetrics;
  average_metrics?: LongitudinalAverageMetrics;
  scorecard_averages?: LongitudinalScorecardAverages;
  balance_metrics?: {
    total_runs: number;
    problem_run_count: number;
    win_rate: number;
    softlock_count: number;
    average_turns: number;
    average_damage_taken: number;
    average_items_used: number;
    average_invalid_actions: number;
  };
}

export interface LongitudinalMetricComparison {
  metric: string;
  direction_rule: 'higher_is_better' | 'lower_is_better';
  label: LongitudinalTrendLabel;
  base?: number;
  target?: number;
  delta?: number;
  missing_reasons: string[];
  evidence_paths: string[];
}

export interface LongitudinalAcceptanceComparison {
  base: LongitudinalAcceptanceStatus;
  target: LongitudinalAcceptanceStatus;
  label: LongitudinalTrendLabel;
  missing_reasons: string[];
  evidence_paths: string[];
}

export interface LongitudinalAdjacentComparison {
  base_version: string;
  target_version: string;
  metrics: LongitudinalMetricComparison[];
  acceptance_status: LongitudinalAcceptanceComparison;
}

export interface LongitudinalBenchmarkReport {
  schema_version: typeof LONGITUDINAL_BENCHMARK_SCHEMA_VERSION;
  generated_at: string;
  runs_root: string;
  versions_requested: string[];
  benchmark_note: string;
  versions: LongitudinalVersionSummary[];
  comparisons: LongitudinalAdjacentComparison[];
  missing_evidence: string[];
}

export interface BuildLongitudinalBenchmarkOptions {
  versions?: readonly string[];
}

const round2 = (value: number): number => Number(value.toFixed(2));
const round4 = (value: number): number => Number(value.toFixed(4));

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

const listVersionIds = async (runsRoot: string): Promise<string[]> => {
  const runsDir = path.join(runsRoot, 'runs');
  let entries: string[];
  try {
    entries = await readdir(runsDir);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  return entries.filter((entry) => VERSION_ID_PATTERN.test(entry)).sort();
};

const readJsonFile = async <T>(filePath: string): Promise<T | null> => {
  if (!(await fileExists(filePath))) {
    return null;
  }
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
};

const average = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return round2(values.reduce((total, value) => total + value, 0) / values.length);
};

const averageNullable = (values: ReadonlyArray<number | null | undefined>): number | null => {
  const numeric = values.filter((value): value is number => typeof value === 'number');
  return numeric.length === 0 ? null : average(numeric);
};

const uniqueSorted = (values: readonly string[]): string[] => [...new Set(values)].sort();

const parseStatusFromSection = (
  contents: string,
  heading: string,
): LongitudinalAcceptanceStatus => {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionMatch = contents.match(
    new RegExp(`## ${escapedHeading}\\n([\\s\\S]*?)(?:\\n## |$)`, 'i'),
  );
  const statusMatch = sectionMatch?.[1]?.match(
    /^Status:\s*(accepted|rejected|pending|blocked|pass|fail|warning|unknown)\s*$/im,
  );
  return (statusMatch?.[1]?.toLowerCase() as LongitudinalAcceptanceStatus | undefined) ?? 'unknown';
};

const readAcceptanceStatuses = async (
  acceptancePath: string,
): Promise<{
  combined: LongitudinalAcceptanceStatus;
  machine: LongitudinalAcceptanceStatus;
  human: LongitudinalAcceptanceStatus;
}> => {
  if (!(await fileExists(acceptancePath))) {
    return { combined: 'missing', machine: 'missing', human: 'missing' };
  }
  const contents = await readFile(acceptancePath, 'utf8');
  const human = parseStatusFromSection(contents, 'Human decision');
  const machine = parseStatusFromSection(contents, 'Machine recommendation');
  return {
    combined: human !== 'unknown' ? human : machine,
    machine,
    human,
  };
};

const buildEvidenceState = async (
  runsRoot: string,
  version: string,
  versionSummary: VersionSummary | null,
  balanceSummary: BalanceSummary | null,
): Promise<LongitudinalEvidenceState> => {
  const versionSummaryPath = buildVersionSummaryRelativePath(version);
  const balanceSummaryPath = path.join('runs', version, 'balance_summary.json');
  const acceptancePath = path.join('runs', version, 'acceptance.md');
  const traces = uniqueSorted([
    ...(versionSummary?.runs.map((run) => run.trace_path) ?? []),
    ...(balanceSummary?.runs.map((run) => run.trace_path) ?? []),
  ]);
  const scorecards = uniqueSorted([
    ...(versionSummary?.runs.map((run) => run.scorecard_path) ?? []),
    ...(balanceSummary?.runs.map((run) => run.scorecard_path) ?? []),
  ]);
  const missingReasons: string[] = [];

  if (!versionSummary) {
    missingReasons.push(`${version}: missing ${versionSummaryPath}`);
  }
  if (!balanceSummary) {
    missingReasons.push(`${version}: missing ${balanceSummaryPath}`);
  }
  if (!(await fileExists(path.join(runsRoot, acceptancePath)))) {
    missingReasons.push(`${version}: missing ${acceptancePath}`);
  }
  for (const tracePath of traces) {
    if (!(await fileExists(path.join(runsRoot, tracePath)))) {
      missingReasons.push(`${version}: missing trace ${tracePath}`);
    }
  }
  for (const scorecardPath of scorecards) {
    if (!(await fileExists(path.join(runsRoot, scorecardPath)))) {
      missingReasons.push(`${version}: missing scorecard ${scorecardPath}`);
    }
  }

  const status: LongitudinalEvidenceStatus =
    missingReasons.length === 0 ? 'complete' : versionSummary || balanceSummary ? 'partial' : 'missing';

  return {
    status,
    missing_reasons: missingReasons,
    source_paths: {
      ...(versionSummary ? { version_summary: versionSummaryPath } : {}),
      ...(balanceSummary ? { balance_summary: balanceSummaryPath } : {}),
      acceptance: acceptancePath,
      traces,
      scorecards,
    },
  };
};

const buildOutcomeMetrics = (runs: readonly VersionSummaryRun[]): LongitudinalOutcomeMetrics => {
  const totalRuns = runs.length;
  const winCount = runs.filter((run) => run.result === 'WIN').length;
  const lossCount = runs.filter((run) => run.result === 'LOSS').length;
  const abortedCount = runs.filter((run) => run.result === 'ABORTED').length;
  const completedRuns = winCount + lossCount;
  return {
    total_runs: totalRuns,
    completed_runs: completedRuns,
    completion_rate: totalRuns === 0 ? 0 : round4(completedRuns / totalRuns),
    win_count: winCount,
    loss_count: lossCount,
    aborted_count: abortedCount,
    win_rate: totalRuns === 0 ? 0 : round4(winCount / totalRuns),
  };
};

const buildAverageMetrics = (runs: readonly VersionSummaryRun[]): LongitudinalAverageMetrics => ({
  turns: average(runs.map((run) => run.turns)),
  damage_taken: average(runs.map((run) => run.metrics.damage_taken)),
  items_used: average(runs.map((run) => run.metrics.items_used)),
  invalid_actions: average(runs.map((run) => run.metrics.invalid_actions)),
  softlocks: average(runs.map((run) => run.metrics.softlocks)),
});

const buildScorecardAverages = (
  runs: readonly VersionSummaryRun[],
): LongitudinalScorecardAverages => ({
  fun: averageNullable(runs.map((run) => run.reviewer_scores.fun)),
  clarity: averageNullable(runs.map((run) => run.reviewer_scores.clarity)),
  fairness: averageNullable(runs.map((run) => run.reviewer_scores.fairness)),
  tactical_depth: averageNullable(runs.map((run) => run.reviewer_scores.tactical_depth)),
  replay_value: averageNullable(runs.map((run) => run.reviewer_scores.replay_value)),
});

const buildVersion = async (
  runsRoot: string,
  version: string,
): Promise<LongitudinalVersionSummary> => {
  const versionSummaryPath = path.join(runsRoot, buildVersionSummaryRelativePath(version));
  const versionSummary = await readJsonFile<VersionSummary>(versionSummaryPath);
  const balanceSummary = (await loadBalanceSummary(runsRoot, version)) ?? null;
  const acceptancePath = path.join('runs', version, 'acceptance.md');
  const acceptance = await readAcceptanceStatuses(path.join(runsRoot, acceptancePath));
  const evidenceState = await buildEvidenceState(runsRoot, version, versionSummary, balanceSummary);
  const versionReport: LongitudinalVersionSummary = {
    version,
    evidence_state: evidenceState,
    acceptance_status: acceptance.combined,
    machine_acceptance_status: acceptance.machine,
    human_acceptance_status: acceptance.human,
  };

  const traceBacked = evidenceState.source_paths.traces.length > 0;
  const hasMissingTrace = evidenceState.missing_reasons.some((reason) =>
    reason.includes('missing trace'),
  );
  const hasMissingScorecard = evidenceState.missing_reasons.some((reason) =>
    reason.includes('missing scorecard'),
  );

  if (versionSummary && traceBacked && !hasMissingTrace && !hasMissingScorecard) {
    versionReport.outcome_metrics = buildOutcomeMetrics(versionSummary.runs);
    versionReport.average_metrics = buildAverageMetrics(versionSummary.runs);
    versionReport.scorecard_averages = buildScorecardAverages(versionSummary.runs);
  }

  if (balanceSummary && !hasMissingTrace && !hasMissingScorecard) {
    versionReport.balance_metrics = {
      total_runs: balanceSummary.aggregates.total_runs,
      problem_run_count: balanceSummary.problem_run_count,
      win_rate: balanceSummary.aggregates.win_rate,
      softlock_count: balanceSummary.aggregates.softlock_count,
      average_turns: balanceSummary.aggregates.average_turns,
      average_damage_taken: balanceSummary.aggregates.average_damage_taken,
      average_items_used: balanceSummary.aggregates.average_items_used,
      average_invalid_actions: balanceSummary.aggregates.average_invalid_actions,
    };
  }

  return versionReport;
};

const valueAtPath = (version: LongitudinalVersionSummary, metric: string): number | undefined => {
  const [group, key] = metric.split('.');
  if (group === 'outcome_metrics') {
    return version.outcome_metrics?.[key as keyof LongitudinalOutcomeMetrics];
  }
  if (group === 'average_metrics') {
    return version.average_metrics?.[key as keyof LongitudinalAverageMetrics];
  }
  if (group === 'scorecard_averages') {
    const value = version.scorecard_averages?.[key as keyof LongitudinalScorecardAverages];
    return value ?? undefined;
  }
  if (group === 'balance_metrics') {
    return version.balance_metrics?.[key as keyof NonNullable<LongitudinalVersionSummary['balance_metrics']>];
  }
  return undefined;
};

const directionRules: Array<{
  metric: string;
  direction_rule: LongitudinalMetricComparison['direction_rule'];
}> = [
  { metric: 'outcome_metrics.completion_rate', direction_rule: 'higher_is_better' },
  { metric: 'outcome_metrics.win_count', direction_rule: 'higher_is_better' },
  { metric: 'outcome_metrics.loss_count', direction_rule: 'lower_is_better' },
  { metric: 'outcome_metrics.aborted_count', direction_rule: 'lower_is_better' },
  { metric: 'average_metrics.turns', direction_rule: 'lower_is_better' },
  { metric: 'average_metrics.damage_taken', direction_rule: 'lower_is_better' },
  { metric: 'average_metrics.items_used', direction_rule: 'higher_is_better' },
  { metric: 'average_metrics.invalid_actions', direction_rule: 'lower_is_better' },
  { metric: 'average_metrics.softlocks', direction_rule: 'lower_is_better' },
  { metric: 'scorecard_averages.fun', direction_rule: 'higher_is_better' },
  { metric: 'scorecard_averages.clarity', direction_rule: 'higher_is_better' },
  { metric: 'scorecard_averages.fairness', direction_rule: 'higher_is_better' },
  { metric: 'scorecard_averages.tactical_depth', direction_rule: 'higher_is_better' },
  { metric: 'scorecard_averages.replay_value', direction_rule: 'higher_is_better' },
  { metric: 'balance_metrics.win_rate', direction_rule: 'higher_is_better' },
  { metric: 'balance_metrics.problem_run_count', direction_rule: 'lower_is_better' },
  { metric: 'balance_metrics.softlock_count', direction_rule: 'lower_is_better' },
  { metric: 'balance_metrics.average_turns', direction_rule: 'lower_is_better' },
  { metric: 'balance_metrics.average_damage_taken', direction_rule: 'lower_is_better' },
  { metric: 'balance_metrics.average_items_used', direction_rule: 'higher_is_better' },
  { metric: 'balance_metrics.average_invalid_actions', direction_rule: 'lower_is_better' },
];

const compareMetric = (
  base: LongitudinalVersionSummary,
  target: LongitudinalVersionSummary,
  metric: string,
  directionRule: LongitudinalMetricComparison['direction_rule'],
): LongitudinalMetricComparison => {
  const baseValue = valueAtPath(base, metric);
  const targetValue = valueAtPath(target, metric);
  const evidencePaths = uniqueSorted([
    ...base.evidence_state.source_paths.traces,
    ...base.evidence_state.source_paths.scorecards,
    ...target.evidence_state.source_paths.traces,
    ...target.evidence_state.source_paths.scorecards,
  ]);
  if (baseValue === undefined || targetValue === undefined) {
    return {
      metric,
      direction_rule: directionRule,
      label: 'missing',
      missing_reasons: [
        ...(baseValue === undefined ? [`${base.version}: missing metric ${metric}`] : []),
        ...(targetValue === undefined ? [`${target.version}: missing metric ${metric}`] : []),
      ],
      evidence_paths: evidencePaths,
    };
  }
  const delta = round4(targetValue - baseValue);
  const label: LongitudinalTrendLabel =
    delta === 0
      ? 'unchanged'
      : directionRule === 'higher_is_better'
        ? delta > 0
          ? 'improved'
          : 'regressed'
        : delta < 0
          ? 'improved'
          : 'regressed';
  return {
    metric,
    direction_rule: directionRule,
    label,
    base: baseValue,
    target: targetValue,
    delta,
    missing_reasons: [],
    evidence_paths: evidencePaths,
  };
};

const acceptanceRank = (status: LongitudinalAcceptanceStatus): number | null => {
  switch (status) {
    case 'accepted':
      return 4;
    case 'pass':
      return 3;
    case 'pending':
    case 'warning':
      return 2;
    case 'blocked':
    case 'rejected':
    case 'fail':
      return 1;
    case 'missing':
    case 'unknown':
      return null;
  }
};

const compareAcceptance = (
  base: LongitudinalVersionSummary,
  target: LongitudinalVersionSummary,
): LongitudinalAcceptanceComparison => {
  const baseRank = acceptanceRank(base.acceptance_status);
  const targetRank = acceptanceRank(target.acceptance_status);
  const evidencePaths = uniqueSorted(
    [base.evidence_state.source_paths.acceptance, target.evidence_state.source_paths.acceptance].filter(
      (value): value is string => Boolean(value),
    ),
  );
  if (baseRank === null || targetRank === null) {
    return {
      base: base.acceptance_status,
      target: target.acceptance_status,
      label: 'missing',
      missing_reasons: [
        ...(baseRank === null ? [`${base.version}: missing acceptance status`] : []),
        ...(targetRank === null ? [`${target.version}: missing acceptance status`] : []),
      ],
      evidence_paths: evidencePaths,
    };
  }
  return {
    base: base.acceptance_status,
    target: target.acceptance_status,
    label:
      targetRank === baseRank ? 'unchanged' : targetRank > baseRank ? 'improved' : 'regressed',
    missing_reasons: [],
    evidence_paths: evidencePaths,
  };
};

const compareVersions = (
  base: LongitudinalVersionSummary,
  target: LongitudinalVersionSummary,
): LongitudinalAdjacentComparison => ({
  base_version: base.version,
  target_version: target.version,
  metrics: directionRules.map(({ metric, direction_rule }) =>
    compareMetric(base, target, metric, direction_rule),
  ),
  acceptance_status: compareAcceptance(base, target),
});

export const buildLongitudinalBenchmarkReport = async (
  runsRoot: string,
  options: BuildLongitudinalBenchmarkOptions = {},
): Promise<LongitudinalBenchmarkReport> => {
  const versions = options.versions?.length ? [...options.versions] : await listVersionIds(runsRoot);
  const versionReports = await Promise.all(
    versions.map((version) => buildVersion(runsRoot, version)),
  );
  return {
    schema_version: LONGITUDINAL_BENCHMARK_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    runs_root: runsRoot,
    versions_requested: versions,
    benchmark_note:
      'Advisory longitudinal benchmark only. Human acceptance remains governed by acceptance artifacts and trace inspection.',
    versions: versionReports,
    comparisons: versionReports.slice(1).map((version, index) =>
      compareVersions(versionReports[index]!, version),
    ),
    missing_evidence: versionReports.flatMap((version) => version.evidence_state.missing_reasons),
  };
};

export const writeLongitudinalBenchmarkReport = async (
  report: LongitudinalBenchmarkReport,
  outPath: string,
): Promise<string> => {
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${stringifyDeterministicJson(report)}\n`, 'utf8');
  return outPath;
};
