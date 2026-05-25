import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runInitCommand } from '../src/cli/commands/init.js';
import { runAutopilotForPhase } from '../src/core/phase-autopilot.js';
import { inspectRepo } from '../src/core/inspect.js';

const withTempRepo = async (fn: (repoRoot: string) => Promise<void>): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-inspect-test-'));
  try {
    await silenceStdout(async () => {
      await runInitCommand(repoRoot, {});
    });
    await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
};

const silenceStdout = async (fn: () => Promise<void>): Promise<void> => {
  const originalWrite = process.stdout.write;
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = originalWrite;
  }
};

const dryRunFlags = {
  allowAgentExecution: false,
  allowPr: false,
  allowMerge: false,
  dryRun: true,
  continueOnBlocked: false,
  parallel: 1,
  planApproval: 'manual' as const,
  plannerAgent: 'manual' as const,
  executorAgent: 'manual' as const,
  recheckerAgent: 'manual' as const,
};

describe('inspect', () => {
  it('summarizes an initialized repo without runs', async () => {
    await withTempRepo(async (repoRoot) => {
      const report = await inspectRepo(repoRoot);
      expect(report.currentPhase).toBe('PHASE-01A');
      expect(report.phaseCounts.queued).toBe(1);
      expect(report.nextRunnable).toEqual(['PHASE-01A']);
      expect(report.message).toContain('No run evidence');
    });
  });

  it('summarizes the latest dry-run evidence', async () => {
    await withTempRepo(async (repoRoot) => {
      await runAutopilotForPhase(repoRoot, 'PHASE-01A', {
        runId: '2026-05-25T00-00-00Z',
        safetyFlags: dryRunFlags,
      });
      const report = await inspectRepo(repoRoot, { latest: true });
      expect(report.latestRun?.phase).toBe('PHASE-01A');
      expect(report.latestRun?.runId).toBe('2026-05-25T00-00-00Z');
      expect(report.latestRun?.status).toBe('complete');
      expect(report.latestRun?.finalDecision).toBeDefined();
    });
  });

  it('handles missing runs gracefully', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-inspect-empty-'));
    try {
      const report = await inspectRepo(repoRoot, { latest: true });
      expect(report.nextRunnable).toEqual([]);
      expect(report.message).toContain('No run evidence');
      expect(report.recommendedNextActions.join('\n')).toContain('init');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});

