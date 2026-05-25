import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from './json.js';

export type PhaseStatus =
  | 'queued'
  | 'planning'
  | 'planned'
  | 'implementing'
  | 'implemented'
  | 'rechecking'
  | 'validating'
  | 'pr_open'
  | 'checks_pending'
  | 'merged'
  | 'cleaned_up'
  | 'complete'
  | 'blocked'
  | 'failed';

export interface PhaseDefinition {
  id: string;
  plan: string;
  dependsOn: string[];
  allowedPaths: string[];
  parallelGroup: string;
  automerge: boolean;
}

export interface PhaseGraph {
  schemaVersion: number;
  defaultStartPhase: string;
  defaultParallelism: number;
  globalValidationCommands: string[];
  phases: PhaseDefinition[];
}

export interface PhaseStateEntry {
  status: PhaseStatus;
  branch?: string;
  pr?: number;
  mergeCommit?: string;
  evidenceDir?: string;
  reason?: string;
}

export interface PhaseState {
  schemaVersion: number;
  lastUpdated: string;
  sourceNote?: string;
  currentPhase: string;
  phases: Record<string, PhaseStateEntry>;
}

export interface AutomergePolicy {
  schemaVersion: number;
  enabled: boolean;
  mergeMethod: 'merge' | 'squash' | 'rebase';
  deleteBranchAfterMerge: boolean;
  removeCleanWorktreeAfterMerge: boolean;
  allowNoRemoteChecksWhenLocalGatePasses: boolean;
  requiredLocalCommands: string[];
  requiredPreflight: string[];
  requiredArtifacts: string[];
  blockMergeWhen: string[];
  gapPolicy: {
    blocking: string;
    non_blocking: string;
    out_of_scope: string;
  };
}

export interface PhaseRunnerConfig {
  graph: PhaseGraph;
  state: PhaseState;
  automergePolicy: AutomergePolicy;
}

export interface RunnerPaths {
  graphPath: string;
  statePath: string;
  policyPath: string;
  promptsDir: string;
}

export interface RunnablePhase {
  phase: PhaseDefinition;
  status: PhaseStatus;
  branch: string;
  worktreePath: string;
  evidenceDir: string;
  codexOrchestrator: {
    role: 'codex';
    canUseCursor: true;
    planPromptTemplate: string;
  };
  cursorDelegate: {
    model: string;
    executorPromptPath: string;
    recheckPromptPath: string;
    executorCommand: string;
    recheckCommand: string;
  };
  requiredCommands: string[];
  notes: string[];
}

export interface PhaseRunBundle {
  phase: PhaseDefinition;
  branch: string;
  worktreePath: string;
  evidenceDir: string;
  codexPlanPrompt: string;
  cursorImplementationPrompt: string;
  cursorRecheckPrompt: string;
  commands: {
    preflight: string[];
    setup: string[];
    cursorImplementation: string;
    cursorRecheck: string;
    localValidation: string[];
    pr: string[];
    cleanup: string[];
  };
}

export interface PhaseRunBundleOptions {
  preflightCommands?: string[];
}

export interface CommandEvidence {
  command: string;
  status: 'pass' | 'fail' | 'blocked' | 'not_run';
}

export interface PhaseMergeEvidence {
  localCommands: CommandEvidence[];
  remoteChecks: 'pass' | 'fail' | 'pending' | 'none';
  cursorRecheck: 'pass' | 'blocked' | 'not_run';
  phaseAcceptanceComplete: boolean;
  changedPaths: string[];
  worktreeClean: boolean;
  secretsDetected: boolean;
  blockingGaps: string[];
}

export interface AutomergeDecision {
  decision: 'allow' | 'block';
  reasons: string[];
  mergeCommand?: string;
  deleteBranchAfterMerge: boolean;
  removeCleanWorktreeAfterMerge: boolean;
}

export interface PhaseCompletionMetadata {
  branch?: string;
  pr?: number;
  mergeCommit?: string;
  evidenceDir?: string;
}

const DEFAULT_RUN_ID = 'planned';
export const DEFAULT_PREFLIGHT_COMMANDS = ['git status --short --branch'];

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, 'utf8')) as T;

export const defaultRunnerPaths = (repoRoot: string): RunnerPaths => ({
  graphPath: path.join(repoRoot, 'automation', 'phase-graph.json'),
  statePath: path.join(repoRoot, 'automation', 'phase-state.json'),
  policyPath: path.join(repoRoot, 'automation', 'policies', 'automerge-policy.json'),
  promptsDir: path.join(repoRoot, 'automation', 'prompts'),
});

