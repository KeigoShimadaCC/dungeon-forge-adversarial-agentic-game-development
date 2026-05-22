import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  type ArtifactWriteOptions,
  type ArtifactWritePolicyContext,
  resolveVersionId,
  writeArtifactFile,
} from './artifact-write-policy.js';
import { CANONICAL_REGRESSION_SEEDS } from './baseline-players/helpers.js';
import { stringifyDeterministicJson } from './json.js';
import { BASELINE_POLICY_IDS, type BaselinePolicyId } from './policy-registry.js';
import { runPlaythrough } from './runner.js';
import { deriveScorecardFromTrace, validateScorecard } from './scorecard.js';
import type { TerminalStatus } from '../game/types.js';
import type { PlaythroughScorecard } from './types.js';
import {
  ensureVersionFolder,
  getVersionPaths,
  type MetricDelta,
  validateVersionId,
} from './version-loop.js';
import { buildScorecardRelativePath, buildTraceRelativePath } from './artifacts.js';

export const BALANCE_SUMMARY_FILENAME = 'balance_summary.json';

export interface BalanceBatchSpec {
  seed: string;
  policy: BaselinePolicyId;
}

export interface BalanceRunMetrics {
  turns: number;
  floors_reached: number;
  damage_taken: number;
  items_used: number;
  enemies_defeated: number;
  invalid_actions: number;
  softlocks: number;
}

export interface BalanceRunRecord {
  seed: string;
  policy: BaselinePolicyId;
  result: TerminalStatus;
  metrics: BalanceRunMetrics;
  trace_path: string;
  scorecard_path: string;
  problem: boolean;
  problem_reasons: string[];
}

export interface BalanceFailedRun {
  seed: string;
  policy: BaselinePolicyId;
  result: TerminalStatus;
  problem_reasons: string[];
  metrics: BalanceRunMetrics;
  trace_path: string;
}

export interface BalanceAggregateMetrics {
  total_runs: number;
  win_count: number;
  loss_count: number;
  win_rate: number;
  average_turns: number;
  average_floors_reached: number;
  average_death_floor: number | null;
  average_damage_taken: number;
  average_items_used: number;
  average_enemies_defeated: number;
  average_invalid_actions: number;
  abort_count: number;
  softlock_count: number;
}

export interface BalanceSummary {
  version: string;
  mode: 'baseline';
  seeds: readonly string[];
  policies: readonly BaselinePolicyId[];
  total_runs: number;
  problem_run_count: number;
  aggregates: BalanceAggregateMetrics;
  aggregates_by_policy: Record<BaselinePolicyId, BalanceAggregateMetrics>;
  failed_runs: BalanceFailedRun[];
  runs: BalanceRunRecord[];
  summary_path: string;
}

export interface BalanceSummaryComparison {
  available: true;
  base_summary_path: string;
  target_summary_path: string;
  aggregate_metric_deltas: Record<string, MetricDelta>;
  problem_run_count: MetricDelta;
  newly_problematic_runs: Array<{
    seed: string;
    policy: BaselinePolicyId;
    problem_reasons: string[];
  }>;
  resolved_problematic_runs: Array<{
    seed: string;
    policy: BaselinePolicyId;
  }>;
  interpretation: string;
}

export interface RunBalanceBatchOptions {
  runsRoot: string;
  version: string;
  seeds?: readonly string[];
  policies?: readonly BaselinePolicyId[];
  onExisting?: ArtifactWriteOptions['onExisting'];
  policyContext?: ArtifactWritePolicyContext;
}

const round2 = (value: number): number => Number(value.toFixed(2));

const round4 = (value: number): number => Number(value.toFixed(4));

const metricDelta = (base: number, target: number): MetricDelta => ({
  base: round2(base),
  target: round2(target),
  delta: round2(target - base),
});

const runKey = (seed: string, policy: string): string => `${seed}::${policy}`;

export const buildBalanceSummaryRelativePath = (version: string): string =>
  path.join('runs', resolveVersionId(version), BALANCE_SUMMARY_FILENAME);

export const getDefaultBalanceBatchSpecs = (): BalanceBatchSpec[] =>
  CANONICAL_REGRESSION_SEEDS.flatMap((seed) =>
    BASELINE_POLICY_IDS.map((policy) => ({ seed, policy })),
  );

