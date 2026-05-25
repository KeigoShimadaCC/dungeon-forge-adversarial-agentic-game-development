import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createAgentAdapter, type AgentTemplateConfig } from '../adapters/agent-adapters.js';
import type { CursorSubtaskReport, PlannerReport } from '../evidence/agent-report-parser.js';
import {
  commandEvidenceStatus,
  createSpawnCommandExecutor,
  type CommandExecutionResult,
  type CommandExecutor,
} from '../adapters/command-executor.js';
import {
  collectPhaseMergeEvidence,
  readLocalValidationResults,
  readRecheckReportFromEvidence,
  writeLocalValidationResults,
  writePhaseMergeEvidence,
} from '../evidence/evidence-collector.js';
import { createGitAdapter, writeGitArtifacts, type GitAdapter } from '../adapters/git-adapter.js';
import { createGitHubCliAdapter, type GitHubCliAdapter } from '../adapters/github-cli-adapter.js';
import { stringifyDeterministicJson } from './json.js';
import {
  advanceRunState,
  createRunId,
  initialRunState,
  loadRunState,
  writeRunState,
  type AutopilotStage,
  type PhaseRunState,
} from './run-state.js';
import {
  readAcceptedPlanPath,
  validatePlannerReportForAcceptance,
  writeAcceptedPlanArtifacts,
  type PlanApprovalMode,
} from './plan-acceptance.js';
import { scanChangedPathsForSecrets } from '../evidence/secret-scan.js';
import {
  buildPhaseRunBundle,
  defaultRunnerPaths,
  evaluateAutomerge,
  evidenceDirForPhase,
  evidenceDirForPhaseId,
  getRunnablePhases,
  loadPhaseRunnerConfig,
  markPhaseBlocked,
  markPhaseComplete,
  writePhaseRunBundle,
  writePhaseState,
  type RunnablePhase,
  type RunnerPaths,
} from './phase-runner.js';

export interface AutopilotConfig {
  schemaVersion: number;
  git: {
    baseBranch: string;
    baseRef: string;
  };
  preflightCommands?: string[];
  agents: {
    planner: AgentTemplateConfig;
    executor: AgentTemplateConfig;
    rechecker: AgentTemplateConfig;
    cursorSubtask?: AgentTemplateConfig;
  };
  dependencyBootstrapCommands?: string[];
  commandExecutor?: {
    defaultTimeoutMs?: number;
    inactivityTimeoutMs?: number;
    maxRetries?: number;
  };
  restrictedAgentDelegate?: {
    enabled: boolean;
    providerMode: 'fake';
    maxAttempts: number;
    commandIds: string[];
    patchBudget: {
      maxFiles: number;
      maxBytes: number;
    };
    evidenceDirName: string;
  };
}

export interface AutopilotSafetyFlags {
  allowAgentExecution: boolean;
  allowPr: boolean;
  allowMerge: boolean;
  dryRun: boolean;
  continueOnBlocked: boolean;
  parallel: number;
  planApproval: PlanApprovalMode;
  plannerAgent: 'shell' | 'manual';
  executorAgent: 'shell' | 'manual';
  recheckerAgent: 'shell' | 'manual';
}

export interface AutopilotDependencies {
  executor?: CommandExecutor;
  git?: GitAdapter;
  github?: GitHubCliAdapter;
  autopilotConfig?: AutopilotConfig;
  runnerPaths?: RunnerPaths;
  restrictedAgentCommandExecutor?: unknown;
}

export interface AutopilotRunSummary {
  phaseId: string;
  runId: string;
  evidenceDir: string;
  status: PhaseRunState['status'];
  dryRun: boolean;
  currentStage: AutopilotStage;
  completedStages: AutopilotStage[];
  lastError?: string;
  mergeDecision?: ReturnType<typeof evaluateAutomerge>;
}

export type ExecuteStageName =
  | 'preflight'
  | 'setup'
  | 'planning'
  | 'plan-acceptance'
  | 'bootstrap'
  | 'execution'
  | 'cursor-subtasks'
  | 'restricted-agent-delegate'
  | 'recheck'
  | 'local-validation'
  | 'changed-path-scan'
  | 'secret-scan'
  | 'local-evidence'
  | 'local-gate'
  | 'commit'
  | 'pr'
  | 'checks'
  | 'remote-evidence'
  | 'final-gate'
  | 'merge'
  | 'cleanup'
  | 'bundle';

const defaultAutopilotConfigPath = (repoRoot: string): string =>
  path.join(repoRoot, 'automation', 'autopilot-config.json');

export const loadAutopilotConfig = async (
  repoRoot: string,
  configPath = defaultAutopilotConfigPath(repoRoot),
): Promise<AutopilotConfig> => JSON.parse(await readFile(configPath, 'utf8')) as AutopilotConfig;

const commandResultPath = (evidenceDir: string, slug: string, index: number) => {
  const id = `${String(index).padStart(3, '0')}-${slug}`;
  return {
    stdoutPath: path.join(evidenceDir, 'command-results', `${id}.stdout.log`),
    stderrPath: path.join(evidenceDir, 'command-results', `${id}.stderr.log`),
  };
};

