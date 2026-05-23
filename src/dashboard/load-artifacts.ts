import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from '../harness/json.js';
import {
  buildVersionSummaryRelativePath,
  summarizeVersion,
  type VersionSummary,
} from '../harness/version-loop.js';
import { buildComparisonRelativePaths } from '../harness/version-comparison-artifacts.js';
import type {
  DashboardArtifactKind,
  DashboardArtifactRef,
  DashboardComparisonRef,
  LoadedArtifactPayload,
} from './types.js';

const VERSION_DIR_PATTERN = /^v\d{3}$/;

export const resolveRunsDirectory = (runsRoot: string): string => path.join(runsRoot, 'runs');

export const listVersionIds = async (runsRoot: string): Promise<string[]> => {
  const runsDir = resolveRunsDirectory(runsRoot);
  let entries: string[];
  try {
    entries = await readdir(runsDir);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  return entries.filter((entry) => VERSION_DIR_PATTERN.test(entry)).sort();
};

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

export const loadPersistedVersionSummary = async (
  runsRoot: string,
  version: string,
): Promise<VersionSummary | null> => {
  const summaryPath = path.join(runsRoot, buildVersionSummaryRelativePath(version));
  if (!(await fileExists(summaryPath))) {
    return null;
  }
  const raw = await readFile(summaryPath, 'utf8');
  return JSON.parse(raw) as VersionSummary;
};

export const loadVersionSummaryForDashboard = async (
  runsRoot: string,
  version: string,
): Promise<{ summary: VersionSummary; summaryPath: string; fromPersisted: boolean }> => {
  const summaryRelative = buildVersionSummaryRelativePath(version);
  const persisted = await loadPersistedVersionSummary(runsRoot, version);
  if (persisted) {
    return { summary: persisted, summaryPath: summaryRelative, fromPersisted: true };
  }
  const summary = await summarizeVersion(runsRoot, version);
  return { summary, summaryPath: summaryRelative, fromPersisted: false };
};

export const listComparisonArtifacts = async (runsRoot: string): Promise<DashboardComparisonRef[]> => {
  const comparisonsDir = path.join(resolveRunsDirectory(runsRoot), 'comparisons');
  let entries: string[];
  try {
    entries = await readdir(comparisonsDir);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const refs: DashboardComparisonRef[] = [];
  for (const entry of entries.filter((name) => name.endsWith('.json')).sort()) {
    const match = /^(.+)_vs_(.+)\.json$/.exec(entry);
    if (!match) {
      continue;
    }
    const baseVersion = match[1]!;
    const targetVersion = match[2]!;
    const paths = buildComparisonRelativePaths(baseVersion, targetVersion);
    refs.push({
      baseVersion,
      targetVersion,
      jsonPath: paths.jsonPath,
      markdownPath: paths.markdownPath,
    });
  }
  return refs;
};

export const listBalanceAnalyticsArtifacts = async (
  runsRoot: string,
): Promise<DashboardArtifactRef[]> => {
  const analyticsDir = path.join(resolveRunsDirectory(runsRoot), 'analytics');
  let entries: string[];
  try {
    entries = await readdir(analyticsDir);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return Promise.all(
    entries
      .filter((entry) => entry.endsWith('.json') || entry.endsWith('.md'))
      .sort()
      .map(async (entry) => {
        const relativePath = path.join('runs', 'analytics', entry);
        return {
          kind: 'analytics' as const,
          label: entry,
          relativePath,
          present: await fileExists(path.join(runsRoot, relativePath)),
        };
      }),
  );
};

export const comparisonsForVersion = (
  comparisons: readonly DashboardComparisonRef[],
  version: string,
): DashboardComparisonRef[] =>
  comparisons.filter(
    (comparison) => comparison.baseVersion === version || comparison.targetVersion === version,
  );

const normalizeRelativeArtifactPath = (relativePath: string): string =>
  relativePath.replace(/\\/g, '/').replace(/^\.\//, '');

export const assertReadableArtifactPath = (
  runsRoot: string,
  relativePath: string,
): { absolutePath: string; normalizedRelative: string } => {
  const normalizedRelative = normalizeRelativeArtifactPath(relativePath);
  if (!normalizedRelative.startsWith('runs/')) {
    throw new Error(`Artifact path must stay under runs/: ${relativePath}`);
  }
  if (normalizedRelative.includes('..')) {
    throw new Error(`Artifact path must not contain .. segments: ${relativePath}`);
  }
  const absolutePath = path.resolve(runsRoot, normalizedRelative);
  const runsRootResolved = path.resolve(runsRoot);
  if (!absolutePath.startsWith(runsRootResolved + path.sep) && absolutePath !== runsRootResolved) {
    throw new Error(`Artifact path escapes runs root: ${relativePath}`);
  }
  return { absolutePath, normalizedRelative };
};

const inferArtifactKind = (relativePath: string): DashboardArtifactKind => {
  if (relativePath.includes('/traces/')) {
    return 'trace';
  }
  if (relativePath.includes('/scorecards/')) {
    return 'scorecard';
  }
  if (relativePath.includes('/reviews/')) {
    return 'review';
  }
  if (relativePath.includes('/comparisons/')) {
    return 'comparison';
  }
  if (relativePath.includes('/analytics/')) {
    return 'analytics';
  }
  if (relativePath.endsWith('.md')) {
    return 'markdown';
  }
  return 'json';
};

export const loadArtifactPayload = async (
  runsRoot: string,
  relativePath: string,
): Promise<LoadedArtifactPayload> => {
  const { absolutePath, normalizedRelative } = assertReadableArtifactPath(runsRoot, relativePath);
  if (!(await fileExists(absolutePath))) {
    throw new Error(`Artifact not found: ${normalizedRelative}`);
  }
  const raw = await readFile(absolutePath, 'utf8');
  const kind = inferArtifactKind(normalizedRelative);
  if (normalizedRelative.endsWith('.json')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        relativePath: normalizedRelative,
        kind,
        format: 'text',
        content: raw,
      };
    }
    return {
      relativePath: normalizedRelative,
      kind,
      format: 'json',
      content: stringifyDeterministicJson(parsed),
    };
  }
  return {
    relativePath: normalizedRelative,
    kind,
    format: normalizedRelative.endsWith('.md') ? 'markdown' : 'text',
    content: raw,
  };
};

export const buildArtifactRefsForSummary = async (
  runsRoot: string,
  summary: VersionSummary,
): Promise<DashboardArtifactRef[]> => {
  const refs: DashboardArtifactRef[] = [
    {
      kind: 'json',
      label: 'version_summary.json',
      relativePath: buildVersionSummaryRelativePath(summary.version),
      present: await fileExists(path.join(runsRoot, buildVersionSummaryRelativePath(summary.version))),
    },
    {
      kind: 'markdown',
      label: 'acceptance.md',
      relativePath: path.join('runs', summary.version, 'acceptance.md'),
      present: summary.artifact_coverage.markdown['acceptance.md'].present,
    },
    {
      kind: 'markdown',
      label: 'changelog.md',
      relativePath: path.join('runs', summary.version, 'changelog.md'),
      present: summary.artifact_coverage.markdown['changelog.md'].present,
    },
    {
      kind: 'markdown',
      label: 'patch_plan.md',
      relativePath: path.join('runs', summary.version, 'patch_plan.md'),
      present: summary.artifact_coverage.markdown['patch_plan.md'].present,
    },
    {
      kind: 'markdown',
      label: 'developer_notes.md',
      relativePath: path.join('runs', summary.version, 'developer_notes.md'),
      present: summary.artifact_coverage.markdown['developer_notes.md'].present,
    },
  ];

  const balanceRelative = path.join('runs', summary.version, 'balance_summary.json');
  refs.push({
    kind: 'json',
    label: 'balance_summary.json',
    relativePath: balanceRelative,
    present: await fileExists(path.join(runsRoot, balanceRelative)),
  });

  for (const run of summary.runs) {
    refs.push({
      kind: 'trace',
      label: `${run.seed}/${run.persona} trace`,
      relativePath: run.trace_path.replace(/^\.?\//, ''),
      present: await fileExists(path.join(runsRoot, run.trace_path.replace(/^\.?\//, ''))),
    });
    refs.push({
      kind: 'scorecard',
      label: `${run.seed}/${run.persona} scorecard`,
      relativePath: run.scorecard_path.replace(/^\.?\//, ''),
      present: await fileExists(path.join(runsRoot, run.scorecard_path.replace(/^\.?\//, ''))),
    });
    if (run.review_path) {
      refs.push({
        kind: 'review',
        label: `${run.seed}/${run.persona} review`,
        relativePath: run.review_path.replace(/^\.?\//, ''),
        present: await fileExists(path.join(runsRoot, run.review_path.replace(/^\.?\//, ''))),
      });
    }
  }

  return refs;
};
