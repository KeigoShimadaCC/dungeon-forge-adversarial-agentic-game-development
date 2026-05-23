import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseAgentStructuredReport, type PlannerReport } from '../src/harness/agent-report-parser.js';
import { createSpawnCommandExecutor } from '../src/harness/command-executor.js';
import { collectPhaseMergeEvidence } from '../src/harness/evidence-collector.js';
import { parseChecksOutput, parsePrCreateOutput } from '../src/harness/github-cli-adapter.js';
import {
  buildCursorSubtaskPrompt,
  executeStage,
  runAutopilotForPhase,
} from '../src/harness/phase-autopilot.js';
import { loadPhaseRunnerConfig, type PhaseMergeEvidence } from '../src/harness/phase-runner.js';
import { validatePlannerReportForAcceptance } from '../src/harness/plan-acceptance.js';
import { scanChangedPathsForSecrets } from '../src/harness/secret-scan.js';

const repoRoot = process.cwd();

const safeFlags = {
  allowAgentExecution: false,
  allowPr: false,
  allowMerge: false,
  dryRun: false,
  continueOnBlocked: false,
  parallel: 1,
  planApproval: 'manual' as const,
  plannerAgent: 'manual' as const,
  executorAgent: 'manual' as const,
  recheckerAgent: 'manual' as const,
};

