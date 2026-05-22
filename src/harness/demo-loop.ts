import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DEMO_VERSION_IDS,
  getVersionProfile,
  isDemoVersionImplemented,
  type DemoVersionId,
} from '../game/version-profiles.js';
import { runBalanceBatch } from './balance-tuning.js';
import { writeAcceptanceReport } from './acceptance-gate.js';
import {
  writeImplementedVersionMarkdown,
  writeReviewerDrivenHandoff,
  writeVersionComparisonArtifacts,
} from './demo-loop-handoff.js';
import { stringifyDeterministicJson } from './json.js';
import {
  ensureVersionFolder,
  runVersion,
  summarizeVersion,
  validateVersionId,
  type VersionComparison,
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

export interface DemoLoopComparisonResult {
  baseVersion: string;
  targetVersion: string;
  jsonPath: string;
  markdownPath: string;
  comparison: VersionComparison;
}

export interface DemoLoopResult {
  runsRoot: string;
  requestedVersions: readonly string[];
  versions: DemoLoopVersionResult[];
  comparisons: DemoLoopComparisonResult[];
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

const shouldGenerateHandoff = (
  baseVersion: string,
  targetVersion: string,
): boolean => {
  const baseNum = Number(baseVersion.slice(1));
  const targetNum = Number(targetVersion.slice(1));
  return Number.isFinite(baseNum) && Number.isFinite(targetNum) && targetNum === baseNum + 1;
};

export const runDemoLoop = async (options: DemoLoopOptions): Promise<DemoLoopResult> => {
  const requestedVersions = options.versions ?? DEMO_LOOP_VERSIONS;
  const versions: DemoLoopVersionResult[] = [];
  const comparisons: DemoLoopComparisonResult[] = [];

  for (let index = 0; index < requestedVersions.length; index += 1) {
    const version = requestedVersions[index]!;
    validateVersionId(version);

    const previousVersion = index > 0 ? requestedVersions[index - 1] : undefined;
    const previousResult = previousVersion
      ? versions.find((entry) => entry.version === previousVersion)
      : undefined;

    if (
      previousVersion &&
      previousResult?.status === 'completed' &&
      isDemoVersionImplemented(version) &&
      shouldGenerateHandoff(previousVersion, version)
    ) {
      await writeReviewerDrivenHandoff(options.runsRoot, previousVersion, version);
    }

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

      if (version === 'v001') {
        await writeImplementedVersionMarkdown(options.runsRoot, version, {
          changelogBullets: [
            'Recorded the shallow baseline demo profile with two Slime/Potion-focused floors.',
            'Generated the default reviewer persona matrix and baseline balance batch from trace evidence.',
            'Kept the baseline intentionally shallow so v002 can respond to reviewer tactical/clarity critique.',
          ],
          developerNotesBullets: [
            'Baseline evidence shows repeated ABORTED/softlock problem signals in the balance batch.',
            'Reviewer evidence calls out stalled states and asks for clearer item/enemy outcomes in render/log output.',
            'No reviewer-driven code patch is claimed for v001; it is the comparison baseline.',
          ],
          testsAndEvidenceBullets: [
            '`pnpm run demo-loop -- --runs-root . --versions v001`',
            '`pnpm run summarize-version -- --version v001 --runs-root .`',
          ],
        });
      }
      if (version === 'v002') {
        await writeImplementedVersionMarkdown(options.runsRoot, version, {
          changelogBullets: [
            'Implemented v002 demo profile with a starting Smoke Bomb and Potion/Smoke Bomb evidence path.',
            'Added opening log guidance and inventory effect details so tactical item purpose is visible before use.',
            'Taught baseline policies to use Smoke Bombs when enemies are close so item use appears in traces.',
          ],
          developerNotesBullets: [
            'Handoff generated from v001 seed_001 careful_player review/scorecard before v002 play matrix.',
            'Smoke Bomb guidance and use events are trace-visible; compare v001 vs v002 items_used and clarity scores.',
            'Did not broaden into v003 balance tuning or full softlock remediation in this pass.',
          ],
          testsAndEvidenceBullets: [
            '`pnpm test tests/version-profiles.test.ts tests/demo-loop.test.ts tests/tactical-items.test.ts`',
            '`pnpm run demo-loop -- --runs-root . --versions v001,v002`',
            '`pnpm run compare-versions -- --base v001 --target v002 --runs-root .`',
          ],
          comparisonPath: 'runs/comparisons/v001_vs_v002.md',
          patchPlanStatus: 'implemented',
        });
      }
      if (version === 'v003') {
        await writeImplementedVersionMarkdown(options.runsRoot, version, {
          changelogBullets: [
            'Implemented v003 tuned demo profile as a shorter one-floor balance pass.',
            'Preserved Smoke Bomb tactical clarity while adding a starting Potion to reduce sudden losses.',
            'Kept enemies Slime-only so the final demo isolates item clarity and completion reliability.',
          ],
          developerNotesBullets: [
            'Handoff generated from v002 review evidence after v002 added tactical item use but still showed balance risk.',
            'v003 intentionally narrows the demo floor count and enemy pressure to reduce ABORTED/softlock outcomes.',
            'This is balance/clarity tuning for the demo loop, not a replacement for later richer content phases.',
          ],
          testsAndEvidenceBullets: [
            '`pnpm test tests/version-profiles.test.ts tests/demo-loop.test.ts tests/tactical-items.test.ts`',
            '`pnpm run demo-loop -- --runs-root .`',
            '`pnpm run compare-versions -- --base v002 --target v003 --runs-root .`',
          ],
          comparisonPath: 'runs/comparisons/v002_vs_v003.md',
          patchPlanStatus: 'implemented',
        });
      }

      const summary = await summarizeVersion(options.runsRoot, version);
      const summaryPath = buildVersionSummaryPath(version);
      await writeFile(
        path.join(options.runsRoot, summaryPath),
        stringifyDeterministicJson(summary),
        'utf8',
      );
      await writeAcceptanceReport({
        runsRoot: options.runsRoot,
        version,
        commandStatuses: {
          typecheck: 'skipped',
          test: 'skipped',
          lint: 'skipped',
          build: 'skipped',
        },
        reviewerDriven: version !== 'v001',
      });

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

  for (let index = 0; index < requestedVersions.length - 1; index += 1) {
    const baseVersion = requestedVersions[index]!;
    const targetVersion = requestedVersions[index + 1]!;
    const baseDone = versions.find((entry) => entry.version === baseVersion)?.status === 'completed';
    const targetDone =
      versions.find((entry) => entry.version === targetVersion)?.status === 'completed';
    if (!baseDone || !targetDone) {
      continue;
    }
    const artifact = await writeVersionComparisonArtifacts(
      options.runsRoot,
      baseVersion,
      targetVersion,
    );
    comparisons.push({
      baseVersion,
      targetVersion,
      jsonPath: artifact.jsonPath,
      markdownPath: artifact.markdownPath,
      comparison: artifact.comparison,
    });
  }

  const firstVersion = requestedVersions[0];
  const lastVersion = requestedVersions[requestedVersions.length - 1];
  if (
    firstVersion &&
    lastVersion &&
    requestedVersions.length > 2 &&
    firstVersion !== lastVersion &&
    versions.find((entry) => entry.version === firstVersion)?.status === 'completed' &&
    versions.find((entry) => entry.version === lastVersion)?.status === 'completed'
  ) {
    const alreadyCompared = comparisons.some(
      (entry) => entry.baseVersion === firstVersion && entry.targetVersion === lastVersion,
    );
    if (!alreadyCompared) {
      const artifact = await writeVersionComparisonArtifacts(
        options.runsRoot,
        firstVersion,
        lastVersion,
      );
      comparisons.push({
        baseVersion: firstVersion,
        targetVersion: lastVersion,
        jsonPath: artifact.jsonPath,
        markdownPath: artifact.markdownPath,
        comparison: artifact.comparison,
      });
    }
  }

  return {
    runsRoot: options.runsRoot,
    requestedVersions,
    versions,
    comparisons,
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
