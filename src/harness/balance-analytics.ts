import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from './json.js';
import {
  buildBalanceSummaryRelativePath,
  compareBalanceSummaries,
  loadBalanceSummary,
  type BalanceAggregateMetrics,
  type BalanceRunRecord,
  type BalanceSummary,
  type BalanceSummaryComparison,
  type TacticalDepthAggregateMetrics,
} from './balance-tuning.js';
import { VERSION_ID_PATTERN, type VersionSummary } from './version-loop.js';
import type { BaselinePolicyId } from './policy-registry.js';
import type { PlaythroughScorecard, ProblemRunCategory, ProblemRunCategoryKind } from './types.js';

export const BALANCE_ANALYTICS_SCHEMA_VERSION = 1 as const;
export const BALANCE_ANALYTICS_REPORT_PATH = 'runs/analytics/balance_analytics.json';
export const BALANCE_LEADERBOARD_PATH = 'runs/analytics/balance_leaderboard.json';

export interface BalanceAnalyticsCohort {
  key: string;
  label: string;
  total_runs: number;
  win_count: number;
  problem_run_count: number;
  problem_rate: number;
  win_rate: number;
  average_turns: number;
  average_damage_taken: number;
  average_items_used: number;
  average_invalid_actions: number;
  softlock_count: number;
  tactical_depth_summary: TacticalDepthAggregateMetrics;
  problem_category_counts: Record<string, number>;
  evidence_paths: string[];
}

export interface BalanceAnalyticsProblemRun {
  version: string;
  seed: string;
  policy: BaselinePolicyId;
  challenge_mode: string;
  result: BalanceRunRecord['result'];
  problem_reasons: string[];
  problem_categories: ProblemRunCategory[];
  primary_category: ProblemRunCategoryKind | 'none';
  trace_path: string;
  scorecard_path: string;
  metrics: BalanceRunRecord['metrics'];
}

export interface BalanceVersionAnalytics {
  version: string;
  status: 'complete' | 'missing_balance_summary';
  advisory_note: string;
  source_paths: {
    balance_summary: string;
    acceptance?: string;
  };
  acceptance_status: VersionSummary['acceptance_status'] | 'unknown';
  aggregates?: BalanceAggregateMetrics;
  tactical_depth_summary?: TacticalDepthAggregateMetrics;
  problem_category_counts: Record<string, number>;
  repeated_problem_seeds: string[];
  cohorts: {
    by_seed: BalanceAnalyticsCohort[];
    by_policy: BalanceAnalyticsCohort[];
    by_challenge_mode: BalanceAnalyticsCohort[];
    by_problem_category: BalanceAnalyticsCohort[];
  };
  problem_runs: BalanceAnalyticsProblemRun[];
}

export interface BalanceLeaderboardEntry {
  rank: number;
  version: string;
  advisory_score: number;
  win_rate: number;
  problem_run_count: number;
  problem_rate: number;
  softlock_count: number;
  average_invalid_actions: number;
  acceptance_status: VersionSummary['acceptance_status'] | 'unknown';
  evidence_paths: {
    balance_summary: string;
    analytics_report: string;
    acceptance?: string;
    traces: string[];
    scorecards: string[];
  };
  advisory_note: string;
}

export interface BalanceAnalyticsVersionDelta {
  baseVersion: string;
  targetVersion: string;
  comparison?: BalanceSummaryComparison;
  missing_data: string[];
}

export interface BalanceAnalyticsReport {
  schema_version: typeof BALANCE_ANALYTICS_SCHEMA_VERSION;
  generated_at: string;
  runs_root: string;
  advisory_only: true;
  versions: BalanceVersionAnalytics[];
  leaderboard: BalanceLeaderboardEntry[];
  version_deltas: BalanceAnalyticsVersionDelta[];
  missing_data: string[];
}

export interface BuildBalanceAnalyticsOptions {
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

const average = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return round2(values.reduce((total, value) => total + value, 0) / values.length);
};

const emptyTacticalDepthSummary = (): TacticalDepthAggregateMetrics => ({
  average_enemy_pressure_events: 0,
  average_enemy_pressure_per_turn: 0,
  average_navigation_friction_turns: 0,
  average_tactical_item_use_rate: 0,
  average_trap_resource_pressure_events: 0,
  average_content_interaction_events: 0,
  average_scenario_depth_signals: 0,
});