const runShellCommands = async (
  executor: CommandExecutor,
  cwd: string,
  evidenceDir: string,
  commands: string[],
  slugPrefix: string,
  options: { dryRun: boolean; timeoutMs?: number; inactivityTimeoutMs?: number; maxRetries?: number },
): Promise<CommandExecutionResult[]> => {
  const results: CommandExecutionResult[] = [];
  let index = 1;
  for (const command of commands) {
    const paths = commandResultPath(evidenceDir, `${slugPrefix}-${index}`, index);
    if (options.dryRun) {
      results.push({
        command,
        cwd,
        exitCode: 0,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0,
        stdoutPath: paths.stdoutPath,
        stderrPath: paths.stderrPath,
        status: 'pass',
      });
      await mkdir(path.dirname(paths.stdoutPath), { recursive: true });
      await writeFile(paths.stdoutPath, `[dry-run] ${command}\n`);
      await writeFile(paths.stderrPath, '');
    } else {
      results.push(
        await executor.run(command, {
          cwd,
          ...paths,
          timeoutMs: options.timeoutMs,
          inactivityTimeoutMs: options.inactivityTimeoutMs,
          maxRetries: options.maxRetries,
        }),
      );
    }
    index += 1;
  }
  return results;
};

const writeDryRunPlan = async (
  evidenceDir: string,
  bundle: Awaited<ReturnType<typeof buildPhaseRunBundle>>,
  flags: AutopilotSafetyFlags,
  runnable: RunnablePhase,
): Promise<void> => {
  await mkdir(evidenceDir, { recursive: true });
  const promptsDir = path.join(evidenceDir, 'prompts');
  await mkdir(promptsDir, { recursive: true });
  await writePhaseRunBundle(bundle, evidenceDir);
  await copyFile(
    path.join(evidenceDir, 'codex-plan-prompt.md'),
    path.join(promptsDir, 'codex-planner-prompt.md'),
  ).catch(() => undefined);
  await copyFile(
    path.join(evidenceDir, 'codex-executor-prompt.md'),
    path.join(promptsDir, 'codex-executor-prompt.md'),
  ).catch(() => undefined);
  await copyFile(
    path.join(evidenceDir, 'recheck-prompt.md'),
    path.join(promptsDir, 'recheck-prompt.md'),
  ).catch(() => undefined);
  await writeFile(
    path.join(evidenceDir, 'dry-run-plan.txt'),
    [
      `Phase: ${bundle.phase.id}`,
      `Branch: ${bundle.branch}`,
      `Worktree: ${bundle.worktreePath}`,
      `Evidence: ${bundle.evidenceDir}`,
      `Dry run: ${flags.dryRun}`,
      `Allow agents: ${flags.allowAgentExecution}`,
      `Allow PR: ${flags.allowPr}`,
      `Allow merge: ${flags.allowMerge}`,
      '',
      'Stages (no git/agent/pr/merge side effects in dry-run):',
      'bundle -> preflight -> setup -> bootstrap -> planning -> plan-acceptance ->',
      'execution -> cursor-subtasks -> restricted-agent-delegate -> recheck -> local-validation -> changed-path-scan ->',
      'secret-scan -> local-evidence -> local-gate -> commit -> pr -> checks ->',
      'remote-evidence -> final-gate -> merge -> cleanup -> complete',
      '',
      'Preflight:',
      ...bundle.commands.preflight.map((command) => `- ${command}`),
      '',
      'Local validation:',
      ...bundle.commands.localValidation.map((command) => `- ${command}`),
      '',
      'Notes:',
      ...runnable.notes.map((note) => `- ${note}`),
    ].join('\n'),
  );
};

const snapshotProgress = async (repoRoot: string, evidenceDir: string, label: string): Promise<void> => {
  const source = await readFile(path.join(repoRoot, 'PROGRESS.md'), 'utf8')
    .then(() => path.join(repoRoot, 'PROGRESS.md'))
    .catch(() => path.join(repoRoot, 'PROGRESS.MD'));
  const target = path.join(evidenceDir, `progress-snapshot-${label}.md`);
  await copyFile(source, target).catch(async () => {
    await writeFile(target, '# PROGRESS snapshot unavailable\n');
  });
};

const writeFinalDecision = async (
  evidenceDir: string,
  payload: Record<string, unknown>,
): Promise<void> => {
  await writeFile(path.join(evidenceDir, 'final-decision.json'), stringifyDeterministicJson(payload));
};

export const inspectRun = async (
  repoRoot: string,
  phaseId: string,
  runId: string,
): Promise<Record<string, unknown>> => {
  const evidenceDir = evidenceDirForPhaseId(repoRoot, phaseId, runId);
  const runState = await loadRunState(evidenceDir);
  const mergeEvidencePath = path.join(evidenceDir, 'phase-merge-evidence.json');
  let mergeEvidence: unknown;
  try {
    mergeEvidence = JSON.parse(await readFile(mergeEvidencePath, 'utf8'));
  } catch {
    mergeEvidence = undefined;
  }
  return {
    phaseId,
    runId,
    evidenceDir,
    runState,
    mergeEvidence,
    files: {
      runState: path.join(evidenceDir, 'run-state.json'),
      dryRunPlan: path.join(evidenceDir, 'dry-run-plan.txt'),
      phaseRunPlan: path.join(evidenceDir, 'phase-run-plan.json'),
      mergeEvidence: mergeEvidencePath,
      finalDecision: path.join(evidenceDir, 'final-decision.json'),
    },
  };
};