export const loadPhaseRunnerConfig = async (
  repoRoot: string,
  paths: RunnerPaths = defaultRunnerPaths(repoRoot),
): Promise<PhaseRunnerConfig> => ({
  graph: await readJson<PhaseGraph>(paths.graphPath),
  state: await readJson<PhaseState>(paths.statePath),
  automergePolicy: await readJson<AutomergePolicy>(paths.policyPath),
});

export const phaseSlug = (phase: PhaseDefinition): string =>
  path
    .basename(phase.plan, '.md')
    .toLowerCase()
    .replace(/_/g, '-');

export const branchNameForPhase = (phase: PhaseDefinition): string => `phase/${phaseSlug(phase)}`;

export const worktreePathForPhase = (repoRoot: string, phase: PhaseDefinition): string =>
  path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}-${phaseSlug(phase)}-wt`);

export const evidenceDirForPhase = (
  repoRoot: string,
  phase: PhaseDefinition,
  runId = DEFAULT_RUN_ID,
): string => evidenceDirForPhaseId(repoRoot, phase.id, runId);

export const evidenceDirForPhaseId = (
  repoRoot: string,
  phaseId: string,
  runId = DEFAULT_RUN_ID,
): string => path.join(repoRoot, 'runs', 'phase-runner', phaseId, runId);

const phaseOrderIndex = (graph: PhaseGraph, phaseId: string): number =>
  graph.phases.findIndex((phase) => phase.id === phaseId);

const getStateStatus = (state: PhaseState, phaseId: string): PhaseStatus =>
  state.phases[phaseId]?.status ?? 'queued';

const isComplete = (state: PhaseState, phaseId: string): boolean =>
  getStateStatus(state, phaseId) === 'complete';

const pathBase = (scope: string): string => (scope.endsWith('/**') ? scope.slice(0, -3) : scope);

const pathScopeConflicts = (left: string, right: string): boolean => {
  if (left.toLowerCase() === 'progress.md' || right.toLowerCase() === 'progress.md') {
    return false;
  }

  const leftBase = pathBase(left);
  const rightBase = pathBase(right);
  return (
    leftBase === rightBase ||
    leftBase.startsWith(`${rightBase}/`) ||
    rightBase.startsWith(`${leftBase}/`)
  );
};

export const phasePathScopesConflict = (left: PhaseDefinition, right: PhaseDefinition): boolean =>
  left.allowedPaths.some((leftPath) =>
    right.allowedPaths.some((rightPath) => pathScopeConflicts(leftPath, rightPath)),
  );

const hasDependencyCycle = (graph: PhaseGraph): boolean => {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const phaseIds = new Set(graph.phases.map((phase) => phase.id));

  const visit = (phaseId: string): boolean => {
    if (visited.has(phaseId) || !phaseIds.has(phaseId)) {
      return false;
    }
    if (visiting.has(phaseId)) {
      return true;
    }
    visiting.add(phaseId);
    const phase = graph.phases.find((entry) => entry.id === phaseId);
    const foundCycle = phase?.dependsOn.some((dependency) => visit(dependency)) ?? false;
    visiting.delete(phaseId);
    visited.add(phaseId);
    return foundCycle;
  };

  return graph.phases.some((phase) => visit(phase.id));
};

export const validatePhaseGraph = (graph: PhaseGraph): string[] => {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const phase of graph.phases) {
    if (seen.has(phase.id)) {
      errors.push(`Duplicate phase id: ${phase.id}`);
    }
    seen.add(phase.id);
    if (!phase.plan.startsWith('phase-plans/')) {
      errors.push(`${phase.id} plan must live under phase-plans/`);
    }
    if (phase.allowedPaths.length === 0) {
      errors.push(`${phase.id} must define allowedPaths`);
    }
  }

  for (const phase of graph.phases) {
    for (const dependency of phase.dependsOn) {
      if (!seen.has(dependency)) {
        errors.push(`${phase.id} depends on unknown phase ${dependency}`);
      }
    }
  }

  if (hasDependencyCycle(graph)) {
    errors.push('Phase graph contains a dependency cycle');
  }

  return errors;
};

export const getRunnablePhases = (
  config: PhaseRunnerConfig,
  options: { from?: string; parallel?: number; repoRoot: string; runId?: string },
): RunnablePhase[] => {
  const from = options.from ?? config.graph.defaultStartPhase;
  const parallel = options.parallel ?? config.graph.defaultParallelism;
  const fromIndex = phaseOrderIndex(config.graph, from);
  if (fromIndex < 0) {
    throw new Error(`Unknown start phase: ${from}`);
  }

  const selected: RunnablePhase[] = [];
  for (const phase of config.graph.phases.slice(fromIndex)) {
    const status = getStateStatus(config.state, phase.id);
    if (status === 'complete' || status === 'blocked' || status === 'failed') {
      continue;
    }
    if (!phase.dependsOn.every((dependency) => isComplete(config.state, dependency))) {
      continue;
    }
    if (selected.some((existing) => phasePathScopesConflict(existing.phase, phase))) {
      continue;
    }

    selected.push(buildRunnablePhase(config, options.repoRoot, phase, options.runId));
    if (selected.length >= parallel) {
      break;
    }
  }

  return selected;
};

export const buildRunnablePhase = (
  config: PhaseRunnerConfig,
  repoRoot: string,
  phase: PhaseDefinition,
  runId = DEFAULT_RUN_ID,
): RunnablePhase => {
  const branch = branchNameForPhase(phase);
  const worktreePath = worktreePathForPhase(repoRoot, phase);
  const evidenceDir = evidenceDirForPhase(repoRoot, phase, runId);
  const implementationPromptPath = path.join(evidenceDir, 'cursor-implementation-prompt.md');
  const recheckPromptPath = path.join(evidenceDir, 'cursor-recheck-prompt.md');

  return {
    phase,
    status: getStateStatus(config.state, phase.id),
    branch,
    worktreePath,
    evidenceDir,
    codexOrchestrator: {
      role: 'codex',
      canUseCursor: true,
      planPromptTemplate: 'automation/prompts/planner.md',
    },
    cursorDelegate: {
      model: 'configured-agent',
      executorPromptPath: implementationPromptPath,
      recheckPromptPath,
      executorCommand: `{{AGENT_COMMAND}} --workspace ${quoteShell(worktreePath)} --prompt ${quoteShell(implementationPromptPath)}`,
      recheckCommand: `{{AGENT_COMMAND}} --workspace ${quoteShell(worktreePath)} --prompt ${quoteShell(recheckPromptPath)}`,
    },
    requiredCommands: [...config.graph.globalValidationCommands],
    notes: [
      'The deterministic runner is the phase sequencer and release controller.',
      'The planner role is read-only and must produce a validated plan before execution.',
      'The executor role consumes the accepted plan and may delegate only accepted bounded subtasks to configured agents.',
      'Progress-file updates should be serialized before final merge because progress files are often high-conflict.',
    ],
  };
};

const quoteShell = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

const replaceAllLiteral = (source: string, token: string, value: string): string =>
  source.split(token).join(value);

const renderTemplate = (template: string, replacements: Record<string, string>): string => {
  let rendered = template;
  for (const [token, value] of Object.entries(replacements)) {
    rendered = replaceAllLiteral(rendered, `{{${token}}}`, value);
  }
  return rendered;
};

const readFirstExistingTemplate = async (templatesDir: string, candidates: string[]): Promise<string> => {
  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      return await readFile(path.join(templatesDir, candidate), 'utf8');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`Unable to read prompt template. Tried: ${candidates.join(', ')}. ${errors.at(-1) ?? ''}`);
};

export const buildPhaseRunBundle = async (
  config: PhaseRunnerConfig,
  repoRoot: string,
  phaseId: string,
  runId = DEFAULT_RUN_ID,
  paths: RunnerPaths = defaultRunnerPaths(repoRoot),
  options: PhaseRunBundleOptions = {},
): Promise<PhaseRunBundle> => {
  const phase = config.graph.phases.find((entry) => entry.id === phaseId);
  if (!phase) {
    throw new Error(`Unknown phase: ${phaseId}`);
  }

  const runnable = buildRunnablePhase(config, repoRoot, phase, runId);
  const phasePlanContents = await readFile(path.join(repoRoot, phase.plan), 'utf8');
  const codexPlanTemplate = await readFirstExistingTemplate(paths.promptsDir, [
    'planner.md',
    'codex-planner.md',
  ]);
  const cursorImplementationTemplate = await readFirstExistingTemplate(paths.promptsDir, [
    'executor.md',
    'codex-executor.md',
  ]);
  const cursorRecheckTemplate = await readFirstExistingTemplate(paths.promptsDir, ['recheck.md']);

  const replacements = {
    PHASE_ID: phase.id,
    PHASE_PLAN_PATH: phase.plan,
    PHASE_PLAN_CONTENTS: phasePlanContents,
    WORKTREE_PATH: runnable.worktreePath,
    EVIDENCE_DIR: runnable.evidenceDir,
    ALLOWED_PATHS: phase.allowedPaths.map((allowedPath) => `- ${allowedPath}`).join('\n'),
  };

  return {
    phase,
    branch: runnable.branch,
    worktreePath: runnable.worktreePath,
    evidenceDir: runnable.evidenceDir,
    codexPlanPrompt: renderTemplate(codexPlanTemplate, replacements),
    cursorImplementationPrompt: renderTemplate(cursorImplementationTemplate, replacements),
    cursorRecheckPrompt: renderTemplate(cursorRecheckTemplate, replacements),
    commands: {
      preflight: [...(options.preflightCommands ?? DEFAULT_PREFLIGHT_COMMANDS)],
      setup: [
        'git fetch origin',
        `git worktree add -b ${quoteShell(runnable.branch)} ${quoteShell(runnable.worktreePath)} <BASE_BRANCH>`,
      ],
      cursorImplementation: runnable.cursorDelegate.executorCommand,
      cursorRecheck: runnable.cursorDelegate.recheckCommand,
      localValidation: [...config.graph.globalValidationCommands],
      pr: [
        `gh pr create --fill --base <BASE_BRANCH> --head ${quoteShell(runnable.branch)}`,
        'gh pr checks <pr-number> --watch',
        `gh pr merge <pr-number> --${config.automergePolicy.mergeMethod} --delete-branch`,
      ],
      cleanup: [
        `git worktree remove ${quoteShell(runnable.worktreePath)}`,
        'git worktree list',
      ],
    },
  };
};

export const writePhaseRunBundle = async (bundle: PhaseRunBundle, outputDir: string): Promise<void> => {
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'codex-plan-prompt.md'), bundle.codexPlanPrompt);
  await writeFile(path.join(outputDir, 'planner-prompt.md'), bundle.codexPlanPrompt);
  await writeFile(
    path.join(outputDir, 'cursor-implementation-prompt.md'),
    bundle.cursorImplementationPrompt,
  );
  await writeFile(
    path.join(outputDir, 'codex-executor-prompt.md'),
    bundle.cursorImplementationPrompt,
  );
  await writeFile(path.join(outputDir, 'cursor-recheck-prompt.md'), bundle.cursorRecheckPrompt);
  await writeFile(path.join(outputDir, 'recheck-prompt.md'), bundle.cursorRecheckPrompt);
  await writeFile(
    path.join(outputDir, 'phase-run-plan.json'),
    stringifyDeterministicJson({
      branch: bundle.branch,
      commands: bundle.commands,
      evidenceDir: bundle.evidenceDir,
      phase: bundle.phase,
      worktreePath: bundle.worktreePath,
    }),
  );
};

const pathMatchesAllowedPattern = (changedPath: string, pattern: string): boolean => {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return changedPath === prefix || changedPath.startsWith(`${prefix}/`);
  }
  return changedPath === pattern;
};

export const isPathAllowedForPhase = (phase: PhaseDefinition, changedPath: string): boolean =>
  phase.allowedPaths.some((pattern) => pathMatchesAllowedPattern(changedPath, pattern));

export const evaluateAutomerge = (
  phase: PhaseDefinition,
  policy: AutomergePolicy,
  evidence: PhaseMergeEvidence,
): AutomergeDecision => {
  const reasons: string[] = [];
  const commandByName = new Map(evidence.localCommands.map((entry) => [entry.command, entry]));

  if (!policy.enabled || !phase.automerge) {
    reasons.push('Automerge is disabled by policy or phase configuration.');
  }

  for (const command of policy.requiredLocalCommands) {
    const commandEvidence = commandByName.get(command);
    if (!commandEvidence) {
      reasons.push(`Missing local command evidence: ${command}`);
    } else if (commandEvidence.status !== 'pass') {
      reasons.push(`Local command did not pass: ${command} (${commandEvidence.status})`);
    }
  }

  if (evidence.remoteChecks === 'fail') {
    reasons.push('Remote PR checks failed.');
  } else if (evidence.remoteChecks === 'pending') {
    reasons.push('Remote PR checks are still pending.');
  } else if (
    evidence.remoteChecks === 'none' &&
    !policy.allowNoRemoteChecksWhenLocalGatePasses
  ) {
    reasons.push('Remote PR checks are absent and policy does not allow local-only gating.');
  }

  if (evidence.cursorRecheck !== 'pass') {
    reasons.push(`Cursor recheck did not pass: ${evidence.cursorRecheck}`);
  }

  if (!evidence.phaseAcceptanceComplete) {
    reasons.push('Phase acceptance criteria are incomplete.');
  }

  for (const changedPath of evidence.changedPaths) {
    if (!isPathAllowedForPhase(phase, changedPath)) {
      reasons.push(`Changed path is outside phase scope: ${changedPath}`);
    }
  }

  if (!evidence.worktreeClean) {
    reasons.push('Worktree is not clean after commit.');
  }

  if (evidence.secretsDetected) {
    reasons.push('Secret or credential material was detected.');
  }

  for (const gap of evidence.blockingGaps) {
    reasons.push(`Blocking gap remains: ${gap}`);
  }

  return {
    decision: reasons.length === 0 ? 'allow' : 'block',
    reasons,
    mergeCommand:
      reasons.length === 0
        ? `gh pr merge <pr-number> --${policy.mergeMethod} --delete-branch`
        : undefined,
    deleteBranchAfterMerge: policy.deleteBranchAfterMerge,
    removeCleanWorktreeAfterMerge: policy.removeCleanWorktreeAfterMerge,
  };
};

export const summarizePhaseRunner = (
  config: PhaseRunnerConfig,
  repoRoot: string,
): {
  currentPhase: string;
  complete: number;
  queued: number;
  blocked: number;
  failed: number;
  nextRunnable: RunnablePhase[];
  graphErrors: string[];
} => {
  const statuses = Object.values(config.state.phases).map((entry) => entry.status);
  return {
    currentPhase: config.state.currentPhase,
    complete: statuses.filter((status) => status === 'complete').length,
    queued: statuses.filter((status) => status === 'queued').length,
    blocked: statuses.filter((status) => status === 'blocked').length,
    failed: statuses.filter((status) => status === 'failed').length,
    nextRunnable: getRunnablePhases(config, {
      repoRoot,
      from: config.state.currentPhase,
      parallel: config.graph.defaultParallelism,
    }),
    graphErrors: validatePhaseGraph(config.graph),
  };
};

export const findNextIncompletePhase = (graph: PhaseGraph, state: PhaseState): string | undefined =>
  graph.phases.find((phase) => getStateStatus(state, phase.id) !== 'complete')?.id;

export const markPhaseComplete = (
  graph: PhaseGraph,
  state: PhaseState,
  phaseId: string,
  metadata: PhaseCompletionMetadata = {},
  updatedAt = new Date().toISOString().slice(0, 10),
): PhaseState => {
  if (!graph.phases.some((phase) => phase.id === phaseId)) {
    throw new Error(`Unknown phase: ${phaseId}`);
  }

  const nextState: PhaseState = {
    ...state,
    lastUpdated: updatedAt,
    phases: {
      ...state.phases,
      [phaseId]: {
        ...state.phases[phaseId],
        ...metadata,
        status: 'complete',
      },
    },
  };
  nextState.currentPhase = findNextIncompletePhase(graph, nextState) ?? phaseId;
  return nextState;
};

export const markPhaseBlocked = (
  graph: PhaseGraph,
  state: PhaseState,
  phaseId: string,
  reason: string,
  updatedAt = new Date().toISOString().slice(0, 10),
): PhaseState => {
  if (!graph.phases.some((phase) => phase.id === phaseId)) {
    throw new Error(`Unknown phase: ${phaseId}`);
  }
  return {
    ...state,
    lastUpdated: updatedAt,
    currentPhase: phaseId,
    phases: {
      ...state.phases,
      [phaseId]: {
        ...state.phases[phaseId],
        reason,
        status: 'blocked',
      },
    },
  };
};

export const writePhaseState = async (statePath: string, state: PhaseState): Promise<void> => {
  await writeFile(statePath, stringifyDeterministicJson(state));
};