const aggregateRunTacticalDepth = (
  runs: readonly BalanceAnalyticsRunRecord[],
): TacticalDepthAggregateMetrics => {
  const metrics = runs
    .map((run) => run.metrics.tactical_depth)
    .filter((entry): entry is NonNullable<BalanceRunRecord['metrics']['tactical_depth']> =>
      entry !== undefined,
    );
  if (metrics.length === 0) {
    return emptyTacticalDepthSummary();
  }
  return {
    average_enemy_pressure_events: average(metrics.map((entry) => entry.enemy_pressure_events)),
    average_enemy_pressure_per_turn: average(
      metrics.map((entry) => entry.enemy_pressure_per_turn),
    ),
    average_navigation_friction_turns: average(
      metrics.map((entry) => entry.navigation_friction_turns),
    ),
    average_tactical_item_use_rate: average(metrics.map((entry) => entry.tactical_item_use_rate)),
    average_trap_resource_pressure_events: average(
      metrics.map((entry) => entry.trap_resource_pressure_events),
    ),
    average_content_interaction_events: average(
      metrics.map((entry) => entry.content_interaction_events),
    ),
    average_scenario_depth_signals: average(metrics.map((entry) => entry.scenario_depth_signals)),
  };
};

type BalanceAnalyticsRunRecord = BalanceRunRecord & {
  challenge_mode: string;
};

const DEFAULT_CHALLENGE_MODE = 'default';

const categoryKey = (category: ProblemRunCategory): string => category.category;

const countCategories = (runs: readonly BalanceRunRecord[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const run of runs) {
    for (const category of run.problem_categories ?? []) {
      const key = categoryKey(category);
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
};

const buildCohort = (
  key: string,
  label: string,
  runs: readonly BalanceAnalyticsRunRecord[],
): BalanceAnalyticsCohort => {
  const winCount = runs.filter((run) => run.result === 'WIN').length;
  const problemRunCount = runs.filter(
    (run) => run.problem || (run.problem_reasons?.length ?? 0) > 0,
  ).length;
  return {
    key,
    label,
    total_runs: runs.length,
    win_count: winCount,
    problem_run_count: problemRunCount,
    problem_rate: runs.length === 0 ? 0 : round4(problemRunCount / runs.length),
    win_rate: runs.length === 0 ? 0 : round4(winCount / runs.length),
    average_turns: average(runs.map((run) => run.metrics.turns)),
    average_damage_taken: average(runs.map((run) => run.metrics.damage_taken)),
    average_items_used: average(runs.map((run) => run.metrics.items_used)),
    average_invalid_actions: average(runs.map((run) => run.metrics.invalid_actions)),
    softlock_count: runs.reduce((total, run) => total + run.metrics.softlocks, 0),
    tactical_depth_summary: aggregateRunTacticalDepth(runs),
    problem_category_counts: countCategories(runs),
    evidence_paths: [...new Set(runs.flatMap((run) => [run.trace_path, run.scorecard_path]))].sort(),
  };
};

const groupBy = <T>(
  values: readonly T[],
  keyFor: (value: T) => string,
): Map<string, T[]> => {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  return grouped;
};

const buildCohorts = (
  runs: readonly BalanceAnalyticsRunRecord[],
): BalanceVersionAnalytics['cohorts'] => {
  const bySeed = [...groupBy(runs, (run) => run.seed).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([seed, seedRuns]) => buildCohort(seed, `Seed ${seed}`, seedRuns));
  const byPolicy = [...groupBy(runs, (run) => run.policy).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([policy, policyRuns]) => buildCohort(policy, `Policy ${policy}`, policyRuns));
  const byChallengeMode = [...groupBy(runs, (run) => run.challenge_mode).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([challengeMode, challengeRuns]) =>
      buildCohort(challengeMode, `Challenge mode ${challengeMode}`, challengeRuns),
    );

  const categoryRuns = new Map<string, BalanceAnalyticsRunRecord[]>();
  for (const run of runs) {
    for (const category of run.problem_categories ?? []) {
      const key = categoryKey(category);
      categoryRuns.set(key, [...(categoryRuns.get(key) ?? []), run]);
    }
  }

  const byProblemCategory = [...categoryRuns.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, categoryRunList]) =>
      buildCohort(category, `Problem category ${category}`, categoryRunList),
    );

  return {
    by_seed: bySeed,
    by_policy: byPolicy,
    by_challenge_mode: byChallengeMode,
    by_problem_category: byProblemCategory,
  };
};

const readChallengeModeForRun = async (
  runsRoot: string,
  run: BalanceRunRecord,
): Promise<string> => {
  try {
    const scorecard = JSON.parse(
      await readFile(path.join(runsRoot, run.scorecard_path), 'utf8'),
    ) as Pick<PlaythroughScorecard, 'challenge_mode'>;
    return scorecard.challenge_mode ?? DEFAULT_CHALLENGE_MODE;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return DEFAULT_CHALLENGE_MODE;
    }
    throw error;
  }
};

const enrichRunsWithChallengeMode = async (
  runsRoot: string,
  runs: readonly BalanceRunRecord[],
): Promise<BalanceAnalyticsRunRecord[]> =>
  Promise.all(
    runs.map(async (run) => ({
      ...run,
      challenge_mode: await readChallengeModeForRun(runsRoot, run),
    })),
  );

