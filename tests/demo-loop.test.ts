import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseDemoLoopArgs,
  parseDemoLoopVersionsArg,
  runDemoLoop,
} from '../src/harness/demo-loop.js';
import type { BalanceSummary } from '../src/harness/balance-tuning.js';
import type { VersionSummary } from '../src/harness/version-loop.js';

const withTempRunsRoot = async (fn: (runsRoot: string) => Promise<void>): Promise<void> => {
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-demo-loop-'));
  try {
    await fn(runsRoot);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
};

describe('Phase 12A demo loop', () => {
  it('parses demo-loop CLI args', () => {
    const args = parseDemoLoopArgs(['--runs-root', '/tmp/runs', '--versions', 'v001,v003']);
    expect(args).toEqual({
      runsRoot: '/tmp/runs',
      versions: ['v001', 'v003'],
    });
  });

  it('rejects unknown demo versions', () => {
    expect(() => parseDemoLoopVersionsArg('v001,v999')).toThrow('Unknown demo version "v999"');
  });

  it('generates v001 evidence matrix and balance summary while skipping unimplemented versions', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const result = await runDemoLoop({ runsRoot, versions: ['v001', 'v002', 'v003'] });

      expect(result.requestedVersions).toEqual(['v001', 'v002', 'v003']);
      expect(result.versions).toHaveLength(3);

      const v001 = result.versions.find((entry) => entry.version === 'v001');
      const v002 = result.versions.find((entry) => entry.version === 'v002');
      const v003 = result.versions.find((entry) => entry.version === 'v003');

      expect(v001?.status).toBe('completed');
      expect(v001?.runVersion?.runs).toHaveLength(3);
      expect(v001?.summary?.status).toBe('complete');
      expect(v002?.status).toBe('skipped');
      expect(v003?.status).toBe('skipped');

      const tracePath = path.join(
        runsRoot,
        'runs/v001/traces/seed_001_careful_player.json',
      );
      const reviewPath = path.join(
        runsRoot,
        'runs/v001/reviews/seed_001_careful_player.json',
      );
      const scorecardPath = path.join(
        runsRoot,
        'runs/v001/scorecards/seed_001_careful_player.json',
      );
      const balancePath = path.join(runsRoot, 'runs/v001/balance_summary.json');
      const summaryPath = path.join(runsRoot, 'runs/v001/version_summary.json');

      for (const filePath of [tracePath, reviewPath, scorecardPath, balancePath, summaryPath]) {
        expect((await stat(filePath)).isFile()).toBe(true);
      }

      const trace = JSON.parse(await readFile(tracePath, 'utf8')) as { version: string };
      expect(trace.version).toBe('v001');

      const balance = JSON.parse(await readFile(balancePath, 'utf8')) as BalanceSummary;
      expect(balance.version).toBe('v001');
      expect(balance.total_runs).toBeGreaterThan(0);

      const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as VersionSummary;
      expect(summary.version).toBe('v001');
      expect(summary.status).toBe('complete');
    });
  });
});
