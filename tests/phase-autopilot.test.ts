import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseAgentStructuredReport, type PlannerReport } from '../src/harness/agent-report-parser.js';
import {
  createSpawnCommandExecutor,
  type CommandExecutionResult,
  type CommandExecutor,
} from '../src/harness/command-executor.js';
import { collectPhaseMergeEvidence, writePhaseMergeEvidence } from '../src/harness/evidence-collector.js';
import { createGitAdapter, type GitAdapter } from '../src/harness/git-adapter.js';
import {
  createGitHubCliAdapter,
  parseChecksOutput,
  parsePrCreateOutput,
  parsePrViewMergeState,
  type GitHubCliAdapter,
} from '../src/harness/github-cli-adapter.js';
import {
  buildCursorSubtaskPrompt,
  executeStage,
  type AutopilotConfig,
  runAutopilotForPhase,
} from '../src/harness/phase-autopilot.js';
import { loadPhaseRunnerConfig, type PhaseMergeEvidence } from '../src/harness/phase-runner.js';
import { parseAcceptanceCriteria, validatePlannerReportForAcceptance } from '../src/harness/plan-acceptance.js';
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

const commandResult = (
  command: string,
  cwd = repoRoot,
  status: CommandExecutionResult['status'] = 'pass',
): CommandExecutionResult => ({
  command,
  cwd,
  exitCode: status === 'pass' ? 0 : 1,
  startedAt: '2026-05-23T00:00:00.000Z',
  finishedAt: '2026-05-23T00:00:00.001Z',
  durationMs: 1,
  stdoutPath: '/tmp/stdout.log',
  stderrPath: '/tmp/stderr.log',
  status,
});

const fakeAutopilotConfig = (): AutopilotConfig => ({
  schemaVersion: 1,
  git: { baseBranch: 'main', baseRef: 'origin/main' },
  agents: {
    planner: { provider: 'shell', commandTemplate: 'fake-planner' },
    executor: { provider: 'shell', commandTemplate: 'fake-executor' },
    rechecker: { provider: 'shell', commandTemplate: 'fake-rechecker' },
    cursorSubtask: { provider: 'shell', commandTemplate: 'fake-cursor' },
  },
  dependencyBootstrapCommands: [],
  commandExecutor: { defaultTimeoutMs: 1000, inactivityTimeoutMs: 1000, maxRetries: 0 },
});

const fakeExecutor = (outputs: Record<string, string> = {}): CommandExecutor => ({
  async run(command, options) {
    await mkdir(path.dirname(options.stdoutPath), { recursive: true });
    await mkdir(path.dirname(options.stderrPath), { recursive: true });
    const displayedCommand = [command, ...(options.args ?? [])].join(' ');
    const key = Object.keys(outputs).find((candidate) => displayedCommand.includes(candidate));
    const stdout = key ? outputs[key] : '';
    await writeFile(options.stdoutPath, stdout);
    await writeFile(options.stderrPath, '');
    return {
      ...commandResult(displayedCommand, options.cwd),
      stdoutPath: options.stdoutPath,
      stderrPath: options.stderrPath,
    };
  },
});

const fakeGit = (input: {
  changedPaths?: string[];
  diffText?: string;
  clean?: boolean;
} = {}): GitAdapter => ({
  async fetchOrigin() {
    return commandResult('git fetch origin');
  },
  async createWorktree() {
    return commandResult('git worktree add');
  },
  async changedPaths() {
    return input.changedPaths ?? ['src/harness/phase-autopilot.ts'];
  },
  async diffText() {
    return input.diffText ?? 'diff --git a/src/harness/phase-autopilot.ts b/src/harness/phase-autopilot.ts';
  },
  async status() {
    return {
      branch: 'phase/phase-21a-autopilot-hardening',
      clean: input.clean ?? true,
      porcelain: input.clean === false ? ' M src/harness/phase-autopilot.ts' : '',
      raw: '',
    };
  },
  async commitIfNeeded() {
    return { committed: true, commitSha: 'abc1234', commandResult: commandResult('git commit') };
  },
  async removeWorktree() {
    return commandResult('git worktree remove');
  },
});