const readAcceptanceStatus = async (
  runsRoot: string,
  version: string,
): Promise<VersionSummary['acceptance_status'] | 'unknown'> => {
  const acceptancePath = path.join(runsRoot, 'runs', version, 'acceptance.md');
  if (!(await fileExists(acceptancePath))) {
    return 'unknown';
  }
  const contents = (await readFile(acceptancePath, 'utf8')).toLowerCase();
  const humanSection = /## human decision\s*\n([\s\S]*?)(?=\n## |$)/i.exec(contents)?.[1] ?? '';
  if (humanSection.includes('status: accepted')) {
    return 'accepted';
  }
  if (humanSection.includes('status: rejected')) {
    return 'rejected';
  }
  if (humanSection.includes('status: blocked')) {
    return 'blocked';
  }
  if (contents.includes('status: pending')) {
    return 'pending';
  }
  return 'unknown';
};

const advisoryNoteForVersion = (summary: BalanceSummary): string => {
  if (summary.problem_run_count > 0) {
    return 'Advisory: inspect problem runs and reviewer evidence before accepting this balance state.';
  }
  if (summary.aggregates.win_rate < 0.2) {
    return 'Advisory: low win rate may indicate difficulty regression; compare with reviewer evidence.';
  }
  return 'Advisory: metrics are stable, but reviewer critique remains required before acceptance.';
};

const buildVersionAnalytics = async (
  runsRoot: string,
  version: string,
): Promise<{ analytics: BalanceVersionAnalytics; missing?: string }> => {
  const balancePath = buildBalanceSummaryRelativePath(version);
  const acceptancePath = path.join('runs', version, 'acceptance.md');
  const acceptanceExists = await fileExists(path.join(runsRoot, acceptancePath));
  const acceptance_status = await readAcceptanceStatus(runsRoot, version);
  const summary = await loadBalanceSummary(runsRoot, version);

  if (!summary) {
    return {
      analytics: {
        version,
        status: 'missing_balance_summary',
        advisory_note: 'Advisory: balance analytics are unavailable until balance_summary.json exists.',
        source_paths: {
          balance_summary: balancePath,
          ...(acceptanceExists ? { acceptance: acceptancePath } : {}),
        },
        acceptance_status,
        problem_category_counts: {},
        tactical_depth_summary: emptyTacticalDepthSummary(),
        repeated_problem_seeds: [],
        cohorts: {
          by_seed: [],
          by_policy: [],
          by_challenge_mode: [],
          by_problem_category: [],
        },
        problem_runs: [],
      },
      missing: balancePath,
    };
  }

  const enrichedRuns = await enrichRunsWithChallengeMode(runsRoot, summary.runs);
  const challengeModeByRun = new Map(
    enrichedRuns.map((run) => [`${run.seed}::${run.policy}`, run.challenge_mode]),
  );

  return {
    analytics: {
      version,
      status: 'complete',
      advisory_note: advisoryNoteForVersion(summary),
      source_paths: {
        balance_summary: summary.summary_path,
        ...(acceptanceExists ? { acceptance: acceptancePath } : {}),
      },
      acceptance_status,
      aggregates: summary.aggregates,
      tactical_depth_summary: summary.tactical_depth_summary,
      problem_category_counts: summary.problem_category_counts,
      repeated_problem_seeds: summary.repeated_problem_seeds,
      cohorts: buildCohorts(enrichedRuns),
      problem_runs: summary.failed_runs.map((run) => ({
        version,
        seed: run.seed,
        policy: run.policy,
        challenge_mode:
          challengeModeByRun.get(`${run.seed}::${run.policy}`) ?? DEFAULT_CHALLENGE_MODE,
        result: run.result,
        problem_reasons: run.problem_reasons,
        problem_categories: run.problem_categories ?? [],
        primary_category: run.problem_categories?.[0]?.category ?? 'none',
        trace_path: run.trace_path,
        scorecard_path: path.join('runs', version, 'scorecards', `${run.seed}_${run.policy}.json`),
        metrics: run.metrics,
      })),
    },
  };
};

const advisoryScore = (analytics: BalanceVersionAnalytics): number => {
  const aggregates = analytics.aggregates;
  if (!aggregates) {
    return -1000;
  }
  const problemRate =
    aggregates.total_runs === 0 ? 0 : analytics.problem_runs.length / aggregates.total_runs;
  const stabilityPenalty =
    problemRate * 45 + aggregates.softlock_count * 1.2 + aggregates.average_invalid_actions * 8;
  const acceptanceBonus = analytics.acceptance_status === 'accepted' ? 4 : 0;
  return round2(aggregates.win_rate * 100 - stabilityPenalty + acceptanceBonus);
};

