import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { PlannerReport } from '../src/harness/agent-report-parser.js';
import { executeStage, type AutopilotConfig } from '../src/harness/phase-autopilot.js';
import type { RestrictedAgentCommandExecutor } from '../src/harness/restricted-agent/index.js';

const repoRoot = process.cwd();

const safeFlags = {
  allowAgentExecution: true,
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

const config = (enabled: boolean): AutopilotConfig => ({
  schemaVersion: 1,
  git: { baseBranch: 'main', baseRef: 'origin/main' },
  agents: {
    planner: { provider: 'shell', commandTemplate: 'manual-planner' },
    executor: { provider: 'shell', commandTemplate: 'manual-executor' },
    rechecker: { provider: 'shell', commandTemplate: 'manual-rechecker' },
    cursorSubtask: { provider: 'shell', commandTemplate: 'manual-cursor' },
  },
  dependencyBootstrapCommands: [],
  commandExecutor: { defaultTimeoutMs: 1000, inactivityTimeoutMs: 1000, maxRetries: 0 },
  restrictedAgentDelegate: {
    enabled,
    providerMode: 'fake',
    maxAttempts: 1,
    commandIds: ['focused_tests'],
    patchBudget: { maxFiles: 1, maxBytes: 2000 },
    evidenceDirName: 'restricted-agent-tasks',
  },
});

const writeAcceptedPlan = async (phase: string, runId: string, plan: PlannerReport): Promise<string> => {
  const evidenceDir = path.join(repoRoot, 'runs', 'phase-runner', phase, runId);
  await mkdir(path.join(evidenceDir, 'accepted-plan'), { recursive: true });
  await writeFile(path.join(evidenceDir, 'accepted-plan', 'accepted-plan.json'), JSON.stringify(plan));
  return evidenceDir;
};

const passingRestrictedCheckExecutor: RestrictedAgentCommandExecutor = async () => ({
  exitCode: 0,
  stdout: 'fake focused tests passed',
  stderr: '',
  durationMs: 1,
});

describe('Phase 31A restricted delegate autopilot integration', () => {
  it('blocks restricted delegate execution without an accepted plan', async () => {
    const runId = `missing-plan-${Date.now()}`;
    const evidenceDir = path.join(repoRoot, 'runs', 'phase-runner', 'PHASE-31A', runId);
    try {
      await expect(
        executeStage(repoRoot, 'PHASE-31A', 'restricted-agent-delegate', {
          runId,
          safetyFlags: safeFlags,
          deps: { autopilotConfig: config(true) },
        }),
      ).rejects.toThrow('accepted-plan');
    } finally {
      await rm(evidenceDir, { recursive: true, force: true });
    }
  });

  it('runs only accepted-plan tasks explicitly marked for restricted delegation', async () => {
    const runId = `restricted-delegate-${Date.now()}`;
    const acceptedPlan = {
      schemaVersion: 1,
      phase: 'PHASE-31A',
      status: 'pass',
      summary: 'restricted delegate task',
      tasks: [
        {
          id: 'task-001',
          title: 'Marked restricted task',
          description: 'Run fake restricted delegate checks',
          allowedPaths: ['src/harness/**'],
          acceptanceCriteriaCovered: ['AC-3'],
          restrictedAgentDelegation: { recommended: true, reason: 'bounded fake test' },
        },
        {
          id: 'task-002',
          title: 'Unmarked task',
          description: 'Should not run',
          allowedPaths: ['src/harness/**'],
          acceptanceCriteriaCovered: ['AC-4'],
        },
      ],
      requiredFocusedTests: ['pnpm test tests/restricted-agent-autopilot.test.ts'],
      requiredSmokeCommands: [],
      requiredArtifacts: [],
      risks: [],
      questions: [],
      planAcceptanceRecommendation: 'accept',
    } as PlannerReport;
    const evidenceDir = await writeAcceptedPlan('PHASE-31A', runId, acceptedPlan);
    try {
      const summary = await executeStage(repoRoot, 'PHASE-31A', 'restricted-agent-delegate', {
        runId,
        safetyFlags: safeFlags,
        deps: {
          autopilotConfig: config(true),
          restrictedAgentCommandExecutor: passingRestrictedCheckExecutor,
        },
      });

      expect(summary.currentStage).toBe('recheck');
      const taskSummary = JSON.parse(
        await readFile(path.join(evidenceDir, 'restricted-agent-tasks', 'restricted-agent-tasks.json'), 'utf8'),
      ) as { status: string; tasks: Array<{ taskId: string }> };
      expect(taskSummary.status).toBe('pass');
      expect(taskSummary.tasks.map((task) => task.taskId)).toEqual(['task-001']);
      const report = await readFile(
        path.join(evidenceDir, 'restricted-agent-tasks', 'task-001', 'repair-loop-report.json'),
        'utf8',
      );
      expect(report).toContain('"canCommit": false');
    } finally {
      await rm(evidenceDir, { recursive: true, force: true });
    }
  });

  it('writes disabled evidence and preserves Cursor as optional when no restricted delegate is enabled', async () => {
    const runId = `restricted-disabled-${Date.now()}`;
    const acceptedPlan = {
      schemaVersion: 1,
      phase: 'PHASE-31A',
      status: 'pass',
      summary: 'no restricted task',
      tasks: [],
      requiredFocusedTests: [],
      requiredSmokeCommands: [],
      requiredArtifacts: [],
      risks: [],
      questions: [],
      planAcceptanceRecommendation: 'accept',
    } as PlannerReport;
    const evidenceDir = await writeAcceptedPlan('PHASE-31A', runId, acceptedPlan);
    try {
      const summary = await executeStage(repoRoot, 'PHASE-31A', 'restricted-agent-delegate', {
        runId,
        safetyFlags: safeFlags,
        deps: { autopilotConfig: config(false) },
      });

      expect(summary.currentStage).toBe('recheck');
      const taskSummary = await readFile(
        path.join(evidenceDir, 'restricted-agent-tasks', 'restricted-agent-tasks.json'),
        'utf8',
      );
      expect(taskSummary).toContain('"status": "disabled"');
    } finally {
      await rm(evidenceDir, { recursive: true, force: true });
    }
  });
});
