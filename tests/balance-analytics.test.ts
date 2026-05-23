import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BALANCE_ANALYTICS_REPORT_PATH,
  BALANCE_LEADERBOARD_PATH,
  buildBalanceAnalyticsReport,
  runBalanceAnalyticsCli,
  writeBalanceAnalyticsArtifacts,
  type BalanceAnalyticsReport,
} from '../src/harness/index.js';
import {
  buildBalanceSummary,
  buildBalanceSummaryRelativePath,
  type BalanceRunRecord,
} from '../src/harness/balance-tuning.js';
import { ensureVersionFolder } from '../src/harness/version-loop.js';
import { stringifyDeterministicJson } from '../src/harness/json.js';

const withTempRunsRoot = async (fn: (runsRoot: string) => Promise<void>): Promise<void> => {
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-balance-analytics-'));
  try {
    await fn(runsRoot);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
};

const makeRun = (
  version: string,
  seed: string,
  policy: BalanceRunRecord['policy'],
  result: BalanceRunRecord['result'],
  problem = false,
): BalanceRunRecord => ({
  seed,
  policy,
  result,
  metrics: {
    turns: result === 'WIN' ? 12 : 60,
    floors_reached: result === 'WIN' ? 2 : 1,
    damage_taken: result === 'WIN' ? 2 : 18,
    items_used: result === 'WIN' ? 1 : 0,
    enemies_defeated: result === 'WIN' ? 2 : 0,
    invalid_actions: 0,
    softlocks: problem ? 1 : 0,
  },
  trace_path: `runs/${version}/traces/${seed}_${policy}.json`,
  scorecard_path: `runs/${version}/scorecards/${seed}_${policy}.json`,
  problem,
  problem_reasons: problem ? ['softlock risk'] : [],
  problem_categories: problem
    ? [{ category: 'softlock', code: 'softlock_detected', message: 'Softlock risk' }]
    : [],
});

const writeFixtureVersion = async (
  runsRoot: string,
  version: string,
  runs: BalanceRunRecord[],
  acceptanceStatus = 'pending',
  challengeModeByPolicy: Partial<Record<BalanceRunRecord['policy'], string>> = {},
): Promise<void> => {
  const { paths } = await ensureVersionFolder(runsRoot, version);
  const seeds = [...new Set(runs.map((run) => run.seed))].sort();
  const policies = [...new Set(runs.map((run) => run.policy))].sort();
  const summary = buildBalanceSummary(version, seeds, policies, runs);
  const summaryPath = path.join(runsRoot, buildBalanceSummaryRelativePath(version));
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, `${stringifyDeterministicJson(summary)}\n`, 'utf8');
  for (const run of runs) {
    const tracePath = path.join(runsRoot, run.trace_path);
    const scorecardPath = path.join(runsRoot, run.scorecard_path);
    await mkdir(path.dirname(tracePath), { recursive: true });
    await mkdir(path.dirname(scorecardPath), { recursive: true });
    await writeFile(
      tracePath,
      `${stringifyDeterministicJson({
        version,
        seed: run.seed,
        persona: run.policy,
        result: run.result,
        turns: run.metrics.turns,
        steps: [],
        challenge_mode: challengeModeByPolicy[run.policy],
      })}\n`,
      'utf8',
    );
    await writeFile(
      scorecardPath,
      `${stringifyDeterministicJson({
        version,
        seed: run.seed,
        persona: run.policy,
        player_kind: 'agent',
        agent_policy_class: 'baseline',
        result: run.result,
        turns: run.metrics.turns,
        floors_reached: run.metrics.floors_reached,
        damage_taken: run.metrics.damage_taken,
        items_used: run.metrics.items_used,
        enemies_defeated: run.metrics.enemies_defeated,
        invalid_actions: run.metrics.invalid_actions,
        softlocks: run.metrics.softlocks,
        reviewer_scores: {
          fun: 3,
          clarity: 3,
          fairness: 3,
          tactical_depth: 3,
          replay_value: 3,
        },
        trace_path: run.trace_path,
        challenge_mode: challengeModeByPolicy[run.policy],
      })}\n`,
      'utf8',
    );
  }
  await writeFile(
    paths.acceptancePath,
    `# Acceptance\n\n## Human decision\n\nStatus: ${acceptanceStatus}\n`,
    'utf8',
  );
};