const scorecardToRunMetrics = (scorecard: PlaythroughScorecard): BalanceRunMetrics => ({
  turns: scorecard.turns,
  floors_reached: scorecard.floors_reached,
  damage_taken: scorecard.damage_taken,
  items_used: scorecard.items_used,
  enemies_defeated: scorecard.enemies_defeated,
  invalid_actions: scorecard.invalid_actions,
  softlocks: scorecard.softlocks,
});

export const collectBalanceProblemReasons = (scorecard: PlaythroughScorecard): string[] => {
  const reasons: string[] = [];
  if (scorecard.result === 'ABORTED') {
    reasons.push('aborted');
  }
  if (scorecard.invalid_actions > 0) {
    reasons.push('invalid_actions');
  }
  if (scorecard.softlocks > 0) {
    reasons.push('softlock');
  }
  return reasons;
};

export const isBalanceProblemRun = (scorecard: PlaythroughScorecard): boolean =>
  collectBalanceProblemReasons(scorecard).length > 0;

const average = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return round2(values.reduce((total, value) => total + value, 0) / values.length);
};

export const aggregateBalanceMetrics = (
  records: readonly Pick<BalanceRunRecord, 'result' | 'metrics'>[],
): BalanceAggregateMetrics => {
  const total_runs = records.length;
  const win_count = records.filter((record) => record.result === 'WIN').length;
  const loss_count = records.filter((record) => record.result === 'LOSS').length;
  const abort_count = records.filter((record) => record.result === 'ABORTED').length;
  const softlock_count = records.reduce((total, record) => total + record.metrics.softlocks, 0);

  const deathFloors = records
    .filter((record) => record.result === 'LOSS')
    .map((record) => record.metrics.floors_reached);

  return {
    total_runs,
    win_count,
    loss_count,
    win_rate: total_runs === 0 ? 0 : round4(win_count / total_runs),
    average_turns: average(records.map((record) => record.metrics.turns)),
    average_floors_reached: average(records.map((record) => record.metrics.floors_reached)),
    average_death_floor: deathFloors.length === 0 ? null : average(deathFloors),
    average_damage_taken: average(records.map((record) => record.metrics.damage_taken)),
    average_items_used: average(records.map((record) => record.metrics.items_used)),
    average_enemies_defeated: average(records.map((record) => record.metrics.enemies_defeated)),
    average_invalid_actions: average(records.map((record) => record.metrics.invalid_actions)),
    abort_count,
    softlock_count,
  };
};

const toFailedRun = (record: BalanceRunRecord): BalanceFailedRun => ({
  seed: record.seed,
  policy: record.policy,
  result: record.result,
  problem_reasons: record.problem_reasons,
  metrics: record.metrics,
  trace_path: record.trace_path,
});

export const buildBalanceSummary = (
  version: string,
  seeds: readonly string[],
  policies: readonly BaselinePolicyId[],
  runs: readonly BalanceRunRecord[],
): BalanceSummary => {
  const failed_runs = runs.filter((run) => run.problem).map(toFailedRun);
  const aggregates = aggregateBalanceMetrics(runs);
  const aggregates_by_policy = {} as Record<BaselinePolicyId, BalanceAggregateMetrics>;

  for (const policy of policies) {
    aggregates_by_policy[policy] = aggregateBalanceMetrics(
      runs.filter((run) => run.policy === policy),
    );
  }

  return {
    version,
    mode: 'baseline',
    seeds,
    policies,
    total_runs: runs.length,
    problem_run_count: failed_runs.length,
    aggregates,
    aggregates_by_policy,
    failed_runs,
    runs: [...runs],
    summary_path: buildBalanceSummaryRelativePath(version),
  };
};