const withTempDir = async (fn: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'df-phase-autopilot-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

describe('phase autopilot execution layer', () => {
  it('captures command stdout, stderr, and nonzero status as structured evidence', async () => {
    await withTempDir(async (dir) => {
      const executor = createSpawnCommandExecutor();
      const result = await executor.run(
        'node -e "console.log(\'out\'); console.error(\'err\'); process.exit(7)"',
        {
          cwd: repoRoot,
          stdoutPath: path.join(dir, 'command.stdout.log'),
          stderrPath: path.join(dir, 'command.stderr.log'),
        },
      );

      expect(result.status).toBe('fail');
      expect(result.exitCode).toBe(7);
      expect(await readFile(result.stdoutPath, 'utf8')).toContain('out');
      expect(await readFile(result.stderrPath, 'utf8')).toContain('err');
      expect(result.resultPath).toBe(path.join(dir, 'command.json'));
    });
  });

  it('parses fenced structured agent reports', () => {
    const parsed = parseAgentStructuredReport(
      [
        'done',
        '```json',
        '{"schemaVersion":1,"phase":"PHASE-20A","status":"pass","phaseAcceptanceComplete":true,"blockingGaps":[]}',
        '```',
      ].join('\n'),
      'rechecker',
      'PHASE-20A',
    );

    expect(parsed.ok).toBe(true);
    expect(parsed.report).toMatchObject({
      phase: 'PHASE-20A',
      status: 'pass',
    });
  });

  it('builds merge evidence from actual command and scope inputs', async () => {
    const config = await loadPhaseRunnerConfig(repoRoot);
    const phase = config.graph.phases.find((entry) => entry.id === 'PHASE-20A');
    expect(phase).toBeDefined();

    const evidence = collectPhaseMergeEvidence({
      phase: phase!,
      policy: config.automergePolicy,
      localCommandResults: config.automergePolicy.requiredLocalCommands.map((command) => ({
        command,
        cwd: repoRoot,
        exitCode: 0,
        startedAt: '2026-05-23T00:00:00.000Z',
        finishedAt: '2026-05-23T00:00:00.001Z',
        durationMs: 1,
        stdoutPath: '/tmp/stdout.log',
        stderrPath: '/tmp/stderr.log',
        status: 'pass' as const,
      })),
      recheckReport: {
        schemaVersion: 1,
        phase: 'PHASE-20A',
        status: 'pass',
        phaseAcceptanceComplete: true,
        blockingGaps: [],
      },
      changedPaths: ['src/harness/phase-autopilot.ts', '.env.local'],
      worktreeStatus: { branch: 'phase/test', clean: false, porcelain: ' M file', raw: 'raw' },
      secretScan: scanChangedPathsForSecrets({ changedPaths: ['.env.local'] }),
      remoteChecks: 'none',
    });

    expect(evidence).toMatchObject<Partial<PhaseMergeEvidence>>({
      cursorRecheck: 'pass',
      phaseAcceptanceComplete: true,
      worktreeClean: false,
      secretsDetected: true,
    });
    expect(evidence.blockingGaps.join('\n')).toContain('forbidden path: .env.local');
  });

  it('parses GitHub CLI metadata without calling gh', () => {
    expect(parsePrCreateOutput('https://github.com/acme/repo/pull/123')).toEqual({
      number: 123,
      url: 'https://github.com/acme/repo/pull/123',
    });
    expect(parseChecksOutput('Repo gates pass')).toBe('pass');
    expect(parseChecksOutput('Repo gates fail')).toBe('fail');
    expect(parseChecksOutput('no checks reported')).toBe('none');
  });

  it('writes a dry-run autopilot plan without enabling agents, PRs, or merge', async () => {
    const runId = `unit-dry-run-${Date.now()}`;
    const summary = await runAutopilotForPhase(repoRoot, 'PHASE-20A', {
      runId,
      safetyFlags: {
        ...safeFlags,
        dryRun: true,
      },
    });

    try {
      expect(summary.status).toBe('complete');
      expect(summary.dryRun).toBe(true);
      const plan = await readFile(path.join(summary.evidenceDir, 'dry-run-plan.txt'), 'utf8');
      expect(plan).toContain('Phase: PHASE-20A');
      expect(plan).toContain('Allow agents: false');
      const state = JSON.parse(
        await readFile(path.join(summary.evidenceDir, 'run-state.json'), 'utf8'),
      );
      expect(state.safetyFlags).toMatchObject({
        allowAgentExecution: false,
        allowPr: false,
        allowMerge: false,
      });
    } finally {
      await rm(summary.evidenceDir, { recursive: true, force: true });
    }
  });

  it('blocks plan acceptance when planner tasks exceed allowed paths', async () => {
    const config = await loadPhaseRunnerConfig(repoRoot);
    const phase = config.graph.phases.find((entry) => entry.id === 'PHASE-20A');
    expect(phase).toBeDefined();
    const report: PlannerReport = {
      schemaVersion: 1,
      phase: 'PHASE-20A',
      status: 'pass',
      summary: 'bad plan',
      tasks: [
        {
          id: 'task-003',
          title: 'Touch game',
          description: 'Out of scope',
          allowedPaths: ['src/game/**'],
          acceptanceCriteriaCovered: ['AC-1'],
          cursorDelegation: { recommended: false, reason: 'n/a' },
        },
      ],
      requiredFocusedTests: ['pnpm test tests/phase-autopilot.test.ts'],
      requiredSmokeCommands: ['pnpm run phase -- autopilot --phase PHASE-20A --dry-run'],
      requiredArtifacts: ['runs/phase-runner/PHASE-20A/<run-id>/phase-merge-evidence.json'],
      risks: [],
      questions: [],
      planAcceptanceRecommendation: 'accept',
    };

    const decision = validatePlannerReportForAcceptance(phase!, report, 'auto');
    expect(decision.decision).toBe('block');
    expect(decision.reasons.join('\n')).toContain('src/game/**');
  });

  it('blocks executor stage when no accepted plan exists', async () => {
    await expect(
      executeStage(repoRoot, 'PHASE-20A', 'execution', {
        runId: `missing-accepted-plan-${Date.now()}`,
        safetyFlags: safeFlags,
      }),
    ).rejects.toThrow('accepted-plan/accepted-plan.json');
  });

  it('renders Cursor subtask prompts from accepted-plan task boundaries', () => {
    const prompt = buildCursorSubtaskPrompt({
      phaseId: 'PHASE-20A',
      taskId: 'task-001',
      taskTitle: 'Implement command executor',
      allowedPaths: ['src/harness/**', 'tests/**'],
      requiredCommands: ['pnpm test tests/phase-autopilot.test.ts'],
      acceptedPlanPath: 'runs/phase-runner/PHASE-20A/run/accepted-plan/accepted-plan.json',
    });

    expect(prompt).toContain('Task ID: task-001');
    expect(prompt).toContain('- src/harness/**');
    expect(prompt).toContain('Do not implement from the raw phase plan');
  });
});
