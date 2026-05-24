import { stat } from 'node:fs/promises';
import path from 'node:path';

import type { VersionSummary, VersionSummaryRun } from '../harness/version-loop.js';
import { validateVersionEvidenceIntegrity } from '../harness/evidence-integrity.js';
import {
  comparisonsForVersion,
  buildArtifactRefsForSummary,
  listComparisonArtifacts,
  listBalanceAnalyticsArtifacts,
  listVersionIds,
  loadVersionSummaryForDashboard,
} from './load-artifacts.js';
import type {
  DashboardIndex,
  DashboardLeaderboardEntry,
  DashboardVersionEntry,
} from './types.js';

const winResults = new Set(['WIN']);

const averageReviewerMetric = (
  runs: readonly VersionSummaryRun[],
  metric: keyof VersionSummaryRun['reviewer_scores'],
): number | null => {
  const values = runs
    .map((run) => run.reviewer_scores[metric])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (values.length === 0) {
    return null;
  }
  return Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(2));
};

const computeEvidenceScore = (summary: VersionSummary): number => {
  const runs = summary.runs;
  if (runs.length === 0) {
    return 0;
  }
  const winRate = runs.filter((run) => winResults.has(run.result)).length / runs.length;
  const softlockCount = runs.reduce((total, run) => total + run.metrics.softlocks, 0);
  const invalidActionCount = runs.reduce((total, run) => total + run.metrics.invalid_actions, 0);
  const avgFun = averageReviewerMetric(runs, 'fun') ?? 0;
  const reviewedRunCount = runs.filter(
    (run) => typeof run.reviewer_scores.fun === 'number',
  ).length;

  const reviewerComponent = reviewedRunCount > 0 ? avgFun * 8 : 0;
  const winComponent = winRate * 25;
  const stabilityPenalty = softlockCount * 0.4 + invalidActionCount * 2;
  const coveragePenalty =
    summary.artifact_coverage.traces.missing.length +
    summary.artifact_coverage.reviews.missing.length +
    summary.artifact_coverage.scorecards.missing.length;

  return Number(
    (reviewerComponent + winComponent - stabilityPenalty - coveragePenalty).toFixed(2),
  );
};

export const buildLeaderboard = (
  versions: readonly DashboardVersionEntry[],
): DashboardLeaderboardEntry[] => {
  const entries = versions.map((entry) => {
    const runs = entry.summary.runs;
    const winRate =
      runs.length === 0
        ? 0
        : Number(
            (
              runs.filter((run) => winResults.has(run.result)).length / runs.length
            ).toFixed(3),
          );
    const reviewedRunCount = runs.filter(
      (run) => typeof run.reviewer_scores.fun === 'number',
    ).length;
    return {
      version: entry.version,
      evidenceScore: computeEvidenceScore(entry.summary),
      winRate,
      reviewedRunCount,
      averageReviewerFun: averageReviewerMetric(runs, 'fun'),
      softlockCount: runs.reduce((total, run) => total + run.metrics.softlocks, 0),
      invalidActionCount: runs.reduce((total, run) => total + run.metrics.invalid_actions, 0),
      acceptanceStatus: entry.summary.acceptance_status,
      summaryPath: entry.summaryPath,
      acceptancePath: path.join('runs', entry.version, 'acceptance.md'),
      comparisonPaths: entry.comparisons.flatMap((comparison) => [
        comparison.jsonPath,
        comparison.markdownPath,
      ]),
      scorecardPaths: runs.map((run) => run.scorecard_path),
    };
  });

  entries.sort((left, right) => {
    if (right.evidenceScore !== left.evidenceScore) {
      return right.evidenceScore - left.evidenceScore;
    }
    return left.version.localeCompare(right.version);
  });

  return entries.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
};

export const buildDashboardIndex = async (runsRoot: string): Promise<DashboardIndex> => {
  const versionIds = await listVersionIds(runsRoot);
  const comparisons = await listComparisonArtifacts(runsRoot);
  const analyticsArtifacts = await listBalanceAnalyticsArtifacts(runsRoot);
  const versions: DashboardVersionEntry[] = [];

  for (const version of versionIds) {
    const { summary, summaryPath } = await loadVersionSummaryForDashboard(runsRoot, version);
    const artifacts = await buildArtifactRefsForSummary(runsRoot, summary);
    const evidenceIntegrity = await validateVersionEvidenceIntegrity(runsRoot, summary);
    const integrityProblemCount = evidenceIntegrity.diagnostics.length;
    const balanceRelative = path.join('runs', version, 'balance_summary.json');
    let balanceSummaryPath: string | undefined;
    try {
      const balanceStat = await stat(path.join(runsRoot, balanceRelative));
      if (balanceStat.isFile()) {
        balanceSummaryPath = balanceRelative;
      }
    } catch (error: unknown) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
        throw error;
      }
    }
    versions.push({
      version,
      summary,
      summaryPath,
      comparisons: comparisonsForVersion(comparisons, version),
      artifacts,
      evidenceIntegrity,
      integrityProblemCount,
      missingArtifactCount:
        artifacts.filter((artifact) => !artifact.present).length + integrityProblemCount,
      ...(balanceSummaryPath ? { balanceSummaryPath } : {}),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    runsRoot,
    readOnly: true,
    versions,
    leaderboard: buildLeaderboard(versions),
    comparisons,
    analyticsArtifacts,
  };
};
