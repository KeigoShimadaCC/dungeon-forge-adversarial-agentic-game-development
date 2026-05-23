import type { DashboardIndex, DashboardVersionEntry } from '../dashboard/types.js';
import type { VersionComparison, VersionSummary } from '../harness/version-loop.js';

export type StaticDemoEvidenceLabel =
  | 'generated'
  | 'accepted'
  | 'rejected'
  | 'blocked'
  | 'partial'
  | 'missing';

export interface StaticDemoTimelineEntry {
  version: string;
  order: number;
  coverageStatus: VersionSummary['status'];
  acceptanceStatus: VersionSummary['acceptance_status'];
  runCount: number;
  missingArtifactCount: number;
  winRate: number;
  evidenceScore: number | null;
  summaryPath: string;
  acceptancePath: string;
  changelogPath: string;
  patchPlanPath: string;
}

export interface StaticDemoComparisonEntry {
  baseVersion: string;
  targetVersion: string;
  jsonPath: string;
  markdownPath: string;
  interpretation: string | null;
  jsonPresent: boolean;
  markdownPresent: boolean;
}

export interface StaticDemoBundle {
  generatedAt: string;
  runsRoot: string;
  readOnly: true;
  purpose: string;
  loopSummary: string;
  demoSummaryPath: string | null;
  demoSummaryPresent: boolean;
  demoSummaryExcerpt: string | null;
  index: DashboardIndex;
  timeline: StaticDemoTimelineEntry[];
  comparisons: StaticDemoComparisonEntry[];
  regenerationCommands: string[];
}

export type { DashboardIndex, DashboardVersionEntry, VersionComparison, VersionSummary };