describe('Phase 18B balance analytics', () => {
  it('computes stable cohort analytics, deltas, problem drilldowns, and leaderboard evidence links', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await writeFixtureVersion(
        runsRoot,
        'v001',
        [
          makeRun('v001', 'seed_001', 'random', 'ABORTED', true),
          makeRun('v001', 'seed_001', 'stairs-seeking', 'WIN'),
        ],
        'pending',
        { random: 'hard' },
      );
      await writeFixtureVersion(
        runsRoot,
        'v002',
        [
          makeRun('v002', 'seed_001', 'random', 'WIN'),
          makeRun('v002', 'seed_001', 'stairs-seeking', 'WIN'),
        ],
        'accepted',
      );

      const report = await buildBalanceAnalyticsReport(runsRoot, {
        versions: ['v001', 'v002'],
      });

      expect(report).toMatchObject({
        schema_version: 1,
        advisory_only: true,
        missing_data: [],
      });
      expect(report.versions[0]?.cohorts.by_seed[0]).toMatchObject({
        key: 'seed_001',
        total_runs: 2,
        problem_run_count: 1,
      });
      expect(report.versions[0]?.cohorts.by_policy.map((cohort) => cohort.key)).toEqual([
        'random',
        'stairs-seeking',
      ]);
      expect(report.versions[0]?.cohorts.by_challenge_mode.map((cohort) => cohort.key)).toEqual([
        'default',
        'hard',
      ]);
      expect(report.versions[0]?.cohorts.by_problem_category[0]).toMatchObject({
        key: 'softlock',
        problem_run_count: 1,
      });
      expect(report.versions[0]?.problem_runs[0]).toMatchObject({
        seed: 'seed_001',
        policy: 'random',
        challenge_mode: 'hard',
        primary_category: 'softlock',
        trace_path: 'runs/v001/traces/seed_001_random.json',
      });
      expect(report.version_deltas[0]?.comparison?.problem_run_count.delta).toBe(-1);
      expect(report.leaderboard[0]).toMatchObject({
        rank: 1,
        version: 'v002',
        acceptance_status: 'accepted',
        evidence_paths: {
          balance_summary: 'runs/v002/balance_summary.json',
          analytics_report: BALANCE_ANALYTICS_REPORT_PATH,
          acceptance: 'runs/v002/acceptance.md',
        },
      });
    });
  });

  it('reports missing balance data without crashing', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await ensureVersionFolder(runsRoot, 'v001');

      const report = await buildBalanceAnalyticsReport(runsRoot);

      expect(report.missing_data).toEqual(['runs/v001/balance_summary.json']);
      expect(report.versions[0]).toMatchObject({
        version: 'v001',
        status: 'missing_balance_summary',
        advisory_note: 'Advisory: balance analytics are unavailable until balance_summary.json exists.',
      });
      expect(report.leaderboard[0]?.advisory_score).toBe(-1000);
    });
  });

  it('writes explicit derived report and leaderboard artifacts without mutating source summaries', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await writeFixtureVersion(
        runsRoot,
        'v001',
        [makeRun('v001', 'seed_001', 'random', 'ABORTED', true)],
      );
      const sourceSummaryPath = path.join(runsRoot, 'runs/v001/balance_summary.json');
      const before = await readFile(sourceSummaryPath, 'utf8');
      const reportPath = path.join(runsRoot, BALANCE_ANALYTICS_REPORT_PATH);
      const leaderboardPath = path.join(runsRoot, BALANCE_LEADERBOARD_PATH);
      let stdout = '';

      await runBalanceAnalyticsCli(
        [
          '--runs-root',
          runsRoot,
          '--out',
          reportPath,
          '--leaderboard-out',
          leaderboardPath,
        ],
        {
          stdout: (value) => {
            stdout += value;
          },
        },
      );

      expect(stdout).toContain('Wrote balance analytics report:');
      expect(stdout).toContain('Wrote balance leaderboard:');
      expect(await readFile(sourceSummaryPath, 'utf8')).toBe(before);
      const report = JSON.parse(await readFile(reportPath, 'utf8')) as BalanceAnalyticsReport;
      expect(report.leaderboard[0]?.evidence_paths.balance_summary).toBe(
        'runs/v001/balance_summary.json',
      );
      expect(await readFile(leaderboardPath, 'utf8')).toContain('"advisory_only": true');
    });
  });

  it('exposes analytics artifacts to the version dashboard when present', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await writeFixtureVersion(
        runsRoot,
        'v001',
        [makeRun('v001', 'seed_001', 'stairs-seeking', 'WIN')],
      );
      const report = await buildBalanceAnalyticsReport(runsRoot);
      await writeBalanceAnalyticsArtifacts(report, {
        reportPath: path.join(runsRoot, BALANCE_ANALYTICS_REPORT_PATH),
        leaderboardPath: path.join(runsRoot, BALANCE_LEADERBOARD_PATH),
      });
      const { buildDashboardIndex } = await import('../src/dashboard/index.js');

      const index = await buildDashboardIndex(runsRoot);

      expect(index.analyticsArtifacts.map((artifact) => artifact.relativePath)).toEqual([
        BALANCE_ANALYTICS_REPORT_PATH,
        BALANCE_LEADERBOARD_PATH,
      ]);
      expect(index.analyticsArtifacts.every((artifact) => artifact.present)).toBe(true);
    });
  });
});
