import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createAgentAdapter, type AgentTemplateConfig } from './agent-adapters.js';
import type { PlannerReport } from './agent-report-parser.js';
import {
  commandEvidenceStatus,
  createSpawnCommandExecutor,
  type CommandExecutionResult,
  type CommandExecutor,
} from './command-executor.js';
import {
  collectPhaseMergeEvidence,
  readLocalValidationResults,
  readRecheckReportFromEvidence,
  writeLocalValidationResults,
  writePhaseMergeEvidence,
} from './evidence-collector.js';
import { createGitAdapter, writeGitArtifacts, type GitAdapter } from './git-adapter.js';
import { createGitHubCliAdapter, type GitHubCliAdapter } from './github-cli-adapter.js';
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
import { scanChangedPathsForSecrets } from './secret-scan.js';
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
} from './phase-runner.js';

export interface AutopilotConfig {
  schemaVersion: number;
  git: {
    baseBranch: string;
    baseRef: string;
  };
  agents: {
    planner: AgentTemplateConfig;
    executor: AgentTemplateConfig;
    rechecker: AgentTemplateConfig;
    cursorSubtask?: AgentTemplateConfig;
  };
  dependencyBootstrapCommands?: string[];
  commandExecutor?: {
    defaultTimeoutMs?: number;
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
  | 'recheck'
  | 'local-validation'
  | 'commit'
  | 'pr'
  | 'checks'
  | 'merge'
  | 'cleanup'
  | 'bundle'
  | 'evidence';

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
  options: { dryRun: boolean; timeoutMs?: number },
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
      'execution -> recheck -> local-validation -> changed-path-scan -> secret-scan ->',
      'commit -> pr -> checks -> evidence -> merge -> cleanup -> complete',
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
  const source = path.join(repoRoot, 'PROGRESS.MD');
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
  const config = await loadPhaseRunnerConfig(repoRoot);
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
  const bundle = await buildPhaseRunBundle(config, repoRoot, phaseId, runId);
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
          ? 'recheck'
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
      },
    );
    await writeLocalValidationResults(evidenceDir, results);
    if (!options.safetyFlags.dryRun && results.some((result) => commandEvidenceStatus(result) !== 'pass')) {
      await fail('Local validation failed');
    }
    await completeStage('local-validation', 'commit');
  }

  if (stage === 'commit') {
    if (!options.safetyFlags.dryRun) {
      const commit = await git.commitIfNeeded({
        worktreePath: bundle.worktreePath,
        phaseId,
        message: `${phaseId}: complete ${phase.id.toLowerCase()}`,
      });
      const statusAfter = await git.status(bundle.worktreePath);
      await writeGitArtifacts(evidenceDir, {
        statusAfter,
        commits: commit,
      });
      if (!statusAfter.clean) {
        await fail('Worktree is not clean after commit');
      }
    }
    await completeStage('commit', 'evidence');
  }

  if (stage === 'evidence') {
    const statusBefore = options.safetyFlags.dryRun
      ? { branch: bundle.branch, clean: true, porcelain: '', raw: '' }
      : await git.status(bundle.worktreePath);
    const changedPaths = options.safetyFlags.dryRun
      ? []
      : await git.changedPaths(bundle.worktreePath, autopilotConfig.git.baseRef);
    const secretScan = scanChangedPathsForSecrets({ changedPaths });
    const recheckReport = await readRecheckReportFromEvidence(evidenceDir);
    const localResults = await readLocalValidationResults(evidenceDir);
    const checksPath = path.join(evidenceDir, 'checks.json');
    const remoteChecks = await readFile(checksPath, 'utf8')
      .then((contents) => JSON.parse(contents) as { status?: 'pass' | 'fail' | 'pending' | 'none' })
      .then((payload) => payload.status ?? 'none')
      .catch(() => 'none' as const);
    const evidence = collectPhaseMergeEvidence({
      phase,
      policy: config.automergePolicy,
      localCommandResults: localResults,
      recheckReport,
      changedPaths,
      worktreeStatus: statusBefore,
      secretScan,
      remoteChecks,
    });
    await writeGitArtifacts(evidenceDir, {
      statusBefore,
      changedPaths,
      diffSummary: changedPaths.join('\n'),
    });
    await writePhaseMergeEvidence(evidenceDir, evidence);
    const decision = evaluateAutomerge(phase, config.automergePolicy, evidence);
    await writeFinalDecision(evidenceDir, { decision, evidence });
    await completeStage('evidence', 'pr');
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
      await completeStage('checks', 'merge');
    } else {
      const prPayload = JSON.parse(
        await readFile(path.join(evidenceDir, 'pr.json'), 'utf8'),
      ) as { number: number };
      await github.watchChecks({
        repoRoot,
        prNumber: prPayload.number,
        evidenceDir,
      });
      await completeStage('checks', 'merge');
    }
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
      await github.mergePullRequest({
        repoRoot,
        prNumber: prPayload.number,
        mergeMethod: config.automergePolicy.mergeMethod,
        deleteBranch: config.automergePolicy.deleteBranchAfterMerge,
        evidenceDir,
      });
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
  'recheck',
  'local-validation',
  'commit',
  'pr',
  'checks',
  'evidence',
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
  const config = await loadPhaseRunnerConfig(repoRoot);
  const phase = config.graph.phases.find((entry) => entry.id === phaseId);
  if (!phase) {
    throw new Error(`Unknown phase: ${phaseId}`);
  }

  const runId = options.runId ?? createRunId();
  const evidenceDir = evidenceDirForPhase(repoRoot, phase, runId);
  const bundle = await buildPhaseRunBundle(config, repoRoot, phaseId, runId);
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
        model: 'composer-2.5',
        implementationPromptPath: '',
        recheckPromptPath: '',
        implementationCommand: '',
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
        deps: options.deps,
      });
      if (summary.status === 'blocked' || summary.status === 'failed') {
        return summary;
      }
      if (stage === 'evidence' && summary.mergeDecision?.decision === 'block') {
        const paths = defaultRunnerPaths(repoRoot);
        const blocked = markPhaseBlocked(
          config.graph,
          config.state,
          phaseId,
          summary.mergeDecision.reasons.join('; '),
        );
        await writePhaseState(paths.statePath, blocked);
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
    const paths = defaultRunnerPaths(repoRoot);
    const nextState = markPhaseComplete(config.graph, config.state, phaseId, {
      branch: bundle.branch,
      evidenceDir,
    });
    await writePhaseState(paths.statePath, nextState);
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
  const config = await loadPhaseRunnerConfig(repoRoot);
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
        deps: options.deps,
      });
      summaries.push(summary);
      if (
        (summary.status === 'blocked' || summary.status === 'failed') &&
        !options.safetyFlags.continueOnBlocked
      ) {
        return summaries;
      }
    }
    const refreshed = await loadPhaseRunnerConfig(repoRoot);
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
