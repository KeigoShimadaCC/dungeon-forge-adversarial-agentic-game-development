import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runInitCommand } from '../src/cli/commands/init.js';
import { loadRunnerContext } from '../src/cli/commands/shared.js';
import { runAutopilotForPhase } from '../src/core/phase-autopilot.js';
import {
  buildPhaseRunBundle,
  evaluateAutomerge,
  getRunnablePhases,
  type PhaseMergeEvidence,
} from '../src/core/phase-runner.js';

const withTempRepo = async (fn: (repoRoot: string) => Promise<void>): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-package-smoke-'));
  try {
    await runInitCommand(repoRoot, {});
    await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
};

describe('agentic phase runner package', () => {
  it('initializes a minimal repo from templates without root package files', async () => {
    await withTempRepo(async (repoRoot) => {
      await expect(readFile(path.join(repoRoot, 'AGENTS.md'), 'utf8')).resolves.toContain(
        'Operating Rules',
      );
      await expect(readFile(path.join(repoRoot, 'automation', 'phase-graph.json'), 'utf8')).resolves.toContain(
        'PHASE-01A',
      );
    });
  });

  it('loads graph/state and selects a runnable phase', async () => {
    await withTempRepo(async (repoRoot) => {
      const { config } = await loadRunnerContext(repoRoot);
      const runnable = getRunnablePhases(config, { repoRoot, from: 'PHASE-01A', parallel: 1 });
      expect(runnable).toHaveLength(1);
      expect(runnable[0]?.phase.id).toBe('PHASE-01A');
    });
  });

  it('builds a phase bundle from generic prompt templates', async () => {
    await withTempRepo(async (repoRoot) => {
      const { config, paths } = await loadRunnerContext(repoRoot);
      const bundle = await buildPhaseRunBundle(config, repoRoot, 'PHASE-01A', 'smoke-run', paths);
      expect(bundle.codexPlanPrompt).toContain('You are the planner');
      expect(bundle.cursorImplementationPrompt).toContain('You are the executor');
      expect(bundle.cursorRecheckPrompt).toContain('You are the recheck agent');
      expect(bundle.evidenceDir).toContain(path.join('runs', 'phase-runner', 'PHASE-01A', 'smoke-run'));
    });
  });

  it('writes dry-run evidence without invoking agents or git mutations', async () => {
    await withTempRepo(async (repoRoot) => {
      const summary = await runAutopilotForPhase(repoRoot, 'PHASE-01A', {
        runId: 'dry-smoke',
        safetyFlags: {
          allowAgentExecution: false,
          allowPr: false,
          allowMerge: false,
          dryRun: true,
          continueOnBlocked: false,
          parallel: 1,
          planApproval: 'manual',
          plannerAgent: 'manual',
          executorAgent: 'manual',
          recheckerAgent: 'manual',
        },
      });
      expect(summary.status).toBe('complete');
      await expect(readFile(path.join(summary.evidenceDir, 'dry-run-plan.txt'), 'utf8')).resolves.toContain(
        'Dry run: true',
      );
    });
  });

  it('blocks gate decisions for out-of-scope paths and secrets', async () => {
    await withTempRepo(async (repoRoot) => {
      const { config } = await loadRunnerContext(repoRoot);
      const phase = config.graph.phases[0];
      expect(phase).toBeDefined();
      const evidence: PhaseMergeEvidence = {
        localCommands: config.automergePolicy.requiredLocalCommands.map((command) => ({
          command,
          status: 'pass',
        })),
        remoteChecks: 'none',
        cursorRecheck: 'pass',
        phaseAcceptanceComplete: true,
        changedPaths: ['.env', 'src/index.ts'],
        worktreeClean: true,
        secretsDetected: true,
        blockingGaps: ['manual blocker'],
      };
      const decision = evaluateAutomerge(phase!, config.automergePolicy, evidence);
      expect(decision.decision).toBe('block');
      expect(decision.reasons.join('\n')).toContain('Secret or credential material was detected');
    });
  });
});
