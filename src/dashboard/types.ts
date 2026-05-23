import type { VersionComparison, VersionSummary } from '../harness/version-loop.js';

export type DashboardArtifactKind =
  | 'trace'
  | 'scorecard'
  | 'review'
  | 'markdown'
  | 'json'
  | 'comparison'
  | 'analytics';

export interface DashboardArtifactRef {
  kind: DashboardArtifactKind;
  label: string;
  relativePath: string;
  present: boolean;
}

export interface DashboardVersionEntry {
  version: string;
  summary: VersionSummary;
  summaryPath: string;
  balanceSummaryPath?: string;
  comparisons: DashboardComparisonRef[];
  artifacts: DashboardArtifactRef[];
  missingArtifactCount: number;
}

export interface DashboardComparisonRef {
  baseVersion: string;
  targetVersion: string;
  jsonPath: string;
  markdownPath: string;
}

export interface DashboardLeaderboardEntry {
  rank: number;
  version: string;
  evidenceScore: number;
  winRate: number;
  reviewedRunCount: number;
  averageReviewerFun: number | null;
  softlockCount: number;
  invalidActionCount: number;
  acceptanceStatus: VersionSummary['acceptance_status'];
  summaryPath: string;
  acceptancePath: string;
  comparisonPaths: string[];
  scorecardPaths: string[];
}

export interface DashboardIndex {
  generatedAt: string;
  runsRoot: string;
  readOnly: true;
  versions: DashboardVersionEntry[];
  leaderboard: DashboardLeaderboardEntry[];
  comparisons: DashboardComparisonRef[];
  analyticsArtifacts: DashboardArtifactRef[];
}

export interface LoadedArtifactPayload {
  relativePath: string;
  kind: DashboardArtifactKind;
  format: 'json' | 'markdown' | 'text';
  content: string;
}

export type { VersionComparison, VersionSummary };