export const runBalanceBatch = async (
  options: RunBalanceBatchOptions,
): Promise<BalanceSummary> => {
  const { runsRoot, version: requestedVersion, onExisting, policyContext } = options;
  const version = resolveVersionId(requestedVersion);
  validateVersionId(requestedVersion);
  await ensureVersionFolder(runsRoot, version);

  const seeds = options.seeds ?? CANONICAL_REGRESSION_SEEDS;
  const policies = options.policies ?? BASELINE_POLICY_IDS;
  const specs = seeds.flatMap((seed) => policies.map((policy) => ({ seed, policy })));
  const runs: BalanceRunRecord[] = [];

  for (const spec of specs) {
    const playthrough = await runPlaythrough({
      seed: spec.seed,
      policyId: spec.policy,
      version,
      runsRoot,
      onExisting,
      policyContext,
    });
    const tracePath = buildTraceRelativePath(version, spec.seed, spec.policy);
    const scorecard = deriveScorecardFromTrace(playthrough.trace, tracePath);
    validateScorecard(scorecard);
    const problem_reasons = collectBalanceProblemReasons(scorecard);

    runs.push({
      seed: spec.seed,
      policy: spec.policy,
      result: scorecard.result,
      metrics: scorecardToRunMetrics(scorecard),
      trace_path: tracePath,
      scorecard_path: buildScorecardRelativePath(version, spec.seed, spec.policy),
      problem: problem_reasons.length > 0,
      problem_reasons,
    });
  }

  runs.sort((left, right) => {
    const seedCompare = left.seed.localeCompare(right.seed);
    if (seedCompare !== 0) {
      return seedCompare;
    }
    return left.policy.localeCompare(right.policy);
  });

  const summary = buildBalanceSummary(version, seeds, policies, runs);
  const summaryAbsolutePath = path.join(runsRoot, summary.summary_path);
  await writeArtifactFile(
    summaryAbsolutePath,
    stringifyDeterministicJson(summary),
    { onExisting },
    {
      runsRoot,
      policyContext,
      artifactLabel: summary.summary_path,
    },
  );

  return summary;
};

export const loadBalanceSummary = async (
  runsRoot: string,
  version: string,
): Promise<BalanceSummary | undefined> => {
  validateVersionId(version);
  const summaryPath = path.join(runsRoot, buildBalanceSummaryRelativePath(version));
  try {
    return JSON.parse(await readFile(summaryPath, 'utf8')) as BalanceSummary;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

const AGGREGATE_METRIC_KEYS = [
  'win_rate',
  'average_turns',
  'average_floors_reached',
  'average_death_floor',
  'average_damage_taken',
  'average_items_used',
  'average_enemies_defeated',
  'average_invalid_actions',
  'abort_count',
  'softlock_count',
] as const satisfies readonly (keyof BalanceAggregateMetrics)[];

export const compareBalanceSummaries = (
  base: BalanceSummary,
  target: BalanceSummary,
): BalanceSummaryComparison => {
  const aggregate_metric_deltas: Record<string, MetricDelta> = {};
  for (const metric of AGGREGATE_METRIC_KEYS) {
    const baseValue = base.aggregates[metric];
    const targetValue = target.aggregates[metric];
    const baseNumber = baseValue === null ? 0 : baseValue;
    const targetNumber = targetValue === null ? 0 : targetValue;
    aggregate_metric_deltas[metric] = metricDelta(baseNumber, targetNumber);
  }

  const baseProblems = new Set(
    base.failed_runs.map((run) => runKey(run.seed, run.policy)),
  );
  const targetProblems = new Map(
    target.failed_runs.map((run) => [runKey(run.seed, run.policy), run] as const),
  );

  const newly_problematic_runs = target.failed_runs
    .filter((run) => !baseProblems.has(runKey(run.seed, run.policy)))
    .map((run) => ({
      seed: run.seed,
      policy: run.policy,
      problem_reasons: run.problem_reasons,
    }));

  const resolved_problematic_runs = base.failed_runs
    .filter((run) => !targetProblems.has(runKey(run.seed, run.policy)))
    .map((run) => ({
      seed: run.seed,
      policy: run.policy,
    }));

  const interpretation =
    newly_problematic_runs.length > 0
      ? 'Target balance batch introduced new problematic seed/policy runs; inspect failed_runs before accepting.'
      : aggregate_metric_deltas.abort_count.delta > 0 ||
          aggregate_metric_deltas.softlock_count.delta > 0 ||
          aggregate_metric_deltas.average_invalid_actions.delta > 0
        ? 'Target balance batch regressed protocol stability metrics.'
        : aggregate_metric_deltas.win_rate.delta < 0
          ? 'Target balance batch is harder by win rate with no new problematic runs.'
          : 'Target balance batch has no new problematic runs and no clear stability regression.';

  return {
    available: true,
    base_summary_path: base.summary_path,
    target_summary_path: target.summary_path,
    aggregate_metric_deltas,
    problem_run_count: metricDelta(base.problem_run_count, target.problem_run_count),
    newly_problematic_runs,
    resolved_problematic_runs,
    interpretation,
  };
};

export const getBalanceSummaryPath = (runsRoot: string, version: string): string => {
  const paths = getVersionPaths(runsRoot, version);
  return path.join(paths.versionDir, BALANCE_SUMMARY_FILENAME);
};
