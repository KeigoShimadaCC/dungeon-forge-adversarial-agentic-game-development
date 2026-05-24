import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildDashboardIndex, runVersionDashboardCli } from '../src/dashboard/index.js';
import {
  buildLongitudinalBenchmarkReport,
  ensureVersionFolder,
  getVersionPaths,
  persistVersionSummary,
  runVersion,
  stringifyDeterministicJson,
  validateVersionEvidenceIntegrity,
  type VersionRunSpec,
} from '../src/harness/index.js';
import { runContentGovernanceCli } from '../src/harness/content-governance-cli.js';
import { runTraceReplayCli } from '../src/harness/trace-replay-cli.js';
import { runVerifyAcceptanceEvidenceCli } from '../src/harness/verify-acceptance-evidence-cli.js';
import { buildStaticDemoBundle, runStaticDemoExportCli } from '../src/static-demo/index.js';
import type { PlaythroughScorecard, PlaythroughTrace } from '../src/harness/types.js';

const RUNS = [{ seed: 'seed_001', persona: 'careful_player' }] as const satisfies readonly VersionRunSpec[];

const withTempRunsRoot = async (fn: (runsRoot: string) => Promise<void>): Promise<void> => {
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-evidence-hardening-'));
  try {
    await fn(runsRoot);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
};

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${stringifyDeterministicJson(value)}\n`, 'utf8');
};

const seedVersion = async (
  runsRoot: string,
  version: string,
  options: { malformedTrace?: boolean; mismatchedScorecard?: boolean } = {},
): Promise<void> => {
  const { paths } = await ensureVersionFolder(runsRoot, version);
  const tracePath = `runs/${version}/traces/seed_001_careful_player.json`;
  const scorecardPath = `runs/${version}/scorecards/seed_001_careful_player.json`;
  const trace: PlaythroughTrace = {
    version,
    seed: 'seed_001',
    persona: 'careful_player',
    result: 'WIN',
    turns: 12,
    player_kind: 'agent',
    agent_policy_class: 'baseline',
    steps: [],
  };
  const scorecard: PlaythroughScorecard = {
    version,
    seed: 'seed_001',
    persona: 'careful_player',
    player_kind: 'agent',
    agent_policy_class: 'baseline',
    result: 'WIN',
    turns: 12,
    floors_reached: 2,
    damage_taken: 1,
    items_used: 1,
    enemies_defeated: 1,
    invalid_actions: 0,
    softlocks: 0,
    reviewer_scores: {
      fun: 4,
      clarity: 4,
      fairness: 4,
      tactical_depth: 4,
      replay_value: 4,
    },
    trace_path: tracePath,
  };

  if (options.malformedTrace) {
    await mkdir(path.dirname(path.join(runsRoot, tracePath)), { recursive: true });
    await writeFile(path.join(runsRoot, tracePath), '{ malformed', 'utf8');
  } else {
    await writeJson(path.join(runsRoot, tracePath), trace);
  }
  await writeJson(path.join(runsRoot, scorecardPath), scorecard);
  await writeFile(
    paths.acceptancePath,
    '# Acceptance\n\n## Machine recommendation\n\nStatus: pass\n\n## Human decision\n\nStatus: pending\n',
    'utf8',
  );
  await writeFile(paths.changelogPath, '# Changelog\n\n- Seeded.\n', 'utf8');
  await persistVersionSummary(runsRoot, version, RUNS, { onExisting: 'overwrite' });
  if (options.mismatchedScorecard) {
    await writeJson(path.join(runsRoot, scorecardPath), {
      ...scorecard,
      persona: 'naive_player',
    });
  }
};

const withoutTimestamps = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(withoutTimestamps);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        key === 'generated_at' || key === 'generatedAt' ? '<timestamp>' : withoutTimestamps(entry),
      ]),
    );
  }
  return value;
};

describe('Phase 23D evidence validation hardening', () => {
  it('flags missing trace-backed sources clearly', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedVersion(runsRoot, 'v001');
      await rm(path.join(runsRoot, 'runs/v001/traces/seed_001_careful_player.json'));

      const dashboard = await buildDashboardIndex(runsRoot);
      const summary = dashboard.versions[0]?.summary;
      if (!summary) {
        throw new Error('Expected seeded summary');
      }

      const integrity = await validateVersionEvidenceIntegrity(runsRoot, summary);

      expect(integrity.ok).toBe(false);
      expect(integrity.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'missing_source',
            kind: 'trace',
            message: expect.stringContaining('missing trace source'),
          }),
        ]),
      );
      expect(dashboard.versions[0]?.integrityProblemCount).toBe(1);
    });
  });

  it('flags malformed and mismatched trace-backed sources clearly', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedVersion(runsRoot, 'v001', { malformedTrace: true, mismatchedScorecard: true });
      const dashboard = await buildDashboardIndex(runsRoot);
      const summary = dashboard.versions[0]?.summary;
      if (!summary) {
        throw new Error('Expected seeded summary');
      }

      const integrity = await validateVersionEvidenceIntegrity(runsRoot, summary);

      expect(integrity.ok).toBe(false);
      expect(integrity.diagnostics.map((entry) => entry.code)).toEqual(
        expect.arrayContaining(['malformed_json', 'mismatched_source']),
      );
      expect(integrity.diagnostics.map((entry) => entry.message).join('\n')).toContain(
        'malformed trace JSON',
      );
      expect(integrity.diagnostics.map((entry) => entry.message).join('\n')).toContain(
        'scorecard source mismatch',
      );
      expect(dashboard.versions[0]?.integrityProblemCount).toBe(2);
      expect(dashboard.versions[0]?.missingArtifactCount).toBeGreaterThanOrEqual(2);
    });
  });

  it('does not compute longitudinal metrics from malformed or mismatched source evidence', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedVersion(runsRoot, 'v001', { malformedTrace: true, mismatchedScorecard: true });
      await seedVersion(runsRoot, 'v002');

      const report = await buildLongitudinalBenchmarkReport(runsRoot, {
        versions: ['v001', 'v002'],
      });

      expect(report.missing_evidence).toEqual(
        expect.arrayContaining([
          'v001: malformed trace JSON runs/v001/traces/seed_001_careful_player.json',
          expect.stringContaining('v001: scorecard source mismatch'),
        ]),
      );
      expect(report.versions[0]?.outcome_metrics).toBeUndefined();
      expect(report.comparisons[0]?.metrics.find((entry) => entry.metric === 'average_metrics.turns')).toMatchObject({
        label: 'missing',
      });
    });
  });

  it('surfaces integrity problems in static demo JSON without requiring a browser', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedVersion(runsRoot, 'v001', { mismatchedScorecard: true });

      const bundle = await buildStaticDemoBundle(runsRoot);
      let stdout = '';
      await runStaticDemoExportCli(['--runs-root', runsRoot, '--json'], {
        stdout: (value) => {
          stdout += value;
        },
      });
      const parsed = JSON.parse(stdout) as { timeline: Array<{ integrityProblemCount: number }> };

      expect(bundle.timeline[0]?.integrityProblemCount).toBe(1);
      expect(parsed.timeline[0]?.integrityProblemCount).toBe(1);
    });
  });

  it('prints parseable JSON for acceptance verification smoke command', async () => {
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
      let stdout = '';

      await runVerifyAcceptanceEvidenceCli(['--runs-root', runsRoot, '--version', 'v001'], {
        stdout: (value) => {
          stdout += value;
        },
      });

      const parsed = JSON.parse(stdout) as {
        ok: boolean;
        runsRoot: string;
        versions: Array<{ version: string; status: string }>;
      };

      expect(parsed.ok).toBe(true);
      expect(parsed.runsRoot).toBe(runsRoot);
      expect(parsed.versions).toEqual([
        expect.objectContaining({ version: 'v001', status: 'pass' }),
      ]);
    });
  });

  it('verifies committed demo trace via credential-free replay smoke path when present', async () => {
    const tracePath = path.join(
      process.cwd(),
      'runs/v001/traces/seed_001_careful_player.json',
    );
    try {
      await stat(tracePath);
    } catch {
      return;
    }

    const priorExit = process.exitCode;
    process.exitCode = undefined;
    let stdout = '';
    await runTraceReplayCli(['--trace', tracePath, '--mode', 'verify'], {
      stdout: (value) => {
        stdout += value;
      },
    });
    expect(process.exitCode ?? 0).toBe(0);
    process.exitCode = priorExit;
    expect(stdout).toContain('ok: yes');
  });

  it('prints parseable JSON for governance and dashboard smoke commands', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedVersion(runsRoot, 'v001');
      let governanceStdout = '';
      let dashboardStdout = '';

      await runContentGovernanceCli(['--base-only', '--format', 'json'], {
        stdout: (value) => {
          governanceStdout += value;
        },
      });
      await runVersionDashboardCli(['--runs-root', runsRoot, '--json'], {
        stdout: (value) => {
          dashboardStdout += value;
        },
      });

      expect(JSON.parse(governanceStdout)).toMatchObject({ ok: true });
      expect(JSON.parse(dashboardStdout)).toMatchObject({
        readOnly: true,
        versions: [expect.objectContaining({ version: 'v001', integrityProblemCount: 0 })],
      });
    });
  });

  it('keeps stable report content reproducible while timestamp metadata remains derived', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await seedVersion(runsRoot, 'v001');
      await seedVersion(runsRoot, 'v002');

      const firstBenchmark = await buildLongitudinalBenchmarkReport(runsRoot, {
        versions: ['v001', 'v002'],
      });
      const secondBenchmark = await buildLongitudinalBenchmarkReport(runsRoot, {
        versions: ['v001', 'v002'],
      });
      const firstDashboard = await buildDashboardIndex(runsRoot);
      const secondDashboard = await buildDashboardIndex(runsRoot);
      const firstBundle = await buildStaticDemoBundle(runsRoot);
      const secondBundle = await buildStaticDemoBundle(runsRoot);

      expect(withoutTimestamps(secondBenchmark)).toEqual(withoutTimestamps(firstBenchmark));
      expect(withoutTimestamps(secondDashboard)).toEqual(withoutTimestamps(firstDashboard));
      expect(withoutTimestamps(secondBundle)).toEqual(withoutTimestamps(firstBundle));
    });
  });
});