export const buildBalanceLeaderboard = (
  versions: readonly BalanceVersionAnalytics[],
): BalanceLeaderboardEntry[] => {
  const entries = versions.map((versionAnalytics) => {
    const aggregates = versionAnalytics.aggregates;
    const totalRuns = aggregates?.total_runs ?? 0;
    const problemRunCount = versionAnalytics.problem_runs.length;
    return {
      version: versionAnalytics.version,
      advisory_score: advisoryScore(versionAnalytics),
      win_rate: aggregates?.win_rate ?? 0,
      problem_run_count: problemRunCount,
      problem_rate: totalRuns === 0 ? 0 : round4(problemRunCount / totalRuns),
      softlock_count: aggregates?.softlock_count ?? 0,
      average_invalid_actions: aggregates?.average_invalid_actions ?? 0,
      acceptance_status: versionAnalytics.acceptance_status,
      evidence_paths: {
        balance_summary: versionAnalytics.source_paths.balance_summary,
        analytics_report: BALANCE_ANALYTICS_REPORT_PATH,
        ...(versionAnalytics.source_paths.acceptance
          ? { acceptance: versionAnalytics.source_paths.acceptance }
          : {}),
        traces: versionAnalytics.problem_runs.map((run) => run.trace_path),
        scorecards: versionAnalytics.problem_runs.map((run) => run.scorecard_path),
      },
      advisory_note: versionAnalytics.advisory_note,
    };
  });

  entries.sort((left, right) => {
    if (right.advisory_score !== left.advisory_score) {
      return right.advisory_score - left.advisory_score;
    }
    return left.version.localeCompare(right.version);
  });

  return entries.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
};

const buildVersionDeltas = async (
  runsRoot: string,
  versions: readonly string[],
): Promise<BalanceAnalyticsVersionDelta[]> => {
  const deltas: BalanceAnalyticsVersionDelta[] = [];
  for (let index = 1; index < versions.length; index += 1) {
    const baseVersion = versions[index - 1]!;
    const targetVersion = versions[index]!;
    const base = await loadBalanceSummary(runsRoot, baseVersion);
    const target = await loadBalanceSummary(runsRoot, targetVersion);
    const missing_data = [
      ...(base ? [] : [buildBalanceSummaryRelativePath(baseVersion)]),
      ...(target ? [] : [buildBalanceSummaryRelativePath(targetVersion)]),
    ];
    deltas.push({
      baseVersion,
      targetVersion,
      ...(base && target ? { comparison: compareBalanceSummaries(base, target) } : {}),
      missing_data,
    });
  }
  return deltas;
};

export const buildBalanceAnalyticsReport = async (
  runsRoot: string,
  options: BuildBalanceAnalyticsOptions = {},
): Promise<BalanceAnalyticsReport> => {
  const versions = [...(options.versions ?? (await listVersionIds(runsRoot)))].sort();
  const builtVersions = await Promise.all(
    versions.map((version) => buildVersionAnalytics(runsRoot, version)),
  );
  const analytics = builtVersions.map((entry) => entry.analytics);
  const missing = builtVersions
    .map((entry) => entry.missing)
    .filter((entry): entry is string => typeof entry === 'string');

  return {
    schema_version: BALANCE_ANALYTICS_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    runs_root: runsRoot,
    advisory_only: true,
    versions: analytics,
    leaderboard: buildBalanceLeaderboard(analytics),
    version_deltas: await buildVersionDeltas(runsRoot, versions),
    missing_data: missing,
  };
};

export interface WriteBalanceAnalyticsOptions {
  reportPath?: string;
  leaderboardPath?: string;
}

export const writeBalanceAnalyticsArtifacts = async (
  report: BalanceAnalyticsReport,
  options: WriteBalanceAnalyticsOptions,
): Promise<{ reportPath?: string; leaderboardPath?: string }> => {
  const written: { reportPath?: string; leaderboardPath?: string } = {};
  if (options.reportPath) {
    await mkdir(path.dirname(options.reportPath), { recursive: true });
    await writeFile(options.reportPath, `${stringifyDeterministicJson(report)}\n`, 'utf8');
    written.reportPath = options.reportPath;
  }
  if (options.leaderboardPath) {
    await mkdir(path.dirname(options.leaderboardPath), { recursive: true });
    await writeFile(
      options.leaderboardPath,
      `${stringifyDeterministicJson({
        schema_version: BALANCE_ANALYTICS_SCHEMA_VERSION,
        generated_at: report.generated_at,
        advisory_only: true,
        leaderboard: report.leaderboard,
      })}\n`,
      'utf8',
    );
    written.leaderboardPath = options.leaderboardPath;
  }
  return written;
};
