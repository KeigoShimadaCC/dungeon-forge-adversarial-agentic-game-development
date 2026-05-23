import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  evaluateAcceptanceGate,
  type AcceptanceGateResult,
  type CommandCheckId,
  type CommandCheckStatus,
} from './acceptance-gate.js';
import { fileExists } from './artifact-write-policy.js';
import { VERSION_ID_PATTERN, getVersionPaths } from './version-loop.js';

export interface AcceptanceEvidenceVersionResult {
  version: string;
  status: 'pass' | 'fail' | 'skipped';
  machine_recommendation?: AcceptanceGateResult['machine_recommendation'];
  blockers?: string[];
  summary?: string;
}

export interface AcceptanceEvidenceCheckResult {
  runsRoot: string;
  versions: AcceptanceEvidenceVersionResult[];
  ok: boolean;
}

const hasJsonTraceEvidence = async (tracesDir: string): Promise<boolean> => {
  try {
    const entries = await readdir(tracesDir);
    return entries.some((entry) => entry.endsWith('.json'));
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

export const versionHasAcceptanceEvidence = async (
  runsRoot: string,
  version: string,
): Promise<boolean> => {
  const paths = getVersionPaths(runsRoot, version);
  const changelogPresent = await fileExists(paths.changelogPath);
  if (!changelogPresent) {
    return false;
  }

  const acceptancePresent = await fileExists(paths.acceptancePath);
  if (acceptancePresent) {
    return true;
  }

  return hasJsonTraceEvidence(paths.tracesDir);
};

export const discoverVersionsWithAcceptanceEvidence = async (
  runsRoot: string,
): Promise<string[]> => {
  const runsDir = path.join(runsRoot, 'runs');
  let entries: string[];
  try {
    entries = await readdir(runsDir);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const versions: string[] = [];
  for (const entry of entries) {
    if (!VERSION_ID_PATTERN.test(entry) || entry.startsWith('_')) {
      continue;
    }
    const versionDir = path.join(runsDir, entry);
    const dirStat = await stat(versionDir);
    if (!dirStat.isDirectory()) {
      continue;
    }
    if (await versionHasAcceptanceEvidence(runsRoot, entry)) {
      versions.push(entry);
    }
  }

  return versions.sort((left, right) => left.localeCompare(right));
};

const passCommandStatuses = (): Record<CommandCheckId, CommandCheckStatus> => ({
  typecheck: 'pass',
  test: 'pass',
  lint: 'pass',
  build: 'pass',
});

export const verifyAcceptanceEvidence = async (options: {
  runsRoot: string;
  versions?: readonly string[];
}): Promise<AcceptanceEvidenceCheckResult> => {
  const explicitVersions = options.versions !== undefined;
  const versions =
    options.versions ?? (await discoverVersionsWithAcceptanceEvidence(options.runsRoot));
  const results: AcceptanceEvidenceVersionResult[] = [];

  for (const version of versions) {
    const hasEvidence = await versionHasAcceptanceEvidence(options.runsRoot, version);
    if (!hasEvidence) {
      if (explicitVersions) {
        results.push({
          version,
          status: 'fail',
          blockers: ['No acceptance evidence found for explicitly requested version.'],
          summary: 'Explicit acceptance-evidence verification requires version evidence.',
        });
        continue;
      }
      results.push({
        version,
        status: 'skipped',
        summary: 'No acceptance evidence present; skipped verification.',
      });
      continue;
    }

    const gate = await evaluateAcceptanceGate({
      runsRoot: options.runsRoot,
      version,
      commandStatuses: passCommandStatuses(),
    });

    if (gate.machine_recommendation === 'pass') {
      results.push({
        version,
        status: 'pass',
        machine_recommendation: gate.machine_recommendation,
        summary: 'Machine acceptance checks passed for committed evidence.',
      });
    } else {
      results.push({
        version,
        status: 'fail',
        machine_recommendation: gate.machine_recommendation,
        blockers: gate.blockers,
        summary: `Machine acceptance checks ${gate.machine_recommendation}; see blockers.`,
      });
    }
  }

  const ok = results.every((result) => result.status !== 'fail');
  return {
    runsRoot: options.runsRoot,
    versions: results,
    ok,
  };
};