export const buildCursorSubtaskPrompt = (input: {
  phaseId: string;
  taskId: string;
  taskTitle: string;
  allowedPaths: string[];
  requiredCommands: string[];
  acceptedPlanPath: string;
}): string =>
  [
    `You are Cursor CLI executing accepted-plan subtask ${input.taskId}.`,
    '',
    `Phase: ${input.phaseId}`,
    `Task ID: ${input.taskId}`,
    `Task title: ${input.taskTitle}`,
    `Accepted plan: ${input.acceptedPlanPath}`,
    '',
    'Allowed paths:',
    ...input.allowedPaths.map((allowedPath) => `- ${allowedPath}`),
    '',
    'Required tests/smokes for this subtask:',
    ...input.requiredCommands.map((command) => `- ${command}`),
    '',
    'Do not implement from the raw phase plan. Use only this accepted-plan task.',
    'Do not merge, push, create PRs, remove worktrees, or edit secrets.',
    '',
    'End with fenced JSON CursorSubtaskReport including schemaVersion, phase, status, taskId, filesChanged, commandsRun, and gaps.',
  ].join('\n');

export const writeCursorSubtaskPrompt = async (
  evidenceDir: string,
  taskNumber: number,
  prompt: string,
): Promise<string> => {
  const taskDir = path.join(evidenceDir, 'cursor-tasks');
  await mkdir(taskDir, { recursive: true });
  const promptPath = path.join(taskDir, `task-${String(taskNumber).padStart(3, '0')}-prompt.md`);
  await writeFile(promptPath, prompt);
  return promptPath;
};

const cursorTaskFilePrefix = (taskNumber: number): string =>
  `task-${String(taskNumber).padStart(3, '0')}`;

const readJsonFile = async <T>(filePath: string): Promise<T | undefined> => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
};

