import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildTraceRelativePath } from '../src/harness/artifacts.js';
import {
  buildComparisonRelativePaths,
  buildComparisonArtifactBasename,
} from '../src/harness/version-comparison-artifacts.js';
import {
  buildVersionSummaryRelativePath,
  persistVersionComparison,
  persistVersionSummary,
  runVersion,
} from '../src/harness/version-loop.js';
import { resolveVersionId } from '../src/harness/artifact-write-policy.js';
import { validateVersionId } from '../src/harness/version-loop.js';
import { runBalanceBatch, buildBalanceSummaryRelativePath } from '../src/harness/balance-tuning.js';

const withTempRunsRoot = async (fn: (runsRoot: string) => Promise<void>): Promise<void> => {
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-evidence-retention-'));
  try {
    await fn(runsRoot);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
};

describe('Phase 13A evidence retention', () => {
  it('resolves descriptive smoke aliases to canonical version ids', () => {
    expect(resolveVersionId('v09c-smoke')).toBe('v009');
    expect(resolveVersionId('v024b-smoke')).toBe('v024');
    expect(() => validateVersionId('v09c-smoke')).not.toThrow();
    expect(() => validateVersionId('v024b-smoke')).not.toThrow();
    const paths = path.join('runs', resolveVersionId('v09c-smoke'));
    expect(paths).toBe('runs/v009');
    expect(buildBalanceSummaryRelativePath('v09c-smoke')).toBe('runs/v009/balance_summary.json');
    expect(buildBalanceSummaryRelativePath('v024b-smoke')).toBe('runs/v024/balance_summary.json');
    expect(buildComparisonArtifactBasename('v09c-smoke', 'v010')).toBe('v009_vs_v010');
  });

  it('refuses to silently overwrite persona trace evidence on rerun', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runVersion(runsRoot, 'v001');
      await expect(runVersion(runsRoot, 'v001')).rejects.toThrow(/Artifact already exists/);
    });
  });

  it('archives prior trace evidence when --on-existing archive is used', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const traceRelative = buildTraceRelativePath('v001', 'seed_001', 'careful_player');
      const tracePath = path.join(runsRoot, traceRelative);
      await runVersion(runsRoot, 'v001');
      const firstContents = await readFile(tracePath, 'utf8');

      await runVersion(runsRoot, 'v001', undefined, {
        onExisting: 'archive',
        policyContext: { archiveLabel: 'test-archive' },
      });

      const archiveRoot = path.join(runsRoot, 'runs', '_archive', 'test-archive', traceRelative);
      expect(await readFile(archiveRoot, 'utf8')).toBe(firstContents);
      expect(await readFile(tracePath, 'utf8')).toBeTruthy();
    });
  });

  it('overwrites trace evidence when --on-existing overwrite is used', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      const traceRelative = buildTraceRelativePath('v001', 'seed_001', 'careful_player');
      const tracePath = path.join(runsRoot, traceRelative);
      await runVersion(runsRoot, 'v001');

      await runVersion(runsRoot, 'v001', undefined, { onExisting: 'overwrite' });
      expect(await readFile(tracePath, 'utf8')).toBeTruthy();

      const archiveDir = path.join(runsRoot, 'runs', '_archive');
      await expect(stat(archiveDir)).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });

  it('persists version summaries and comparisons under deterministic paths', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runVersion(runsRoot, 'v001');
      await runVersion(runsRoot, 'v002');

      const { summaryPath } = await persistVersionSummary(runsRoot, 'v001', undefined, {
        onExisting: 'overwrite',
      });
      expect(summaryPath).toBe(path.join(runsRoot, buildVersionSummaryRelativePath('v001')));
      const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as { version: string };
      expect(summary.version).toBe('v001');

      const comparison = await persistVersionComparison(runsRoot, 'v001', 'v002', {
        onExisting: 'overwrite',
      });
      const { jsonPath, markdownPath } = buildComparisonRelativePaths('v001', 'v002');
      expect(comparison.jsonPath).toBe(jsonPath);
      expect(comparison.markdownPath).toBe(markdownPath);
      expect(
        buildComparisonArtifactBasename('v001', 'v002'),
      ).toBe('v001_vs_v002');
      expect(await readFile(path.join(runsRoot, jsonPath), 'utf8')).toContain('"baseVersion": "v001"');
      expect(await readFile(path.join(runsRoot, markdownPath), 'utf8')).toContain('# Version Comparison');
    });
  });

  it('refuses to overwrite balance summary without an explicit policy', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runBalanceBatch({ runsRoot, version: 'v010', seeds: ['seed_001'], policies: ['random'] });
      await expect(
        runBalanceBatch({ runsRoot, version: 'v010', seeds: ['seed_001'], policies: ['random'] }),
      ).rejects.toThrow(/Artifact already exists/);

      const summaryPath = path.join(runsRoot, buildBalanceSummaryRelativePath('v010'));
      await runBalanceBatch({
        runsRoot,
        version: 'v010',
        seeds: ['seed_001'],
        policies: ['random'],
        onExisting: 'archive',
        policyContext: { archiveLabel: 'balance-archive' },
      });

      const archiveSummaryPath = path.join(
        runsRoot,
        'runs',
        '_archive',
        'balance-archive',
        buildBalanceSummaryRelativePath('v010'),
      );
      const archived = await readFile(archiveSummaryPath, 'utf8');
      expect(archived.length).toBeGreaterThan(0);
      expect(await readFile(summaryPath, 'utf8')).toBe(archived);
    });
  });
});
