import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runInitCommand } from '../src/cli/commands/init.js';
import { analyzeWhyBlocked } from '../src/core/blocker-analysis.js';
import { stringifyDeterministicJson } from '../src/core/json.js';
import type { PhaseMergeEvidence } from '../src/core/phase-runner.js';

const withTempRepo = async (fn: (repoRoot: string) => Promise<void>): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-blocker-test-'));
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

const evidenceDir = (repoRoot: string, runId: string): string =>
  path.join(repoRoot, 'runs', 'phase-runner', 'PHASE-01A', runId);

const writeEvidenceFile = async (repoRoot: string, runId: string, file: string, value: unknown): Promise<void> => {
  const target = path.join(evidenceDir(repoRoot, runId), file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, stringifyDeterministicJson(value));
};

describe('why-blocked analysis', () => {
  it('returns a useful no-run message when no evidence exists', async () => {
    await withTempRepo(async (repoRoot) => {
      const report = await analyzeWhyBlocked(repoRoot, { latest: true });
      expect(report.status).toBe('no_run_found');
      expect(report.blockers).toEqual([]);
      expect(report.message).toContain('No run evidence');
    });
  });

  it('surfaces final-decision blockers', async () => {
    await withTempRepo(async (repoRoot) => {
      await writeEvidenceFile(repoRoot, 'blocked-run', 'final-decision.json', {
        stage: 'local-gate',
        decision: {
          decision: 'block',
          reasons: ['Remote PR checks are absent and policy does not allow local-only gating.'],
        },
      });
      const report = await analyzeWhyBlocked(repoRoot, { phase: 'PHASE-01A', latest: true });
      expect(report.status).toBe('blocked');
      expect(report.blockers[0]?.source).toBe('final-decision');
      expect(report.blockers[0]?.suggestedAction).toContain('manual mode');
    });
  });

  it('surfaces top-level final-decision blockers', async () => {
    await withTempRepo(async (repoRoot) => {
      await writeEvidenceFile(repoRoot, 'top-level-blocked-run', 'final-decision.json', {
        decision: 'block',
        reasons: ['Local command did not pass: pnpm test (fail)'],
      });
      const report = await analyzeWhyBlocked(repoRoot, { phase: 'PHASE-01A', latest: true });
      expect(report.status).toBe('blocked');
      expect(report.blockers[0]?.source).toBe('final-decision');
      expect(report.blockers[0]?.suggestedAction).toContain('Fix failing command');
    });
  });

  it('maps secret blockers to secret remediation', async () => {
    await withTempRepo(async (repoRoot) => {
      await writeEvidenceFile(repoRoot, 'secret-run', 'secret-scan.json', {
        secretsDetected: true,
        hits: ['Secret or credential material was detected in diff.'],
      });
      const report = await analyzeWhyBlocked(repoRoot, { phase: 'PHASE-01A', latest: true });
      expect(report.status).toBe('blocked');
      expect(report.blockers.map((entry) => entry.source)).toContain('secret-scan');
      expect(report.blockers.find((entry) => entry.source === 'secret-scan')?.suggestedAction).toContain(
        'Remove credential-like content',
      );
    });
  });

  it('maps changed path blockers to allowed-path remediation', async () => {
    await withTempRepo(async (repoRoot) => {
      const mergeEvidence: PhaseMergeEvidence = {
        localCommands: [],
        remoteChecks: 'pass',
        cursorRecheck: 'pass',
        phaseAcceptanceComplete: true,
        changedPaths: ['outside/file.ts'],
        worktreeClean: true,
        secretsDetected: false,
        blockingGaps: ['Changed path outside phase scope: outside/file.ts'],
      };
      await writeEvidenceFile(repoRoot, 'path-run', 'phase-merge-evidence.json', mergeEvidence);
      const report = await analyzeWhyBlocked(repoRoot, { phase: 'PHASE-01A', latest: true });
      expect(report.status).toBe('blocked');
      const pathBlocker = report.blockers.find((entry) => entry.message.includes('Changed path outside phase scope'));
      expect(pathBlocker?.suggestedAction).toContain('allowed path');
    });
  });

  it('reads root local-validation and recheck report files named in the package prompt', async () => {
    await withTempRepo(async (repoRoot) => {
      await writeEvidenceFile(repoRoot, 'root-evidence-run', 'local-validation.json', {
        results: [
          {
            command: 'pnpm test',
            cwd: repoRoot,
            exitCode: 1,
            startedAt: '2026-05-25T00:00:00.000Z',
            finishedAt: '2026-05-25T00:00:01.000Z',
            durationMs: 1000,
            stdoutPath: 'stdout.log',
            stderrPath: 'stderr.log',
            status: 'fail',
          },
        ],
      });
      await writeEvidenceFile(repoRoot, 'root-evidence-run', 'recheck-report.json', {
        schemaVersion: 1,
        phase: 'PHASE-01A',
        status: 'blocked',
        phaseAcceptanceComplete: false,
        blockingGaps: ['Phase acceptance criteria are incomplete.'],
      });
      const report = await analyzeWhyBlocked(repoRoot, { phase: 'PHASE-01A', latest: true });
      expect(report.status).toBe('blocked');
      expect(report.blockers.map((entry) => entry.source)).toContain('local-validation');
      expect(report.blockers.map((entry) => entry.source)).toContain('recheck-report');
    });
  });
});