export const executeStage = async (
  repoRoot: string,
  phaseId: string,
  stage: ExecuteStageName,
  options: {
    runId?: string;
    safetyFlags: AutopilotSafetyFlags;
    deps?: AutopilotDependencies;
  },
): Promise<AutopilotRunSummary> => {
  const runnerPaths = options.deps?.runnerPaths ?? defaultRunnerPaths(repoRoot);
  const config = await loadPhaseRunnerConfig(repoRoot, runnerPaths);
  const autopilotConfig =
    options.deps?.autopilotConfig ?? (await loadAutopilotConfig(repoRoot));
  const executor = options.deps?.executor ?? createSpawnCommandExecutor();
  const git = options.deps?.git ?? createGitAdapter(executor);
  const github = options.deps?.github ?? createGitHubCliAdapter({ executor });

  const phase = config.graph.phases.find((entry) => entry.id === phaseId);
  if (!phase) {
    throw new Error(`Unknown phase: ${phaseId}`);
  }

  const runId = options.runId ?? createRunId();
  const evidenceDir = evidenceDirForPhase(repoRoot, phase, runId);
  const bundle = await buildPhaseRunBundle(config, repoRoot, phaseId, runId, runnerPaths, {
    preflightCommands: autopilotConfig.preflightCommands,
  });
  let runState =
    (await loadRunState(evidenceDir)) ??
    initialRunState({
      phase: phaseId,
      runId,
      dryRun: options.safetyFlags.dryRun,
      safetyFlags: {
        allowAgentExecution: options.safetyFlags.allowAgentExecution,
        allowPr: options.safetyFlags.allowPr,
        allowMerge: options.safetyFlags.allowMerge,
      },
    });

  const fail = async (message: string, status: PhaseRunState['status'] = 'blocked'): Promise<never> => {
    runState = advanceRunState(runState, { status, lastError: message });
    await writeRunState(evidenceDir, runState);
    await writeFinalDecision(evidenceDir, { status, message });
    throw new Error(message);
  };

  const completeStage = async (completed: AutopilotStage, next: AutopilotStage): Promise<void> => {
    runState = advanceRunState(runState, {
      currentStage: next,
      completedStage: completed,
    });
    await writeRunState(evidenceDir, runState);
  };

  if (stage === 'bundle') {
    await writePhaseRunBundle(bundle, evidenceDir);
    await completeStage('bundle', 'preflight');
    return {
      phaseId,
      runId,
      evidenceDir,
      status: runState.status,
      dryRun: options.safetyFlags.dryRun,
      currentStage: runState.currentStage,
      completedStages: runState.completedStages,
    };
  }

  if (stage === 'preflight') {
    const results = await runShellCommands(
      executor,
      repoRoot,
      evidenceDir,
      bundle.commands.preflight,
      'preflight',
      { dryRun: options.safetyFlags.dryRun },
    );
    if (!options.safetyFlags.dryRun && results.some((result) => commandEvidenceStatus(result) !== 'pass')) {
      await fail('Preflight command failed');
    }
    await completeStage('preflight', 'setup');
  }

  if (stage === 'setup') {
    if (!options.safetyFlags.dryRun) {
      await git.fetchOrigin(repoRoot, evidenceDir);
      const setupResult = await git.createWorktree({
        repoRoot,
        branch: bundle.branch,
        worktreePath: bundle.worktreePath,
        baseRef: autopilotConfig.git.baseRef,
        evidenceDir,
      });
      if (commandEvidenceStatus(setupResult) !== 'pass') {
        await fail('Worktree setup failed', 'failed');
      }
    }
    await completeStage('setup', 'bootstrap');
  }

  if (stage === 'bootstrap') {
    await runShellCommands(
      executor,
      bundle.worktreePath,
      evidenceDir,
      autopilotConfig.dependencyBootstrapCommands ?? [],
      'bootstrap',
      {
        dryRun: options.safetyFlags.dryRun,
        timeoutMs: autopilotConfig.commandExecutor?.defaultTimeoutMs,
        inactivityTimeoutMs: autopilotConfig.commandExecutor?.inactivityTimeoutMs,
        maxRetries: autopilotConfig.commandExecutor?.maxRetries,
      },
    );
    await completeStage('bootstrap', 'planning');
  }

  const runAgentStage = async (
    agentStage: 'planning' | 'execution' | 'recheck',
    role: 'planner' | 'executor' | 'rechecker',
    promptFile: string,
    outputFile: string,
  ): Promise<void> => {
    const configKey = role === 'executor' ? 'executor' : role;
    const agentConfig = {
      ...autopilotConfig.agents[configKey],
      provider:
        role === 'planner'
          ? options.safetyFlags.plannerAgent
          : role === 'executor'
            ? options.safetyFlags.executorAgent
            : options.safetyFlags.recheckerAgent,
    } satisfies AgentTemplateConfig;
    const adapter = createAgentAdapter(
      agentConfig,
      options.safetyFlags.allowAgentExecution && !options.safetyFlags.dryRun,
      executor,
    );
    const agentResultsDir = path.join(evidenceDir, 'agent-results');
    await mkdir(agentResultsDir, { recursive: true });
    const promptPath = path.join(evidenceDir, promptFile);
    const outputPath = path.join(agentResultsDir, outputFile);
    if (role === 'executor') {
      const acceptedPlanPath = readAcceptedPlanPath(evidenceDir);
      await readFile(acceptedPlanPath, 'utf8').catch(() => {
        throw new Error('Executor cannot run without accepted-plan/accepted-plan.json');
      });
    }
    const result = await adapter.run({
      role,
      workspace: bundle.worktreePath,
      promptPath,
      outputPath,
      evidenceDir,
      phaseId,
    });
    const nextStage: AutopilotStage =
      agentStage === 'planning'
        ? 'plan-acceptance'
        : agentStage === 'execution'
          ? 'cursor-subtasks'
          : 'local-validation';
    if (options.safetyFlags.dryRun) {
      await completeStage(agentStage, nextStage);
      return;
    }
    if (!options.safetyFlags.allowAgentExecution) {
      if (result.status === 'not_run') {
        await completeStage(agentStage, nextStage);
        return;
      }
    }
    if (result.status === 'fail') {
      await fail(`${agentStage} agent command failed`, 'failed');
    }
    if (result.status === 'blocked') {
      await fail(`${agentStage} agent report blocked`, 'blocked');
    }
    await completeStage(agentStage, nextStage);
  };

  if (stage === 'planning') {
    await runAgentStage('planning', 'planner', 'codex-plan-prompt.md', 'planner-output.md');
  }

  if (stage === 'plan-acceptance') {
    const reportPath = path.join(evidenceDir, 'agent-results', 'planner-report.json');
    const plannerReport = await readFile(reportPath, 'utf8')
      .then((contents) => JSON.parse(contents) as PlannerReport)
      .catch(() => undefined);
    const decision = validatePlannerReportForAcceptance(
      phase,
      plannerReport,
      options.safetyFlags.planApproval,
      await readFile(path.join(repoRoot, phase.plan), 'utf8').catch(() => ''),
    );
    if (decision.decision === 'block') {
      await writeFinalDecision(evidenceDir, {
        status: 'blocked',
        stage: 'plan-acceptance',
        decision,
      });
      await fail(`Plan acceptance blocked: ${decision.reasons.join('; ')}`);
    }
    await writeAcceptedPlanArtifacts(evidenceDir, plannerReport!, decision);
    await completeStage('plan-acceptance', 'execution');
  }

  if (stage === 'execution') {
    await runAgentStage(
      'execution',
      'executor',
      'codex-executor-prompt.md',
      'executor-output.md',
    );
  }

  if (stage === 'cursor-subtasks') {
    const acceptedPlanPath = readAcceptedPlanPath(evidenceDir);
    const maybeAcceptedPlan = await readJsonFile<PlannerReport>(acceptedPlanPath);
    if (!maybeAcceptedPlan) {
      await fail('Cursor subtasks cannot run without accepted-plan/accepted-plan.json');
      throw new Error('unreachable');
    }
    const acceptedPlan = maybeAcceptedPlan;
    const cursorTasks = (acceptedPlan.tasks ?? []).filter(
      (task) => task.cursorDelegation?.recommended === true,
    );
    const taskDir = path.join(evidenceDir, 'cursor-tasks');
    await mkdir(taskDir, { recursive: true });
    if (cursorTasks.length === 0 || options.safetyFlags.dryRun) {
      await writeFile(
        path.join(taskDir, 'cursor-subtasks.json'),
        stringifyDeterministicJson({ tasks: [], status: 'none' }),
      );
      await completeStage('cursor-subtasks', 'restricted-agent-delegate');
    } else {
      const maybeCursorConfig = autopilotConfig.agents.cursorSubtask;
      if (!maybeCursorConfig) {
        await fail('Accepted plan requires Cursor subtasks, but cursorSubtask agent is not configured.');
        throw new Error('unreachable');
      }
      const cursorConfig = maybeCursorConfig;
      const reports: CursorSubtaskReport[] = [];
      let taskNumber = 1;
      for (const task of cursorTasks) {
        const prefix = cursorTaskFilePrefix(taskNumber);
        const prompt = buildCursorSubtaskPrompt({
          phaseId,
          taskId: task.id,
          taskTitle: task.title,
          allowedPaths: task.allowedPaths,
          requiredCommands: [
            ...(acceptedPlan.requiredFocusedTests ?? []),
            ...(acceptedPlan.requiredSmokeCommands ?? []),
          ],
          acceptedPlanPath,
        });
        const promptPath = await writeCursorSubtaskPrompt(evidenceDir, taskNumber, prompt);
        const reportPath = path.join(taskDir, `${prefix}-report.json`);
        const existingReport = await readJsonFile<CursorSubtaskReport>(reportPath);
        if (existingReport) {
          reports.push(existingReport);
          taskNumber += 1;
          continue;
        }
        const adapter = createAgentAdapter(
          cursorConfig,
          options.safetyFlags.allowAgentExecution && !options.safetyFlags.dryRun,
          executor,
        );
        const result = await adapter.run({
          role: 'cursor-subtask',
          workspace: bundle.worktreePath,
          promptPath,
          outputPath: path.join(taskDir, `${prefix}-output.md`),
          evidenceDir,
          phaseId,
        });
        if (result.status === 'fail') {
          await fail(`Cursor subtask ${task.id} command failed`, 'failed');
        }
        if (result.status !== 'pass' || !result.parsedReport) {
          await fail(`Cursor subtask ${task.id} did not produce a valid report`);
        }
        const report = result.parsedReport as CursorSubtaskReport;
        if (report.taskId !== task.id) {
          await fail(`Cursor subtask report taskId mismatch: expected ${task.id}, got ${report.taskId}`);
        }
        await writeFile(reportPath, stringifyDeterministicJson(report));
        reports.push(report);
        taskNumber += 1;
      }
      await writeFile(
        path.join(taskDir, 'cursor-subtasks.json'),
        stringifyDeterministicJson({ tasks: reports, status: 'pass' }),
      );
      await completeStage('cursor-subtasks', 'restricted-agent-delegate');
    }
  }

  if (stage === 'restricted-agent-delegate') {
    const acceptedPlanPath = readAcceptedPlanPath(evidenceDir);
    const maybeAcceptedPlan = await readJsonFile<PlannerReport>(acceptedPlanPath);
    if (!maybeAcceptedPlan) {
      await fail('Restricted agent delegate cannot run without accepted-plan/accepted-plan.json');
      throw new Error('unreachable');
    }
    const delegateConfig = autopilotConfig.restrictedAgentDelegate;
    const taskRoot = path.join(evidenceDir, delegateConfig?.evidenceDirName ?? 'restricted-agent-tasks');
    await mkdir(taskRoot, { recursive: true });
    if (!delegateConfig?.enabled || options.safetyFlags.dryRun) {
      await writeFile(
        path.join(taskRoot, 'restricted-agent-tasks.json'),
        stringifyDeterministicJson({ tasks: [], status: 'disabled' }),
      );
      await completeStage('restricted-agent-delegate', 'recheck');
    } else {
      await writeFile(
        path.join(taskRoot, 'restricted-agent-tasks.json'),
        stringifyDeterministicJson({
          tasks: [],
          status: 'not_implemented',
          message: 'Not implemented in packaged export yet. Restricted-agent delegate internals were intentionally excluded from this zip-ready package.',
        }),
      );
      await fail('Not implemented in packaged export yet: restricted-agent-delegate');
    }
  }

  if (stage === 'recheck') {
    await runAgentStage('recheck', 'rechecker', 'recheck-prompt.md', 'recheck-output.md');
  }

  if (stage === 'local-validation') {
    const results = await runShellCommands(
      executor,
      bundle.worktreePath,
      evidenceDir,
      bundle.commands.localValidation,
      'local-validation',
      {
        dryRun: options.safetyFlags.dryRun,
        timeoutMs: autopilotConfig.commandExecutor?.defaultTimeoutMs,
        inactivityTimeoutMs: autopilotConfig.commandExecutor?.inactivityTimeoutMs,
        maxRetries: autopilotConfig.commandExecutor?.maxRetries,
      },
    );
    await writeLocalValidationResults(evidenceDir, results);
    if (!options.safetyFlags.dryRun && results.some((result) => commandEvidenceStatus(result) !== 'pass')) {
      await fail('Local validation failed');
    }
    await completeStage('local-validation', 'changed-path-scan');
  }

  if (stage === 'changed-path-scan') {
    if (!options.safetyFlags.dryRun) {
      const statusBefore = await git.status(bundle.worktreePath, evidenceDir);
      const changedPaths = await git.changedPaths(
        bundle.worktreePath,
        autopilotConfig.git.baseRef,
        evidenceDir,
      );
      const diffText = await git.diffText(bundle.worktreePath, autopilotConfig.git.baseRef, evidenceDir);
      await writeGitArtifacts(evidenceDir, {
        statusBefore,
        changedPaths,
        diffSummary: diffText,
      });
    } else {
      await writeGitArtifacts(evidenceDir, {
        statusBefore: { branch: bundle.branch, clean: true, porcelain: '', raw: '' },
        changedPaths: [],
        diffSummary: '',
      });
    }
    await completeStage('changed-path-scan', 'secret-scan');
  }

  if (stage === 'secret-scan') {
    const changedPaths = await readJsonFile<string[]>(
      path.join(evidenceDir, 'git', 'changed-paths.json'),
    ) ?? [];
    const diffText = await readFile(path.join(evidenceDir, 'diff-summary.txt'), 'utf8').catch(() => '');
    const secretScan = scanChangedPathsForSecrets({ changedPaths, diffText });
    await writeFile(path.join(evidenceDir, 'secret-scan.json'), stringifyDeterministicJson(secretScan));
    if (!options.safetyFlags.dryRun && secretScan.secretsDetected) {
      await fail(`Secret scan blocked: ${secretScan.hits.join('; ')}`);
    }
    await completeStage('secret-scan', 'local-evidence');
  }

  if (stage === 'local-evidence') {
    const statusBefore = await readJsonFile<{ branch: string; clean: boolean; porcelain: string; raw: string }>(
      path.join(evidenceDir, 'git', 'status-before.json'),
    ) ?? { branch: bundle.branch, clean: true, porcelain: '', raw: '' };
    const changedPaths = await readJsonFile<string[]>(
      path.join(evidenceDir, 'git', 'changed-paths.json'),
    ) ?? [];
    const secretScan = await readJsonFile<ReturnType<typeof scanChangedPathsForSecrets>>(
      path.join(evidenceDir, 'secret-scan.json'),
    ) ?? scanChangedPathsForSecrets({ changedPaths });
    const recheckReport = await readRecheckReportFromEvidence(evidenceDir);
    const localResults = await readLocalValidationResults(evidenceDir);
    const evidence = collectPhaseMergeEvidence({
      phase,
      policy: config.automergePolicy,
      localCommandResults: localResults,
      recheckReport,
      changedPaths,
      worktreeStatus: statusBefore,
      secretScan,
      remoteChecks: 'none',
    });
    await writePhaseMergeEvidence(evidenceDir, evidence);
    await completeStage('local-evidence', 'local-gate');
  }

  if (stage === 'local-gate') {
    const evidence = JSON.parse(
      await readFile(path.join(evidenceDir, 'phase-merge-evidence.json'), 'utf8'),
    );
    const decision = evaluateAutomerge(phase, config.automergePolicy, {
      ...evidence,
      worktreeClean: true,
    });
    await writeFinalDecision(evidenceDir, { stage: 'local-gate', decision, evidence });
    if (decision.decision !== 'allow') {
      await fail(`Local gate blocked: ${decision.reasons.join('; ')}`);
    }
    await completeStage('local-gate', 'commit');
    return {
      phaseId,
      runId,
      evidenceDir,
      status: runState.status,
      dryRun: options.safetyFlags.dryRun,
      currentStage: runState.currentStage,
      completedStages: runState.completedStages,
      mergeDecision: decision,
    };
  }

  if (stage === 'commit') {
    if (!options.safetyFlags.dryRun) {
      const commit = await git.commitIfNeeded({
        worktreePath: bundle.worktreePath,
        phaseId,
        evidenceDir,
        message: `${phaseId}: complete ${phase.id.toLowerCase()}`,
      });
      const statusAfter = await git.status(bundle.worktreePath, evidenceDir);
      await writeGitArtifacts(evidenceDir, {
        statusAfter,
        commits: commit,
      });
      if (!statusAfter.clean) {
        await fail('Worktree is not clean after commit');
      }
    }
    await completeStage('commit', 'pr');
  }

  if (stage === 'pr') {
    if (!options.safetyFlags.allowPr || options.safetyFlags.dryRun) {
      await completeStage('pr', 'checks');
    } else {
      const pr = await github.createPullRequest({
        repoRoot,
        branch: bundle.branch,
        base: autopilotConfig.git.baseBranch,
        evidenceDir,
      });
      runState = {
        ...runState,
        ...(runState as PhaseRunState & { pr?: number }),
      };
      await writeRunState(evidenceDir, runState);
      await writeFile(
        path.join(evidenceDir, 'pr.json'),
        stringifyDeterministicJson(pr),
      );
      await completeStage('pr', 'checks');
    }
  }

  if (stage === 'checks') {
    if (!options.safetyFlags.allowPr || options.safetyFlags.dryRun) {
      await completeStage('checks', 'remote-evidence');
    } else {
      const prPayload = JSON.parse(
        await readFile(path.join(evidenceDir, 'pr.json'), 'utf8'),
      ) as { number: number };
      await github.watchChecks({
        repoRoot,
        prNumber: prPayload.number,
        evidenceDir,
      });
      await completeStage('checks', 'remote-evidence');
    }
  }

  if (stage === 'remote-evidence') {
    const statusAfter = options.safetyFlags.dryRun
      ? { branch: bundle.branch, clean: true, porcelain: '', raw: '' }
      : await git.status(bundle.worktreePath, evidenceDir);
    const changedPaths = await readJsonFile<string[]>(
      path.join(evidenceDir, 'git', 'changed-paths.json'),
    ) ?? [];
    const secretScan = await readJsonFile<ReturnType<typeof scanChangedPathsForSecrets>>(
      path.join(evidenceDir, 'secret-scan.json'),
    ) ?? scanChangedPathsForSecrets({ changedPaths });
    const recheckReport = await readRecheckReportFromEvidence(evidenceDir);
    const localResults = await readLocalValidationResults(evidenceDir);
    const remoteChecks = await readJsonFile<{ status?: 'pass' | 'fail' | 'pending' | 'none' }>(
      path.join(evidenceDir, 'checks.json'),
    ).then((payload) => payload?.status ?? 'none');
    const evidence = collectPhaseMergeEvidence({
      phase,
      policy: config.automergePolicy,
      localCommandResults: localResults,
      recheckReport,
      changedPaths,
      worktreeStatus: statusAfter,
      secretScan,
      remoteChecks,
    });
    await writePhaseMergeEvidence(evidenceDir, evidence);
    await completeStage('remote-evidence', 'final-gate');
  }

  if (stage === 'final-gate') {
    const evidence = JSON.parse(
      await readFile(path.join(evidenceDir, 'phase-merge-evidence.json'), 'utf8'),
    );
    const decision = evaluateAutomerge(phase, config.automergePolicy, evidence);
    await writeFinalDecision(evidenceDir, { stage: 'final-gate', decision, evidence });
    if (decision.decision !== 'allow') {
      await fail(`Final gate blocked: ${decision.reasons.join('; ')}`);
    }
    await completeStage('final-gate', 'merge');
    return {
      phaseId,
      runId,
      evidenceDir,
      status: runState.status,
      dryRun: options.safetyFlags.dryRun,
      currentStage: runState.currentStage,
      completedStages: runState.completedStages,
      mergeDecision: decision,
    };
  }

  if (stage === 'merge') {
    if (!options.safetyFlags.allowMerge || options.safetyFlags.dryRun) {
      await completeStage('merge', 'cleanup');
    } else {
      const evidence = JSON.parse(
        await readFile(path.join(evidenceDir, 'phase-merge-evidence.json'), 'utf8'),
      );
      const decision = evaluateAutomerge(phase, config.automergePolicy, evidence);
      if (decision.decision !== 'allow') {
        await fail(`Automerge blocked: ${decision.reasons.join('; ')}`);
      }
      const prPayload = JSON.parse(
        await readFile(path.join(evidenceDir, 'pr.json'), 'utf8'),
      ) as { number: number };
      const merge = await github.mergePullRequest({
        repoRoot,
        prNumber: prPayload.number,
        mergeMethod: config.automergePolicy.mergeMethod,
        deleteBranch: config.automergePolicy.deleteBranchAfterMerge,
        evidenceDir,
      });
      await writeFile(path.join(evidenceDir, 'merge.json'), stringifyDeterministicJson(merge));
      if (!merge.merged) {
        const remote = await github.verifyPullRequestMerged({
          repoRoot,
          prNumber: prPayload.number,
          evidenceDir,
        });
        if (!remote.merged) {
          await fail(
            `PR merge failed and remote PR is not merged: ${merge.failureReason ?? merge.commandResult.status}`,
          );
        }
        await writeFile(
          path.join(evidenceDir, 'merge.json'),
          stringifyDeterministicJson({
            ...merge,
            merged: true,
            remoteVerified: true,
            remoteState: remote.state,
            mergeCommit: remote.mergeCommit ?? merge.mergeCommit,
            mergedAt: remote.mergedAt,
          }),
        );
      }
      await completeStage('merge', 'cleanup');
    }
  }

  if (stage === 'cleanup') {
    if (!options.safetyFlags.dryRun && config.automergePolicy.removeCleanWorktreeAfterMerge) {
      try {
        await git.removeWorktree({
          repoRoot,
          worktreePath: bundle.worktreePath,
          evidenceDir,
          allowDirty: false,
        });
      } catch (error) {
        await fail(error instanceof Error ? error.message : String(error));
      }
    }
    await completeStage('cleanup', 'complete');
    runState = advanceRunState(runState, { status: 'complete', currentStage: 'complete' });
    await writeRunState(evidenceDir, runState);
  }

  return {
    phaseId,
    runId,
    evidenceDir,
    status: runState.status,
    dryRun: options.safetyFlags.dryRun,
    currentStage: runState.currentStage,
    completedStages: runState.completedStages,
    ...(runState.lastError ? { lastError: runState.lastError } : {}),
  };
};

