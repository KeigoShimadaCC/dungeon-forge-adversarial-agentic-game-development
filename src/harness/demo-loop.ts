import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DEMO_VERSION_IDS,
  getVersionProfile,
  isDemoVersionImplemented,
  type DemoVersionId,
} from '../game/version-profiles.js';
import { runBalanceBatch } from './balance-tuning.js';
import { stringifyDeterministicJson } from './json.js';
import {
  ensureVersionFolder,
  runVersion,
  summarizeVersion,
  validateVersionId,
  type VersionRunOutput,
  type VersionSummary,
} from './version-loop.js';
import type { BalanceSummary } from './balance-tuning.js';

export const DEMO_LOOP_VERSIONS = DEMO_VERSION_IDS;

export type DemoLoopVersionStatus = 'completed' | 'skipped' | 'failed';

export interface DemoLoopVersionResult {
  version: string;
  status: DemoLoopVersionStatus;
  reason?: string;
  runVersion?: VersionRunOutput;
  balanceSummary?: BalanceSummary;
  summary?: VersionSummary;
  summaryPath?: string;
}

export interface DemoLoopOptions {
  runsRoot: string;
  versions?: readonly string[];
}

export interface DemoLoopResult {
  runsRoot: string;
  requestedVersions: readonly string[];
  versions: DemoLoopVersionResult[];
}

const buildVersionSummaryPath = (version: string): string =>
  path.join('runs', version, 'version_summary.json');

export const parseDemoLoopVersionsArg = (value: string): DemoVersionId[] => {
  const versions = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (versions.length === 0) {
    throw new Error('Expected at least one version in --versions.');
  }
  for (const version of versions) {
    validateVersionId(version);
    if (!getVersionProfile(version)) {
      throw new Error(
        `Unknown demo version "${version}". Expected one of: ${DEMO_LOOP_VERSIONS.join(', ')}.`,
      );
    }
  }
  return versions as DemoVersionId[];
};

export const runDemoLoop = async (options: DemoLoopOptions): Promise<DemoLoopResult> => {
  const requestedVersions = options.versions ?? DEMO_LOOP_VERSIONS;
  const versions: DemoLoopVersionResult[] = [];

  for (const version of requestedVersions) {
    validateVersionId(version);

    if (!isDemoVersionImplemented(version)) {
      versions.push({
        version,
        status: 'skipped',
        reason: `${version} profile is not implemented in this pass.`,
      });
      continue;
    }

    try {
      await ensureVersionFolder(options.runsRoot, version);
      const runVersionOutput = await runVersion(options.runsRoot, version);
      const balanceSummary = await runBalanceBatch({
        runsRoot: options.runsRoot,
        version,
      });
      const summary = await summarizeVersion(options.runsRoot, version);
      const summaryPath = buildVersionSummaryPath(version);
      await writeFile(
        path.join(options.runsRoot, summaryPath),
        stringifyDeterministicJson(summary),
        'utf8',
      );

      versions.push({
        version,
        status: 'completed',
        runVersion: runVersionOutput,
        balanceSummary,
        summary,
        summaryPath,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      versions.push({
        version,
        status: 'failed',
        reason: message,
      });
    }
  }

  return {
    runsRoot: options.runsRoot,
    requestedVersions,
    versions,
  };
};

export const parseDemoLoopArgs = (
  argv: string[],
): { runsRoot: string; versions?: DemoVersionId[] } => {
  const args: { runsRoot: string; versions?: DemoVersionId[] } = { runsRoot: process.cwd() };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--') {
      continue;
    }
    if (token === '--runs-root' && next) {
      args.runsRoot = next;
      index += 1;
      continue;
    }
    if (token === '--versions' && next) {
      args.versions = parseDemoLoopVersionsArg(next);
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${token}`);
  }

  return args;
};
