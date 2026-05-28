import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runInitCommand } from '../src/cli/commands/init.js';
import { generateRunReport } from '../src/core/report.js';

const withTempRepo = async (fn: (repoRoot: string) => Promise<void>): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-report-test-'));
  try {
    await runInitCommand(repoRoot, {});
    await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
};

describe('run reports', () => {
  it('returns useful Markdown when no run exists', async () => {
    await withTempRepo(async (repoRoot) => {
      const report = await generateRunReport(repoRoot, { latest: true });
      expect(report.status).toBe('generated');
      expect(report.markdown).toContain('# Agentic Run Report');
      expect(report.markdown).toContain('No run evidence was found');
    });
  });

  it('writes Markdown for latest run evidence', async () => {
    await withTempRepo(async (repoRoot) => {
      const runDir = path.join(repoRoot, 'runs', 'phase-runner', 'PHASE-01A', '2026-05-25T00-00-00-000Z');
      await mkdir(runDir, { recursive: true });
      await writeFile(
        path.join(runDir, 'run-state.json'),
        JSON.stringify({
          schemaVersion: 1,
          phase: 'PHASE-01A',
          runId: '2026-05-25T00-00-00-000Z',
          status: 'blocked',
          currentStage: 'local-gate',
          completedStages: [],
          dryRun: false,
          safetyFlags: { allowAgentExecution: false, allowPr: false, allowMerge: false },
          startedAt: '2026-05-25T00:00:00.000Z',
          updatedAt: '2026-05-25T00:00:00.000Z',
        }),
      );
      await writeFile(
        path.join(runDir, 'final-decision.json'),
        JSON.stringify({
          status: 'blocked',
          decision: { decision: 'block', reasons: ['Remote PR checks are absent'] },
        }),
      );
      const report = await generateRunReport(repoRoot, {
        latest: true,
        output: '.agentic/reports/latest-run.md',
      });
      expect(report.status).toBe('written');
      await expect(readFile(path.join(repoRoot, '.agentic', 'reports', 'latest-run.md'), 'utf8')).resolves.toContain(
        'Remote PR checks are absent',
      );
    });
  });
});
