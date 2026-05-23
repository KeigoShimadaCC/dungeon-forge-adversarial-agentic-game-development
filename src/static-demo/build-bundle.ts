import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { buildDashboardIndex } from '../dashboard/build-index.js';
import type { DashboardComparisonRef } from '../dashboard/types.js';
import type { VersionComparison } from '../harness/version-loop.js';
import type {
  StaticDemoBundle,
  StaticDemoComparisonEntry,
  StaticDemoTimelineEntry,
} from './types.js';

const DEMO_SUMMARY_RELATIVE = 'runs/demo_summary.md';

const LOOP_SUMMARY = [
  'Dungeon Forge runs a bounded adversarial loop: a developer agent improves a finite text/ASCII game,',
  'the harness plays it with structured actions, and a reviewer/player agent critiques saved traces.',
  'Each version stores traces, reviews, scorecards, changelogs, patch plans, comparisons, and acceptance evidence.',
  'This bundle is a read-only publisher. It links claims to local artifacts and marks missing or partial evidence honestly.',
].join(' ');

const REGENERATION_COMMANDS = [
  'pnpm run demo-loop -- --runs-root .',
  'pnpm run summarize-version -- --version <version> --runs-root .',
  'pnpm run compare-versions -- --base <base> --target <target> --runs-root .',
  'pnpm run export-static-demo -- --runs-root . --out <bundle-dir>',
];

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

const winResults = new Set(['WIN']);

const computeWinRate = (runs: { result: string }[]): number => {
  if (runs.length === 0) {
    return 0;
  }
  const wins = runs.filter((run) => winResults.has(run.result)).length;
  return Number((wins / runs.length).toFixed(3));
};

const buildTimeline = (index: Awaited<ReturnType<typeof buildDashboardIndex>>): StaticDemoTimelineEntry[] =>
  index.versions
    .map((versionEntry, orderIndex) => {
      const leaderboardEntry = index.leaderboard.find((entry) => entry.version === versionEntry.version);
      return {
        version: versionEntry.version,
        order: orderIndex + 1,
        coverageStatus: versionEntry.summary.status,
        acceptanceStatus: versionEntry.summary.acceptance_status,
        runCount: versionEntry.summary.runs.length,
        missingArtifactCount: versionEntry.missingArtifactCount,
        winRate: computeWinRate(versionEntry.summary.runs),
        evidenceScore: leaderboardEntry?.evidenceScore ?? null,
        summaryPath: versionEntry.summaryPath,
        acceptancePath: path.join('runs', versionEntry.version, 'acceptance.md'),
        changelogPath: versionEntry.summary.links.changelog,
        patchPlanPath: versionEntry.summary.links.patch_plan,
      };
    })
    .sort((left, right) => left.version.localeCompare(right.version));

const loadComparisonInterpretation = async (
  runsRoot: string,
  comparison: DashboardComparisonRef,
): Promise<string | null> => {
  const jsonAbsolute = path.join(runsRoot, comparison.jsonPath);
  if (!(await fileExists(jsonAbsolute))) {
    return null;
  }
  try {
    const raw = await readFile(jsonAbsolute, 'utf8');
    const parsed = JSON.parse(raw) as VersionComparison;
    return typeof parsed.interpretation === 'string' && parsed.interpretation.length > 0
      ? parsed.interpretation
      : null;
  } catch {
    return null;
  }
};

const buildComparisons = async (
  runsRoot: string,
  comparisons: readonly DashboardComparisonRef[],
): Promise<StaticDemoComparisonEntry[]> =>
  Promise.all(
    comparisons.map(async (comparison) => ({
      baseVersion: comparison.baseVersion,
      targetVersion: comparison.targetVersion,
      jsonPath: comparison.jsonPath,
      markdownPath: comparison.markdownPath,
      interpretation: await loadComparisonInterpretation(runsRoot, comparison),
      jsonPresent: await fileExists(path.join(runsRoot, comparison.jsonPath)),
      markdownPresent: await fileExists(path.join(runsRoot, comparison.markdownPath)),
    })),
  );

const loadDemoSummary = async (
  runsRoot: string,
): Promise<{ path: string | null; present: boolean; excerpt: string | null }> => {
  const summaryPath = path.join(runsRoot, DEMO_SUMMARY_RELATIVE);
  if (!(await fileExists(summaryPath))) {
    return { path: null, present: false, excerpt: null };
  }
  const raw = await readFile(summaryPath, 'utf8');
  const lines = raw.split('\n').slice(0, 12);
  return {
    path: DEMO_SUMMARY_RELATIVE,
    present: true,
    excerpt: lines.join('\n').trim(),
  };
};

export const buildStaticDemoBundle = async (runsRoot: string): Promise<StaticDemoBundle> => {
  const index = await buildDashboardIndex(runsRoot);
  const demoSummary = await loadDemoSummary(runsRoot);
  const comparisons = await buildComparisons(runsRoot, index.comparisons);

  return {
    generatedAt: new Date().toISOString(),
    runsRoot,
    readOnly: true,
    purpose: 'Shareable static evidence bundle for the adversarial game-development loop.',
    loopSummary: LOOP_SUMMARY,
    demoSummaryPath: demoSummary.path,
    demoSummaryPresent: demoSummary.present,
    demoSummaryExcerpt: demoSummary.excerpt,
    index,
    timeline: buildTimeline(index),
    comparisons,
    regenerationCommands: REGENERATION_COMMANDS,
  };
};
