import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  discoverVersionsWithAcceptanceEvidence,
  verifyAcceptanceEvidence,
  versionHasAcceptanceEvidence,
} from '../src/harness/acceptance-evidence-check.js';
import {
  buildCiSmokeSpecs,
  collectCiSmokeProblemReasons,
  runCiSmoke,
} from '../src/harness/ci-smoke.js';
import { runRepoChecks } from '../src/harness/repo-checks.js';
import type { PlaythroughScorecard } from '../src/harness/types.js';
import {
  ensureVersionFolder,
  getVersionPaths,
  runVersion,
} from '../src/harness/version-loop.js';

const withTempRunsRoot = async (fn: (runsRoot: string) => Promise<void>): Promise<void> => {
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-ci-checks-'));
  try {
    await fn(runsRoot);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
};

describe('Phase 13B CI and acceptance checks', () => {
  it('builds the canonical seed and baseline policy smoke matrix', () => {
    const specs = buildCiSmokeSpecs();
    expect(specs).toHaveLength(20);
    expect(specs.map((spec) => spec.seed)).toContain('seed_001');
    expect(specs.map((spec) => spec.policy)).toContain('stairs-seeking');
  });

  it('passes credential-free deterministic smoke for the default demo version', async () => {
    const result = await runCiSmoke({ version: 'v001' });
    expect(result.ok).toBe(true);
    expect(result.failed_runs).toHaveLength(0);
    expect(result.total_runs).toBe(20);
  });

  it('reports CI smoke protocol failures explicitly', () => {
    expect(
      collectCiSmokeProblemReasons({
        result: 'ACTIVE',
        invalid_actions: 2,
      } as PlaythroughScorecard),
    ).toEqual(['active_terminal', 'invalid_actions']);
  });

  it('discovers version evidence and fails verification when required artifacts are missing', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await ensureVersionFolder(runsRoot, 'v001');
      const paths = getVersionPaths(runsRoot, 'v001');
      await writeFile(
        paths.changelogPath,
        '# Changelog\n\n- Incomplete evidence fixture.\n',
        'utf8',
      );
      await writeFile(
        paths.developerNotesPath,
        '# Developer Notes\n\n- Incomplete evidence fixture.\n',
        'utf8',
      );
      await writeFile(
        path.join(paths.tracesDir, 'seed_001_careful_player.json'),
        '{}\n',
        'utf8',
      );

      expect(await versionHasAcceptanceEvidence(runsRoot, 'v001')).toBe(true);
      const discovered = await discoverVersionsWithAcceptanceEvidence(runsRoot);
      expect(discovered).toContain('v001');

      const result = await verifyAcceptanceEvidence({ runsRoot, versions: ['v001'] });
      expect(result.ok).toBe(false);
      expect(result.versions[0]?.status).toBe('fail');
      expect(result.versions[0]?.machine_recommendation).not.toBe('pass');
    });
  });

  it('fails explicit acceptance verification when the requested version has no evidence', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const result = await verifyAcceptanceEvidence({ runsRoot, versions: ['v001'] });
      expect(result.ok).toBe(false);
      expect(result.versions[0]).toMatchObject({
        version: 'v001',
        status: 'fail',
      });
      expect(result.versions[0]?.blockers?.join(' ')).toContain(
        'No acceptance evidence found',
      );
    });
  });

  it('passes acceptance verification when the default evidence matrix is complete', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runVersion(runsRoot, 'v001');
      const paths = getVersionPaths(runsRoot, 'v001');
      await writeFile(
        paths.changelogPath,
        '# Changelog\n\n- Stable changelog for acceptance verification.\n',
        'utf8',
      );
      await writeFile(
        paths.developerNotesPath,
        '# Developer Notes\n\n- Stable developer notes for acceptance verification.\n',
        'utf8',
      );

      const result = await verifyAcceptanceEvidence({ runsRoot, versions: ['v001'] });
      expect(result.ok).toBe(true);
      expect(result.versions[0]?.status).toBe('pass');
      expect(result.versions[0]?.machine_recommendation).toBe('pass');
    });
  });

  it('reports repo-check failures explicitly when acceptance verification fails', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await ensureVersionFolder(runsRoot, 'v001');
      const paths = getVersionPaths(runsRoot, 'v001');
      await writeFile(
        paths.changelogPath,
        '# Changelog\n\n- Repo check failure fixture.\n',
        'utf8',
      );
      await writeFile(
        paths.developerNotesPath,
        '# Developer Notes\n\n- Repo check failure fixture.\n',
        'utf8',
      );

      const result = await runRepoChecks({
        runsRoot,
        smokeVersion: 'v001',
        acceptanceVersions: ['v001'],
      });
      expect(result.ok).toBe(false);
      expect(result.smoke.ok).toBe(true);
      expect(result.acceptance.ok).toBe(false);
    });
  });

  it('verifies committed demo acceptance evidence when present in the workspace', async () => {
    const repoRoot = process.cwd();
    const runsRoot = repoRoot;
    const discovered = await discoverVersionsWithAcceptanceEvidence(runsRoot);
    if (discovered.length === 0) {
      return;
    }

    const result = await verifyAcceptanceEvidence({ runsRoot, versions: discovered });
    expect(result.ok).toBe(true);
    for (const entry of result.versions) {
      expect(entry.status).toBe('pass');
    }
  });
});