const fakeGithub = (input: { mergeSucceeds?: boolean; remoteMerged?: boolean } = {}): GitHubCliAdapter => ({
  async createPullRequest() {
    return { number: 123, url: 'https://github.com/acme/repo/pull/123', branch: 'b', base: 'main', rawStdout: '' };
  },
  async watchChecks() {
    return { status: 'pass', rawStdout: 'pass', commandResult: commandResult('gh pr checks') };
  },
  async mergePullRequest() {
    return {
      merged: input.mergeSucceeds ?? true,
      ...(input.mergeSucceeds === false ? { failureReason: 'simulated merge failure' } : {}),
      commandResult: commandResult('gh pr merge', repoRoot, input.mergeSucceeds === false ? 'fail' : 'pass'),
    };
  },
  async verifyPullRequestMerged() {
    return {
      merged: input.remoteMerged ?? false,
      state: input.remoteMerged ? 'MERGED' : 'OPEN',
      ...(input.remoteMerged ? { mergeCommit: 'def5678', mergedAt: '2026-05-23T00:00:00Z' } : {}),
      rawStdout: '',
      commandResult: commandResult('gh pr view'),
    };
  },
});

const writeAllowingMergeEvidence = async (phaseId: string, runId: string): Promise<string> => {
  const config = await loadPhaseRunnerConfig(repoRoot);
  const phase = config.graph.phases.find((entry) => entry.id === phaseId);
  expect(phase).toBeDefined();
  const evidenceDir = path.join(repoRoot, 'runs', 'phase-runner', phaseId, runId);
  await mkdir(evidenceDir, { recursive: true });
  const evidence = collectPhaseMergeEvidence({
    phase: phase!,
    policy: config.automergePolicy,
    localCommandResults: config.automergePolicy.requiredLocalCommands.map((command) =>
      commandResult(command),
    ),
    recheckReport: {
      schemaVersion: 1,
      phase: phaseId,
      status: 'pass',
      phaseAcceptanceComplete: true,
      blockingGaps: [],
    },
    changedPaths: ['src/harness/phase-autopilot.ts', 'tests/phase-autopilot.test.ts', 'PROGRESS.MD'],
    worktreeStatus: { branch: 'phase/test', clean: true, porcelain: '', raw: '' },
    secretScan: { secretsDetected: false, hits: [] },
    remoteChecks: 'pass',
  });
  await writePhaseMergeEvidence(evidenceDir, evidence);
  await writeFile(path.join(evidenceDir, 'pr.json'), JSON.stringify({ number: 123 }));
  return evidenceDir;
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

  it('records retry attempts and classifies inactivity timeouts distinctly', async () => {
    await withTempDir(async (dir) => {
      const executor = createSpawnCommandExecutor();
      const retried = await executor.run('node -e "process.exit(3)"', {
        cwd: repoRoot,
        stdoutPath: path.join(dir, 'retry.stdout.log'),
        stderrPath: path.join(dir, 'retry.stderr.log'),
        maxRetries: 1,
      });
      expect(retried.status).toBe('fail');
      expect(retried.attempt).toBe(2);
      expect(retried.attempts).toHaveLength(2);
      expect(await readFile(path.join(dir, 'retry.attempt-1.stdout.log'), 'utf8')).toBe('');

      const inactive = await executor.run('node -e "setTimeout(() => {}, 1000)"', {
        cwd: repoRoot,
        stdoutPath: path.join(dir, 'inactive.stdout.log'),
        stderrPath: path.join(dir, 'inactive.stderr.log'),
        timeoutMs: 1000,
        inactivityTimeoutMs: 20,
      });
      expect(inactive.status).toBe('inactive_timeout');
      expect(inactive.attempts?.[0]?.status).toBe('inactive_timeout');
    });
  });

  it('runs argv commands without shell-interpreting metacharacters', async () => {
    await withTempDir(async (dir) => {
      const executor = createSpawnCommandExecutor();
      const injectedPath = path.join(dir, 'argv-injection-created');
      const result = await executor.run('node', {
        cwd: repoRoot,
        args: ['-e', 'console.log(process.argv[1])', `literal; touch ${injectedPath}`],
        stdoutPath: path.join(dir, 'argv.stdout.log'),
        stderrPath: path.join(dir, 'argv.stderr.log'),
      });

      expect(result.status).toBe('pass');
      expect(result.command).toContain('literal; touch');
      expect(await readFile(result.stdoutPath, 'utf8')).toContain(`literal; touch ${injectedPath}`);
      await expect(readFile(injectedPath, 'utf8')).rejects.toThrow();
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

  it('ignores earlier non-json fences when a later structured report is valid', () => {
    const parsed = parseAgentStructuredReport(
      [
        'verification',
        '```bash',
        'pnpm test tests/longitudinal-benchmark.test.ts',
        '```',
        'final report',
        '```json',
        '{"schemaVersion":1,"phase":"PHASE-23C","status":"pass","taskId":"task-003"}',
        '```',
      ].join('\n'),
      'cursor-subtask',
      'PHASE-23C',
    );

    expect(parsed.ok).toBe(true);
    expect(parsed.report).toMatchObject({
      phase: 'PHASE-23C',
      status: 'pass',
      taskId: 'task-003',
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
    expect(
      parsePrViewMergeState(
        '{"state":"MERGED","mergeCommit":{"oid":"abc1234"},"mergedAt":"2026-05-23T00:00:00Z"}',
      ),
    ).toMatchObject({ merged: true, state: 'MERGED', mergeCommit: 'abc1234' });
  });

  it('pushes the phase branch before creating a pull request', async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, 'evidence');
      const commands: Array<{ command: string; args?: string[] }> = [];
      const github = createGitHubCliAdapter({
        executor: {
          async run(command, options) {
            commands.push({ command, args: options.args });
            await mkdir(path.dirname(options.stdoutPath), { recursive: true });
            await writeFile(
              options.stdoutPath,
              command === 'gh' ? 'https://github.com/acme/repo/pull/456\n' : '',
            );
            await writeFile(options.stderrPath, '');
            return {
              ...commandResult([command, ...(options.args ?? [])].join(' '), options.cwd),
              stdoutPath: options.stdoutPath,
              stderrPath: options.stderrPath,
            };
          },
        },
      });

      const pr = await github.createPullRequest({
        repoRoot,
        branch: 'phase/phase-23b-current-state-docs-refresh',
        base: 'main',
        evidenceDir,
      });

      expect(commands[0]).toEqual({
        command: 'git',
        args: ['push', '-u', 'origin', 'phase/phase-23b-current-state-docs-refresh'],
      });
      expect(commands[1]).toEqual({
        command: 'gh',
        args: [
          'pr',
          'create',
          '--fill',
          '--base',
          'main',
          '--head',
          'phase/phase-23b-current-state-docs-refresh',
        ],
      });
      expect(pr.number).toBe(456);
      await expect(
        readFile(path.join(evidenceDir, 'command-results', 'git-push-pr-branch.stdout.log'), 'utf8'),
      ).resolves.toBe('');
    });
  });

  it('treats gh no-checks stderr as absent remote checks', async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, 'evidence');
      const commands: Array<{ command: string; args?: string[] }> = [];
      const github = createGitHubCliAdapter({
        executor: {
          async run(command, options) {
            commands.push({ command, args: options.args });
            await mkdir(path.dirname(options.stdoutPath), { recursive: true });
            await writeFile(options.stdoutPath, '');
            await writeFile(
              options.stderrPath,
              "no checks reported on the 'phase/phase-23b-current-state-docs-refresh' branch\n",
            );
            return {
              ...commandResult([command, ...(options.args ?? [])].join(' '), options.cwd, 'fail'),
              stdoutPath: options.stdoutPath,
              stderrPath: options.stderrPath,
            };
          },
        },
      });

      const checks = await github.watchChecks({
        repoRoot,
        prNumber: 52,
        evidenceDir,
      });

      expect(checks.status).toBe('none');
      expect(checks.rawStdout).toContain('no checks reported');
      expect(commands[0]).toEqual({
        command: 'gh',
        args: ['pr', 'checks', '52', '--watch'],
      });
    });
  });

  it('preserves pending PR check status from nonzero gh output', async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, 'evidence');
      const github = createGitHubCliAdapter({
        executor: {
          async run(command, options) {
            await mkdir(path.dirname(options.stdoutPath), { recursive: true });
            await writeFile(
              options.stdoutPath,
              'Repo gates\tpending\t0\thttps://github.com/acme/repo/actions/runs/1/job/2\t\n',
            );
            await writeFile(options.stderrPath, '');
            return {
              ...commandResult([command, ...(options.args ?? [])].join(' '), options.cwd, 'fail'),
              stdoutPath: options.stdoutPath,
              stderrPath: options.stderrPath,
            };
          },
        },
      });

      const checks = await github.watchChecks({
        repoRoot,
        prNumber: 52,
        evidenceDir,
      });

      expect(checks.status).toBe('pending');
    });
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

  it('detects secret-like values inside ordinary source-file diffs', () => {
    const scan = scanChangedPathsForSecrets({
      changedPaths: ['src/harness/example.ts'],
      diffText: '+const apiKey = "sk-abcdefghijklmnopqrstuvwxyz";',
    });

    expect(scan.secretsDetected).toBe(true);
    expect(scan.hits.join('\n')).toContain('diff: matched');
  });

  it('requires planner coverage for every parsed phase acceptance criterion', async () => {
    const config = await loadPhaseRunnerConfig(repoRoot);
    const phase = config.graph.phases.find((entry) => entry.id === 'PHASE-21A');
    expect(phase).toBeDefined();
    const planText = await readFile(path.join(repoRoot, 'phase-plans/PHASE-21A-AUTOPILOT-HARDENING.md'), 'utf8');
    const criteria = parseAcceptanceCriteria(planText);
    expect(criteria.length).toBeGreaterThan(1);
    const report: PlannerReport = {
      schemaVersion: 1,
      phase: 'PHASE-21A',
      status: 'pass',
      summary: 'safe plan that says do not edit .env or secrets',
      tasks: [
        {
          id: 'task-001',
          title: 'Cover one criterion',
          description: 'Do not edit .env or secrets.',
          allowedPaths: ['src/harness/**'],
          acceptanceCriteriaCovered: ['AC-1'],
          cursorDelegation: { recommended: false, reason: 'direct implementation' },
        },
      ],
      requiredFocusedTests: ['pnpm test tests/phase-autopilot.test.ts'],
      requiredSmokeCommands: ['pnpm run phase -- autopilot --phase PHASE-21A --dry-run'],
      requiredArtifacts: ['runs/phase-runner/PHASE-21A/<run-id>/phase-merge-evidence.json'],
      risks: [],
      questions: [],
      planAcceptanceRecommendation: 'accept',
    };

    const blocked = validatePlannerReportForAcceptance(phase!, report, 'auto', planText);
    expect(blocked.decision).toBe('block');
    expect(blocked.reasons.join('\n')).toContain('Acceptance criterion is not covered');
    expect(blocked.reasons.join('\n')).not.toContain('secret-related text: .env');

    const accepted = validatePlannerReportForAcceptance(
      phase!,
      {
        ...report,
        tasks: [
          {
            ...report.tasks![0]!,
            acceptanceCriteriaCovered: criteria.map((criterion) => criterion.id),
          },
        ],
      },
      'auto',
      planText,
    );
    expect(accepted.decision).toBe('accept');
  });

  it('allows planner reports that mention forbidden gameplay only as constraints', async () => {
    const config = await loadPhaseRunnerConfig(repoRoot);
    const phase = config.graph.phases.find((entry) => entry.id === 'PHASE-24A');
    expect(phase).toBeDefined();
    const planText = await readFile(
      path.join(repoRoot, 'phase-plans/PHASE-24A-BROWSER-PLAY-AND-REPLAY-UI.md'),
      'utf8',
    );
    const criteria = parseAcceptanceCriteria(planText);
    const report: PlannerReport = {
      schemaVersion: 1,
      phase: 'PHASE-24A',
      status: 'pass',
      summary:
        'Implement browser play without introducing image-only or free-text gameplay scope.',
      tasks: criteria.map((criterion, index) => ({
        id: `task-${String(index + 1).padStart(3, '0')}`,
        title: `Cover ${criterion.id}`,
        description:
          'Use structured actions; do not add image-only output or free-text gameplay.',
        allowedPaths: ['src/**', 'tests/**', 'docs/**', 'package.json', 'PROGRESS.MD'],
        acceptanceCriteriaCovered: [`${criterion.id}: ${criterion.text}`],
        cursorDelegation: { recommended: false, reason: 'direct implementation' },
      })),
      requiredFocusedTests: ['pnpm test tests/browser-play-ui.test.ts'],
      requiredSmokeCommands: ['pnpm run browser-play -- --smoke'],
      requiredArtifacts: ['docs/BROWSER-PLAY-AND-REPLAY.md'],
      risks: ['Avoid image-only and free-text gameplay regressions.'],
      questions: [],
      planAcceptanceRecommendation: 'accept',
    };

    const decision = validatePlannerReportForAcceptance(phase!, report, 'auto', planText);
    expect(decision.decision).toBe('accept');
  });

  it('runs deterministic Cursor subtasks only from accepted-plan task IDs', async () => {
    const runId = `cursor-subtask-${Date.now()}`;
    const evidenceDir = path.join(repoRoot, 'runs', 'phase-runner', 'PHASE-21A', runId);
    const acceptedPlan: PlannerReport = {
      schemaVersion: 1,
      phase: 'PHASE-21A',
      status: 'pass',
      summary: 'cursor task',
      tasks: [
        {
          id: 'task-001',
          title: 'Bounded Cursor task',
          description: 'Do one thing',
          allowedPaths: ['src/harness/**', 'tests/**'],
          acceptanceCriteriaCovered: ['AC-1'],
          cursorDelegation: { recommended: true, reason: 'bounded' },
        },
      ],
      requiredFocusedTests: ['pnpm test tests/phase-autopilot.test.ts'],
      requiredSmokeCommands: ['pnpm run phase -- autopilot --phase PHASE-21A --dry-run'],
      requiredArtifacts: ['runs/phase-runner/PHASE-21A/<run-id>/cursor-tasks/task-001-report.json'],
      risks: [],
      questions: [],
      planAcceptanceRecommendation: 'accept',
    };
    await mkdir(path.join(evidenceDir, 'accepted-plan'), { recursive: true });
    await writeFile(
      path.join(evidenceDir, 'accepted-plan', 'accepted-plan.json'),
      JSON.stringify(acceptedPlan),
    );

    try {
      const summary = await executeStage(repoRoot, 'PHASE-21A', 'cursor-subtasks', {
        runId,
        safetyFlags: { ...safeFlags, allowAgentExecution: true },
        deps: {
          autopilotConfig: fakeAutopilotConfig(),
          executor: fakeExecutor({
            'fake-cursor': [
              '```json',
              '{"schemaVersion":1,"phase":"PHASE-21A","status":"pass","taskId":"task-001","filesChanged":[],"commandsRun":[],"gaps":[]}',
              '```',
            ].join('\n'),
          }),
        },
      });

      expect(summary.currentStage).toBe('recheck');
      const prompt = await readFile(path.join(evidenceDir, 'cursor-tasks', 'task-001-prompt.md'), 'utf8');
      expect(prompt).toContain('Task ID: task-001');
      const report = JSON.parse(
        await readFile(path.join(evidenceDir, 'cursor-tasks', 'task-001-report.json'), 'utf8'),
      );
      expect(report.taskId).toBe('task-001');
    } finally {
      await rm(evidenceDir, { recursive: true, force: true });
    }
  });

  it('blocks merge completion when gh merge fails and remote PR is not merged', async () => {
    const runId = `merge-fail-${Date.now()}`;
    const evidenceDir = await writeAllowingMergeEvidence('PHASE-21A', runId);
    try {
      await expect(
        executeStage(repoRoot, 'PHASE-21A', 'merge', {
          runId,
          safetyFlags: { ...safeFlags, allowMerge: true },
          deps: {
            autopilotConfig: fakeAutopilotConfig(),
            github: fakeGithub({ mergeSucceeds: false, remoteMerged: false }),
          },
        }),
      ).rejects.toThrow('remote PR is not merged');
    } finally {
      await rm(evidenceDir, { recursive: true, force: true });
    }
  });

  it('allows merge stage recovery when local gh merge fails after remote merge already happened', async () => {
    const runId = `merge-remote-ok-${Date.now()}`;
    const evidenceDir = await writeAllowingMergeEvidence('PHASE-21A', runId);
    try {
      const summary = await executeStage(repoRoot, 'PHASE-21A', 'merge', {
        runId,
        safetyFlags: { ...safeFlags, allowMerge: true },
        deps: {
          autopilotConfig: fakeAutopilotConfig(),
          github: fakeGithub({ mergeSucceeds: false, remoteMerged: true }),
        },
      });

      expect(summary.currentStage).toBe('cleanup');
      const merge = JSON.parse(await readFile(path.join(evidenceDir, 'merge.json'), 'utf8'));
      expect(merge).toMatchObject({ merged: true, remoteVerified: true, remoteState: 'MERGED' });
    } finally {
      await rm(evidenceDir, { recursive: true, force: true });
    }
  });

  it('blocks before PR creation when local gate evidence fails', async () => {
    const runId = `local-gate-blocks-pr-${Date.now()}`;
    const evidenceDir = path.join(repoRoot, 'runs', 'phase-runner', 'PHASE-21A', runId);
    let prCreated = false;
    try {
      const config = await loadPhaseRunnerConfig(repoRoot);
      const phase = config.graph.phases.find((entry) => entry.id === 'PHASE-21A');
      expect(phase).toBeDefined();
      await writePhaseMergeEvidence(
        evidenceDir,
        collectPhaseMergeEvidence({
          phase: phase!,
          policy: config.automergePolicy,
          localCommandResults: config.automergePolicy.requiredLocalCommands.map((command) =>
            commandResult(command),
          ),
          recheckReport: {
            schemaVersion: 1,
            phase: 'PHASE-21A',
            status: 'pass',
            phaseAcceptanceComplete: true,
            blockingGaps: [],
          },
          changedPaths: ['src/game/engine.ts'],
          worktreeStatus: { branch: 'phase/test', clean: false, porcelain: ' M src/game/engine.ts', raw: '' },
          secretScan: { secretsDetected: false, hits: [] },
          remoteChecks: 'none',
        }),
      );

      await expect(
        executeStage(repoRoot, 'PHASE-21A', 'local-gate', {
          runId,
          safetyFlags: { ...safeFlags, allowPr: true },
          deps: {
            autopilotConfig: fakeAutopilotConfig(),
            github: {
              ...fakeGithub(),
              async createPullRequest(input) {
                prCreated = true;
                return fakeGithub().createPullRequest(input);
              },
            },
          },
        }),
      ).rejects.toThrow('Local gate blocked');
      expect(prCreated).toBe(false);
    } finally {
      await rm(evidenceDir, { recursive: true, force: true });
    }
  });

  it('keeps Git scan telemetry under evidence instead of dirtying the worktree', async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, 'evidence');
      const git = createGitAdapter(fakeExecutor({
        'git status --short --branch': '## main\n',
        'git diff --name-only': 'src/harness/phase-autopilot.ts\n',
        'git ls-files --others --exclude-standard': '',
        'git diff': 'diff --git a/src/harness/phase-autopilot.ts b/src/harness/phase-autopilot.ts\n',
      }));

      const status = await git.status(repoRoot, evidenceDir);
      const changedPaths = await git.changedPaths(repoRoot, 'origin/main', evidenceDir);
      const diffText = await git.diffText(repoRoot, 'origin/main', evidenceDir);

      expect(status.clean).toBe(true);
      expect(changedPaths).toEqual(['src/harness/phase-autopilot.ts']);
      expect(diffText).toContain('phase-autopilot');
      await expect(readFile(path.join(repoRoot, '.phase-runner-status.json'), 'utf8')).rejects.toThrow();
      expect(await readFile(path.join(evidenceDir, 'command-results', 'git-status.stdout.log'), 'utf8')).toContain('## main');
    });
  });

  it('passes git refs as argv instead of shell templates', async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, 'evidence');
      const commands: Array<{ command: string; args?: string[] }> = [];
      const git = createGitAdapter({
        async run(command, options) {
          commands.push({ command, args: options.args });
          await mkdir(path.dirname(options.stdoutPath), { recursive: true });
          await writeFile(options.stdoutPath, '');
          await writeFile(options.stderrPath, '');
          return {
            ...commandResult([command, ...(options.args ?? [])].join(' '), options.cwd),
            stdoutPath: options.stdoutPath,
            stderrPath: options.stderrPath,
          };
        },
      });

      await git.changedPaths(dir, 'origin/main; touch /tmp/df-pwned', evidenceDir);

      expect(commands[0]).toEqual({
        command: 'git',
        args: ['diff', '--name-only', 'origin/main; touch /tmp/df-pwned'],
      });
      expect(commands[1]).toEqual({
        command: 'git',
        args: ['ls-files', '--others', '--exclude-standard'],
      });
    });
  });

  it('includes untracked files in changed-path evidence', async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, 'evidence');
      const git = createGitAdapter(fakeExecutor({
        'git diff --name-only': 'src/harness/phase-autopilot.ts\nsrc/harness/new-helper.ts\n',
        'git ls-files --others --exclude-standard': [
          'src/harness/new-helper.ts',
          'tests/untracked-safety.test.ts',
        ].join('\n'),
      }));

      const changedPaths = await git.changedPaths(dir, 'origin/main', evidenceDir);

      expect(changedPaths).toEqual([
        'src/harness/new-helper.ts',
        'src/harness/phase-autopilot.ts',
        'tests/untracked-safety.test.ts',
      ]);
      expect(
        await readFile(path.join(evidenceDir, 'command-results', 'git-untracked-names.stdout.log'), 'utf8'),
      ).toContain('tests/untracked-safety.test.ts');
    });
  });

  it('includes readable untracked file content in secret-scan diff text', async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, 'evidence');
      const untrackedPath = path.join(dir, 'src', 'harness', 'new-secret.ts');
      await mkdir(path.dirname(untrackedPath), { recursive: true });
      await writeFile(untrackedPath, 'export const token = "ghp_123456789012345678901234";\n');
      const git = createGitAdapter(fakeExecutor({
        'git diff': '',
        'git ls-files --others --exclude-standard': 'src/harness/new-secret.ts\n',
      }));

      const diffText = await git.diffText(dir, 'origin/main', evidenceDir);
      const scan = scanChangedPathsForSecrets({
        changedPaths: ['src/harness/new-secret.ts'],
        diffText,
      });

      expect(diffText).toContain('--- untracked file: src/harness/new-secret.ts');
      expect(scan.secretsDetected).toBe(true);
      expect(scan.hits.join('\n')).toContain('diff: matched');
    });
  });

  it('blocks local gate on untracked out-of-scope paths before PR creation', async () => {
    const runId = `untracked-out-of-scope-${Date.now()}`;
    const evidenceDir = path.join(repoRoot, 'runs', 'phase-runner', 'PHASE-22A', runId);
    let prCreated = false;
    try {
      const config = await loadPhaseRunnerConfig(repoRoot);
      const phase = config.graph.phases.find((entry) => entry.id === 'PHASE-22A');
      expect(phase).toBeDefined();
      await writePhaseMergeEvidence(
        evidenceDir,
        collectPhaseMergeEvidence({
          phase: phase!,
          policy: config.automergePolicy,
          localCommandResults: config.automergePolicy.requiredLocalCommands.map((command) =>
            commandResult(command),
          ),
          recheckReport: {
            schemaVersion: 1,
            phase: 'PHASE-22A',
            status: 'pass',
            phaseAcceptanceComplete: true,
            blockingGaps: [],
          },
          changedPaths: ['src/game/untracked-out-of-scope.ts'],
          worktreeStatus: { branch: 'phase/test', clean: false, porcelain: '?? src/game/untracked-out-of-scope.ts', raw: '' },
          secretScan: { secretsDetected: false, hits: [] },
          remoteChecks: 'none',
        }),
      );

      await expect(
        executeStage(repoRoot, 'PHASE-22A', 'local-gate', {
          runId,
          safetyFlags: { ...safeFlags, allowPr: true },
          deps: {
            autopilotConfig: fakeAutopilotConfig(),
            github: {
              ...fakeGithub(),
              async createPullRequest(input) {
                prCreated = true;
                return fakeGithub().createPullRequest(input);
              },
            },
          },
        }),
      ).rejects.toThrow('Local gate blocked');
      expect(prCreated).toBe(false);
    } finally {
      await rm(evidenceDir, { recursive: true, force: true });
    }
  });

  it('blocks untracked credential-like paths before PR creation', async () => {
    const runId = `untracked-env-${Date.now()}`;
    const evidenceDir = path.join(repoRoot, 'runs', 'phase-runner', 'PHASE-22A', runId);
    try {
      const config = await loadPhaseRunnerConfig(repoRoot);
      const phase = config.graph.phases.find((entry) => entry.id === 'PHASE-22A');
      expect(phase).toBeDefined();
      const changedPaths = ['.env.local'];
      await writePhaseMergeEvidence(
        evidenceDir,
        collectPhaseMergeEvidence({
          phase: phase!,
          policy: config.automergePolicy,
          localCommandResults: config.automergePolicy.requiredLocalCommands.map((command) =>
            commandResult(command),
          ),
          recheckReport: {
            schemaVersion: 1,
            phase: 'PHASE-22A',
            status: 'pass',
            phaseAcceptanceComplete: true,
            blockingGaps: [],
          },
          changedPaths,
          worktreeStatus: { branch: 'phase/test', clean: false, porcelain: '?? .env.local', raw: '' },
          secretScan: scanChangedPathsForSecrets({ changedPaths }),
          remoteChecks: 'none',
        }),
      );

      await expect(
        executeStage(repoRoot, 'PHASE-22A', 'local-gate', {
          runId,
          safetyFlags: { ...safeFlags, allowPr: true },
          deps: { autopilotConfig: fakeAutopilotConfig() },
        }),
      ).rejects.toThrow('Local gate blocked');
    } finally {
      await rm(evidenceDir, { recursive: true, force: true });
    }
  });

  it('runs a full fake critical autopilot path through final gate without real external tools', async () => {
    const runId = `full-fake-${Date.now()}`;
    const evidenceDir = path.join(repoRoot, 'runs', 'phase-runner', 'PHASE-21A', runId);
    const criteria = parseAcceptanceCriteria(
      await readFile(path.join(repoRoot, 'phase-plans/PHASE-21A-AUTOPILOT-HARDENING.md'), 'utf8'),
    );
    const plannerReport = {
      schemaVersion: 1,
      phase: 'PHASE-21A',
      status: 'pass',
      summary: 'fake full path',
      tasks: [
        {
          id: 'task-001',
          title: 'Fake execution',
          description: 'Execute fake task',
          allowedPaths: ['src/harness/**', 'tests/**', 'PROGRESS.MD'],
          acceptanceCriteriaCovered: criteria.map((criterion) => criterion.id),
          cursorDelegation: { recommended: false, reason: 'not needed' },
        },
      ],
      requiredFocusedTests: ['pnpm test tests/phase-autopilot.test.ts'],
      requiredSmokeCommands: ['pnpm run phase -- autopilot --phase PHASE-21A --dry-run'],
      requiredArtifacts: ['runs/phase-runner/PHASE-21A/<run-id>/phase-merge-evidence.json'],
      risks: [],
      questions: [],
      planAcceptanceRecommendation: 'accept',
    };
    const recheckReport = {
      schemaVersion: 1,
      phase: 'PHASE-21A',
      status: 'pass',
      phaseAcceptanceComplete: true,
      blockingGaps: [],
    };
    const executor = fakeExecutor({
      'fake-planner': ['```json', JSON.stringify(plannerReport), '```'].join('\n'),
      'fake-executor': [
        '```json',
        '{"schemaVersion":1,"phase":"PHASE-21A","status":"pass","tasksCompleted":["task-001"],"gaps":[]}',
        '```',
      ].join('\n'),
      'fake-rechecker': ['```json', JSON.stringify(recheckReport), '```'].join('\n'),
    });
    const deps = {
      autopilotConfig: fakeAutopilotConfig(),
      executor,
      git: fakeGit({
        changedPaths: ['src/harness/phase-autopilot.ts', 'tests/phase-autopilot.test.ts', 'PROGRESS.MD'],
        diffText: 'diff --git a/src/harness/phase-autopilot.ts b/src/harness/phase-autopilot.ts\n',
        clean: true,
      }),
      github: fakeGithub({ mergeSucceeds: true }),
    };

    try {
      for (const stage of [
        'bundle',
        'planning',
        'plan-acceptance',
        'execution',
        'cursor-subtasks',
        'recheck',
        'local-validation',
        'changed-path-scan',
        'secret-scan',
        'local-evidence',
        'local-gate',
        'commit',
        'pr',
        'checks',
        'remote-evidence',
        'final-gate',
        'merge',
      ] as const) {
        await executeStage(repoRoot, 'PHASE-21A', stage, {
          runId,
          safetyFlags: {
            ...safeFlags,
            allowAgentExecution: true,
            allowPr: true,
            allowMerge: true,
            planApproval: 'auto',
            plannerAgent: 'shell',
            executorAgent: 'shell',
            recheckerAgent: 'shell',
          },
          deps,
        });
      }

      const merge = JSON.parse(await readFile(path.join(evidenceDir, 'merge.json'), 'utf8'));
      expect(merge.merged).toBe(true);
      const finalDecision = JSON.parse(await readFile(path.join(evidenceDir, 'final-decision.json'), 'utf8'));
      expect(finalDecision.decision.decision).toBe('allow');
    } finally {
      await rm(evidenceDir, { recursive: true, force: true });
    }
  });
});
