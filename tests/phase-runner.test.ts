import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildPhaseRunBundle,
  evaluateAutomerge,
  getRunnablePhases,
  loadPhaseRunnerConfig,
  markPhaseBlocked,
  markPhaseComplete,
  phasePathScopesConflict,
  validatePhaseGraph,
  writePhaseRunBundle,
  type PhaseMergeEvidence,
} from '../src/harness/phase-runner.js';

const repoRoot = process.cwd();

const withTempDir = async (fn: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'df-phase-runner-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

describe('phase runner automation core', () => {
  it('loads the phase graph and finds PHASE-13A as the next Codex orchestration job', async () => {
    const config = await loadPhaseRunnerConfig(repoRoot);
    expect(validatePhaseGraph(config.graph)).toEqual([]);

    const runnable = getRunnablePhases(config, {
      repoRoot,
      from: 'PHASE-13A',
      parallel: 2,
      runId: 'test-run',
    });

    expect(runnable).toHaveLength(1);
    expect(runnable[0]?.phase.id).toBe('PHASE-13A');
    expect(runnable[0]?.codexOrchestrator).toMatchObject({
      role: 'codex',
      canUseCursor: true,
    });
    expect(runnable[0]?.cursorDelegate.model).toBe('composer-2.5');
    expect(runnable[0]?.cursorDelegate.implementationCommand).toContain('agent --print --trust');
  });

  it('keeps overlapping path scopes out of the same parallel batch', async () => {
    const config = await loadPhaseRunnerConfig(repoRoot);
    config.state.phases['PHASE-13A'] = { status: 'complete' };

    const phase13b = config.graph.phases.find((phase) => phase.id === 'PHASE-13B');
    const phase13c = config.graph.phases.find((phase) => phase.id === 'PHASE-13C');
    expect(phase13b && phase13c ? phasePathScopesConflict(phase13b, phase13c) : undefined).toBe(
      true,
    );

    const runnable = getRunnablePhases(config, {
      repoRoot,
      from: 'PHASE-13B',
      parallel: 2,
    });

    expect(runnable).toHaveLength(1);
    expect(['PHASE-13B', 'PHASE-13C']).toContain(runnable[0]?.phase.id);
  });

  it('renders a phase bundle for Codex orchestration and Cursor delegation', async () => {
    const config = await loadPhaseRunnerConfig(repoRoot);
    const bundle = await buildPhaseRunBundle(config, repoRoot, 'PHASE-13A', 'unit-test');

    expect(bundle.branch).toBe('phase/phase-13a-evidence-retention');
    expect(bundle.codexPlanPrompt).toContain('YOU ARE AN AGENT ORCHESTRATOR');
    expect(bundle.codexPlanPrompt).toContain('# PHASE-13A - Evidence Retention');
    expect(bundle.cursorImplementationPrompt).toContain('Model expectation: Composer 2.5');
    expect(bundle.cursorImplementationPrompt).toContain('- src/harness/**');
    expect(bundle.cursorRecheckPrompt).toContain('Can you check whether PHASE-13A');
    expect(bundle.commands.pr).toContain('gh pr checks <pr-number> --watch');
  });

  it('writes prompt bundles and command metadata to an evidence directory', async () => {
    const config = await loadPhaseRunnerConfig(repoRoot);
    const bundle = await buildPhaseRunBundle(config, repoRoot, 'PHASE-13A', 'write-test');

    await withTempDir(async (dir) => {
      await writePhaseRunBundle(bundle, dir);
      const plan = await readFile(path.join(dir, 'phase-run-plan.json'), 'utf8');
      const cursorPrompt = await readFile(
        path.join(dir, 'cursor-implementation-prompt.md'),
        'utf8',
      );

      expect(JSON.parse(plan)).toMatchObject({
        branch: 'phase/phase-13a-evidence-retention',
        phase: { id: 'PHASE-13A' },
      });
      expect(cursorPrompt).toContain('Implement PHASE-13A');
    });
  });

  it('allows automerge only when all deterministic gates and scope checks pass', async () => {
    const config = await loadPhaseRunnerConfig(repoRoot);
    const phase = config.graph.phases.find((entry) => entry.id === 'PHASE-13A');
    expect(phase).toBeDefined();

    const passingEvidence: PhaseMergeEvidence = {
      localCommands: config.automergePolicy.requiredLocalCommands.map((command) => ({
        command,
        status: 'pass',
      })),
      remoteChecks: 'none',
      cursorRecheck: 'pass',
      phaseAcceptanceComplete: true,
      changedPaths: ['src/harness/phase-runner.ts', 'tests/phase-runner.test.ts', 'PROGRESS.MD'],
      worktreeClean: true,
      secretsDetected: false,
      blockingGaps: [],
    };

    const allowed = evaluateAutomerge(phase!, config.automergePolicy, passingEvidence);
    expect(allowed).toMatchObject({
      decision: 'allow',
      deleteBranchAfterMerge: true,
      removeCleanWorktreeAfterMerge: true,
    });

    const blocked = evaluateAutomerge(phase!, config.automergePolicy, {
      ...passingEvidence,
      changedPaths: ['src/game/engine.ts', '.env'],
      secretsDetected: true,
      blockingGaps: ['Acceptance report missing'],
    });
    expect(blocked.decision).toBe('block');
    expect(blocked.reasons).toEqual(
      expect.arrayContaining([
        'Changed path is outside phase scope: src/game/engine.ts',
        'Changed path is outside phase scope: .env',
        'Secret or credential material was detected.',
        'Blocking gap remains: Acceptance report missing',
      ]),
    );
  });

  it('marks phases complete or blocked in automation state', async () => {
    const config = await loadPhaseRunnerConfig(repoRoot);
    const completed = markPhaseComplete(
      config.graph,
      config.state,
      'PHASE-13A',
      {
        branch: 'phase/phase-13a-evidence-retention',
        evidenceDir: 'runs/phase-runner/PHASE-13A/run-001',
        mergeCommit: 'abc1234',
        pr: 27,
      },
      '2026-05-23',
    );

    expect(completed.phases['PHASE-13A']).toMatchObject({
      branch: 'phase/phase-13a-evidence-retention',
      evidenceDir: 'runs/phase-runner/PHASE-13A/run-001',
      mergeCommit: 'abc1234',
      pr: 27,
      status: 'complete',
    });
    expect(completed.currentPhase).toBe('PHASE-13B');

    const blocked = markPhaseBlocked(
      config.graph,
      config.state,
      'PHASE-13A',
      'PR checks failed',
      '2026-05-23',
    );
    expect(blocked.currentPhase).toBe('PHASE-13A');
    expect(blocked.phases['PHASE-13A']).toMatchObject({
      reason: 'PR checks failed',
      status: 'blocked',
    });
  });
});