const stageOrder: ExecuteStageName[] = [
  'bundle',
  'preflight',
  'setup',
  'bootstrap',
  'planning',
  'plan-acceptance',
  'execution',
  'cursor-subtasks',
  'restricted-agent-delegate',
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
  'cleanup',
];

export const runAutopilotForPhase = async (
  repoRoot: string,
  phaseId: string,
  options: {
    runId?: string;
    safetyFlags: AutopilotSafetyFlags;
    deps?: AutopilotDependencies;
    resumeFrom?: AutopilotStage;
  },
): Promise<AutopilotRunSummary> => {
  const runnerPaths = options.deps?.runnerPaths ?? defaultRunnerPaths(repoRoot);
  const config = await loadPhaseRunnerConfig(repoRoot, runnerPaths);
  const autopilotConfig =
    options.deps?.autopilotConfig ?? (await loadAutopilotConfig(repoRoot));
  const phase = config.graph.phases.find((entry) => entry.id === phaseId);
  if (!phase) {
    throw new Error(`Unknown phase: ${phaseId}`);
  }

  const runId = options.runId ?? createRunId();
  const evidenceDir = evidenceDirForPhase(repoRoot, phase, runId);
  const bundle = await buildPhaseRunBundle(config, repoRoot, phaseId, runId, runnerPaths, {
    preflightCommands: autopilotConfig.preflightCommands,
  });
  const runnable = getRunnablePhases(config, { repoRoot, from: phaseId, parallel: 1, runId })[0];
  if (!runnable && !options.safetyFlags.dryRun) {
    throw new Error(`Phase is not runnable: ${phaseId}`);
  }

  let runState = initialRunState({
    phase: phaseId,
    runId,
    dryRun: options.safetyFlags.dryRun,
    safetyFlags: {
      allowAgentExecution: options.safetyFlags.allowAgentExecution,
      allowPr: options.safetyFlags.allowPr,
      allowMerge: options.safetyFlags.allowMerge,
    },
  });
  await writeRunState(evidenceDir, runState);

  if (options.safetyFlags.dryRun) {
    await writeDryRunPlan(evidenceDir, bundle, options.safetyFlags, runnable ?? {
      phase,
      status: 'queued',
      branch: bundle.branch,
      worktreePath: bundle.worktreePath,
      evidenceDir,
      codexOrchestrator: { role: 'codex', canUseCursor: true, planPromptTemplate: '' },
      cursorDelegate: {
        model: 'configured-agent',
        executorPromptPath: '',
        recheckPromptPath: '',
        executorCommand: '',
        recheckCommand: '',
      },
      requiredCommands: [],
      notes: [],
    });
    await snapshotProgress(repoRoot, evidenceDir, 'before');
    runState = advanceRunState(runState, {
      status: 'complete',
      currentStage: 'complete',
      completedStage: 'bundle',
    });
    await writeRunState(evidenceDir, runState);
    await writeFinalDecision(evidenceDir, {
      status: 'complete',
      dryRun: true,
      message: 'Dry-run plan written; no git/agent/pr/merge mutations performed.',
    });
    return {
      phaseId,
      runId,
      evidenceDir,
      status: 'complete',
      dryRun: true,
      currentStage: 'complete',
      completedStages: runState.completedStages,
    };
  }

  await snapshotProgress(repoRoot, evidenceDir, 'before');

  const resumeIndex = options.resumeFrom
    ? stageOrder.indexOf(options.resumeFrom as ExecuteStageName)
    : 0;
  const stages = stageOrder.slice(Math.max(resumeIndex, 0));

  try {
    for (const stage of stages) {
      const summary = await executeStage(repoRoot, phaseId, stage, {
        runId,
        safetyFlags: options.safetyFlags,
        deps: { ...options.deps, autopilotConfig, runnerPaths },
      });
      if (summary.status === 'blocked' || summary.status === 'failed') {
        return summary;
      }
      if (
        (stage === 'local-gate' || stage === 'final-gate') &&
        summary.mergeDecision?.decision === 'block'
      ) {
        const blocked = markPhaseBlocked(
          config.graph,
          config.state,
          phaseId,
          summary.mergeDecision.reasons.join('; '),
        );
        await writePhaseState(runnerPaths.statePath, blocked);
        runState = advanceRunState(
          (await loadRunState(evidenceDir)) ?? runState,
          { status: 'blocked', lastError: summary.mergeDecision.reasons.join('; ') },
        );
        await writeRunState(evidenceDir, runState);
        return {
          ...summary,
          status: 'blocked',
          lastError: summary.mergeDecision.reasons.join('; '),
        };
      }
    }

    await snapshotProgress(repoRoot, evidenceDir, 'after');
    const nextState = markPhaseComplete(config.graph, config.state, phaseId, {
      branch: bundle.branch,
      evidenceDir,
    });
    await writePhaseState(runnerPaths.statePath, nextState);
    runState = advanceRunState((await loadRunState(evidenceDir)) ?? runState, {
      status: 'complete',
      currentStage: 'complete',
    });
    await writeRunState(evidenceDir, runState);
    return {
      phaseId,
      runId,
      evidenceDir,
      status: 'complete',
      dryRun: false,
      currentStage: 'complete',
      completedStages: runState.completedStages,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    runState = advanceRunState((await loadRunState(evidenceDir)) ?? runState, {
      status: 'blocked',
      lastError: message,
    });
    await writeRunState(evidenceDir, runState);
    return {
      phaseId,
      runId,
      evidenceDir,
      status: runState.status,
      dryRun: false,
      currentStage: runState.currentStage,
      completedStages: runState.completedStages,
      lastError: message,
    };
  }
};

export const runAutopilotUntilComplete = async (
  repoRoot: string,
  options: {
    from?: string;
    safetyFlags: AutopilotSafetyFlags;
    deps?: AutopilotDependencies;
  },
): Promise<AutopilotRunSummary[]> => {
  const runnerPaths = options.deps?.runnerPaths ?? defaultRunnerPaths(repoRoot);
  const config = await loadPhaseRunnerConfig(repoRoot, runnerPaths);
  const parallel = options.safetyFlags.parallel;
  const summaries: AutopilotRunSummary[] = [];

  while (true) {
    const runnable = getRunnablePhases(config, {
      repoRoot,
      from: options.from ?? config.state.currentPhase,
      parallel,
    });
    if (runnable.length === 0) {
      break;
    }
    for (const job of runnable.slice(0, parallel)) {
      const summary = await runAutopilotForPhase(repoRoot, job.phase.id, {
        safetyFlags: options.safetyFlags,
        deps: { ...options.deps, runnerPaths },
      });
      summaries.push(summary);
      if (
        (summary.status === 'blocked' || summary.status === 'failed') &&
        !options.safetyFlags.continueOnBlocked
      ) {
        return summaries;
      }
    }
    const refreshed = await loadPhaseRunnerConfig(repoRoot, runnerPaths);
    config.state = refreshed.state;
    if (options.safetyFlags.dryRun) {
      break;
    }
  }

  return summaries;
};

export const resumeAutopilot = async (
  repoRoot: string,
  phaseId: string,
  runId: string,
  options: {
    safetyFlags: AutopilotSafetyFlags;
    deps?: AutopilotDependencies;
  },
): Promise<AutopilotRunSummary> => {
  const evidenceDir = evidenceDirForPhaseId(repoRoot, phaseId, runId);
  const existing = await loadRunState(evidenceDir);
  if (!existing) {
    throw new Error(`No run state found for ${phaseId} / ${runId}`);
  }
  const lastCompleted = existing.completedStages.at(-1);
  const resumeFrom =
    lastCompleted !== undefined
      ? stageOrder[Math.min(stageOrder.indexOf(lastCompleted as ExecuteStageName) + 1, stageOrder.length - 1)]
      : 'bundle';
  return runAutopilotForPhase(repoRoot, phaseId, {
    runId,
    safetyFlags: options.safetyFlags,
    deps: options.deps,
    resumeFrom: resumeFrom as AutopilotStage,
  });
};
