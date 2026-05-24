import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildLongitudinalBenchmarkReport,
  runLongitudinalBenchmarkCli,
  type VersionSummary,
} from '../src/harness/index.js';
import {
  buildBalanceSummary,
  buildBalanceSummaryRelativePath,
  type BalanceRunRecord,
} from '../src/harness/balance-tuning.js';
import { stringifyDeterministicJson } from '../src/harness/json.js';

const withTempRunsRoot = async (fn: (runsRoot: string) => Promise<void>): Promise<void> => {
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-longitudinal-'));
  try {
    await fn(runsRoot);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
};

const reviewerScores = {
  fun: 3,
  clarity: 3,
  fairness: 3,
  tactical_depth: 3,
  replay_value: 3,
};

const makeBalanceRun = (
  version: string,
  seed: string,
  result: BalanceRunRecord['result'],
  turns: number,
  damageTaken: number,
  itemsUsed: number,
  softlocks: number,
): BalanceRunRecord => ({
  seed,
  policy: 'random',
  result,
  metrics: {
    turns,
    floors_reached: result === 'WIN' ? 2 : 1,
    damage_taken: damageTaken,
    items_used: itemsUsed,
    enemies_defeated: result === 'WIN' ? 1 : 0,
    invalid_actions: 0,
    softlocks,
  },
  trace_path: `runs/${version}/traces/${seed}_random.json`,
  scorecard_path: `runs/${version}/scorecards/${seed}_random.json`,
  problem: result === 'ABORTED' || softlocks > 0,
  problem_reasons: result === 'ABORTED' || softlocks > 0 ? ['softlock'] : [],
  problem_categories:
    result === 'ABORTED' || softlocks > 0
      ? [{ category: 'softlock', code: 'softlock_detected', message: 'Softlock' }]
      : [],
});

const writeFixtureVersion = async (
  runsRoot: string,
  version: string,
  runs: BalanceRunRecord[],
  options: {
    acceptanceStatus?: string;
    skipTrace?: string;
    skipScorecard?: string;
    skipAcceptance?: boolean;
    scoreBump?: number;
  } = {},
): Promise<void> => {
  const versionDir = path.join(runsRoot, 'runs', version);
  await mkdir(path.join(versionDir, 'traces'), { recursive: true });
  await mkdir(path.join(versionDir, 'scorecards'), { recursive: true });
  await mkdir(path.join(versionDir, 'reviews'), { recursive: true });

  const versionRuns: VersionSummary['runs'] = [];
  for (const run of runs) {
    const tracePath = path.join(runsRoot, run.trace_path);
    const scorecardPath = path.join(runsRoot, run.scorecard_path);
    const scores = Object.fromEntries(
      Object.entries(reviewerScores).map(([key, value]) => [key, value + (options.scoreBump ?? 0)]),
    ) as typeof reviewerScores;
    if (run.seed !== options.skipTrace) {
      await writeFile(
        tracePath,
        `${stringifyDeterministicJson({
          version,
          seed: run.seed,
          persona: run.policy,
          result: run.result,
          turns: run.metrics.turns,
          steps: [],
        })}\n`,
        'utf8',
      );
    }
    if (run.seed !== options.skipScorecard) {
      await writeFile(
        scorecardPath,
        `${stringifyDeterministicJson({
          version,
          seed: run.seed,
          persona: run.policy,
          result: run.result,
          ...run.metrics,
          reviewer_scores: scores,
          trace_path: run.trace_path,
        })}\n`,
        'utf8',
      );
    }
    versionRuns.push({
      seed: run.seed,
      persona: run.policy,
      player_kind: 'agent',
      agent_policy_class: 'baseline',
      result: run.result,
      turns: run.metrics.turns,
      metrics: run.metrics,
      reviewer_scores: scores,
      trace_path: run.trace_path,
      scorecard_path: run.scorecard_path,
    });
  }

  const versionSummary: VersionSummary = {
    version,
    versionDir,
    status: 'complete',
    artifact_coverage: {
      traces: { expected: runs.length, present: runs.length, missing: [] },
      reviews: { expected: 0, present: 0, missing: [] },
      scorecards: { expected: runs.length, present: runs.length, missing: [] },
      markdown: {
        'acceptance.md': {
          path: `runs/${version}/acceptance.md`,
          present: !options.skipAcceptance,
          nonEmpty: !options.skipAcceptance,
        },
        'changelog.md': { path: `runs/${version}/changelog.md`, present: false, nonEmpty: false },
        'developer_notes.md': {
          path: `runs/${version}/developer_notes.md`,
          present: false,
          nonEmpty: false,
        },
        'patch_plan.md': { path: `runs/${version}/patch_plan.md`, present: false, nonEmpty: false },
      },
    },
    runs: versionRuns,
    links: {
      acceptance: `runs/${version}/acceptance.md`,
      changelog: `runs/${version}/changelog.md`,
      developer_notes: `runs/${version}/developer_notes.md`,
      patch_plan: `runs/${version}/patch_plan.md`,
    },
    acceptance_status: 'pending',
  };
  await writeFile(
    path.join(versionDir, 'version_summary.json'),
    `${stringifyDeterministicJson(versionSummary)}\n`,
    'utf8',
  );
  if (!options.skipAcceptance) {
    await writeFile(
      path.join(versionDir, 'acceptance.md'),
      `# Acceptance Report\n\n## Machine recommendation\n\nStatus: pass\n\n## Human decision\n\nStatus: ${options.acceptanceStatus ?? 'pending'}\n`,
      'utf8',
    );
  }
  const balanceSummary = buildBalanceSummary(version, runs.map((run) => run.seed), ['random'], runs);
  await writeFile(
    path.join(runsRoot, buildBalanceSummaryRelativePath(version)),
    `${stringifyDeterministicJson(balanceSummary)}\n`,
    'utf8',
  );
};

describe('Phase 23C longitudinal benchmark', () => {
  it('reports three-version trends with improved, regressed, and unchanged labels', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await writeFixtureVersion(runsRoot, 'v001', [
        makeBalanceRun('v001', 'seed_001', 'ABORTED', 50, 12, 0, 1),
        makeBalanceRun('v001', 'seed_002', 'LOSS', 30, 8, 0, 0),
      ]);
      await writeFixtureVersion(runsRoot, 'v002', [
        makeBalanceRun('v002', 'seed_001', 'WIN', 50, 12, 1, 0),
        makeBalanceRun('v002', 'seed_002', 'LOSS', 30, 8, 1, 0),
      ]);
      await writeFixtureVersion(runsRoot, 'v003', [
        makeBalanceRun('v003', 'seed_001', 'WIN', 40, 14, 1, 0),
        makeBalanceRun('v003', 'seed_002', 'LOSS', 30, 8, 1, 0),
      ]);

      const report = await buildLongitudinalBenchmarkReport(runsRoot, {
        versions: ['v001', 'v002', 'v003'],
      });

      expect(report).toMatchObject({
        schema_version: 1,
        versions_requested: ['v001', 'v002', 'v003'],
        missing_evidence: [],
      });
      expect(report.versions).toHaveLength(3);
      expect(report.versions[0]?.evidence_state.source_paths.traces).toContain(
        'runs/v001/traces/seed_001_random.json',
      );
      expect(report.versions[0]?.evidence_state.source_paths.acceptance).toBe(
        'runs/v001/acceptance.md',
      );
      expect(
        report.comparisons[0]?.metrics.find((metric) => metric.metric === 'average_metrics.damage_taken')
          ?.evidence_paths,
      ).toEqual(
        expect.arrayContaining([
          'runs/v001/scorecards/seed_001_random.json',
          'runs/v001/traces/seed_001_random.json',
        ]),
      );
      const firstComparison = report.comparisons[0]!;
      expect(firstComparison.metrics.find((metric) => metric.metric === 'outcome_metrics.completion_rate')).toMatchObject({
        label: 'improved',
      });
      expect(firstComparison.metrics.find((metric) => metric.metric === 'average_metrics.damage_taken')).toMatchObject({
        label: 'unchanged',
      });
      expect(firstComparison.metrics.find((metric) => metric.metric === 'average_metrics.items_used')).toMatchObject({
        label: 'improved',
      });
      const secondComparison = report.comparisons[1]!;
      expect(secondComparison.metrics.find((metric) => metric.metric === 'outcome_metrics.loss_count')).toMatchObject({
        label: 'unchanged',
      });
      expect(secondComparison.metrics.find((metric) => metric.metric === 'balance_metrics.average_turns')).toMatchObject({
        label: 'improved',
      });
      expect(
        secondComparison.metrics.find((metric) => metric.metric === 'average_metrics.damage_taken'),
      ).toMatchObject({
        label: 'regressed',
      });
      expect(secondComparison.acceptance_status.evidence_paths).toEqual(
        expect.arrayContaining(['runs/v002/acceptance.md', 'runs/v003/acceptance.md']),
      );
    });
  });

  it('marks missing scorecard evidence and keeps comparisons stable', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await writeFixtureVersion(
        runsRoot,
        'v001',
        [makeBalanceRun('v001', 'seed_001', 'WIN', 20, 2, 1, 0)],
        { skipScorecard: 'seed_001' },
      );
      await writeFixtureVersion(runsRoot, 'v002', [
        makeBalanceRun('v002', 'seed_001', 'WIN', 20, 2, 1, 0),
      ]);

      const report = await buildLongitudinalBenchmarkReport(runsRoot, {
        versions: ['v001', 'v002'],
      });

      expect(report.versions[0]?.evidence_state.status).toBe('partial');
      expect(report.missing_evidence).toContain(
        'v001: missing scorecard runs/v001/scorecards/seed_001_random.json',
      );
      expect(report.comparisons[0]?.metrics.find((metric) => metric.metric === 'average_metrics.turns')).toMatchObject({
        label: 'missing',
      });
    });
  });

  it('marks missing acceptance evidence without crashing the report', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await writeFixtureVersion(
        runsRoot,
        'v001',
        [makeBalanceRun('v001', 'seed_001', 'WIN', 20, 2, 1, 0)],
        { skipAcceptance: true },
      );
      await writeFixtureVersion(
        runsRoot,
        'v002',
        [makeBalanceRun('v002', 'seed_001', 'WIN', 20, 2, 1, 0)],
        { acceptanceStatus: 'accepted' },
      );

      const report = await buildLongitudinalBenchmarkReport(runsRoot, {
        versions: ['v001', 'v002'],
      });

      expect(report.versions[0]?.acceptance_status).toBe('missing');
      expect(report.missing_evidence).toContain('v001: missing runs/v001/acceptance.md');
      expect(report.comparisons[0]?.acceptance_status).toMatchObject({
        label: 'missing',
        missing_reasons: expect.arrayContaining(['v001: missing acceptance status']),
      });
      expect(report.comparisons[0]?.acceptance_status.evidence_paths).toEqual(
        expect.arrayContaining(['runs/v001/acceptance.md', 'runs/v002/acceptance.md']),
      );
    });
  });

  it('marks missing trace-backed evidence without crashing metrics or comparisons', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await writeFixtureVersion(
        runsRoot,
        'v001',
        [makeBalanceRun('v001', 'seed_001', 'WIN', 20, 2, 1, 0)],
        { skipTrace: 'seed_001' },
      );
      await writeFixtureVersion(runsRoot, 'v002', [
        makeBalanceRun('v002', 'seed_001', 'WIN', 20, 2, 1, 0),
      ]);

      const report = await buildLongitudinalBenchmarkReport(runsRoot, {
        versions: ['v001', 'v002'],
      });

      expect(report.versions[0]?.evidence_state.status).toBe('partial');
      expect(report.missing_evidence).toContain('v001: missing trace runs/v001/traces/seed_001_random.json');
      expect(report.comparisons[0]?.metrics.find((metric) => metric.metric === 'average_metrics.turns')).toMatchObject({
        label: 'missing',
      });
    });
  });

  it('writes report JSON through the CLI', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await writeFixtureVersion(runsRoot, 'v001', [
        makeBalanceRun('v001', 'seed_001', 'WIN', 20, 2, 1, 0),
      ]);
      await writeFixtureVersion(runsRoot, 'v002', [
        makeBalanceRun('v002', 'seed_001', 'LOSS', 20, 2, 1, 0),
      ]);
      const outPath = path.join(runsRoot, 'runs', 'benchmarks', 'summary.json');
      const lines: string[] = [];
      await runLongitudinalBenchmarkCli(
        ['--runs-root', runsRoot, '--versions', 'v001,v002', '--out', outPath],
        { stdout: (value) => lines.push(value) },
      );

      expect(lines.join('')).toContain('Wrote longitudinal benchmark report:');
      const written = JSON.parse(await readFile(outPath, 'utf8')) as { versions_requested: string[] };
      expect(written.versions_requested).toEqual(['v001', 'v002']);
    });
  });
});
