import { execFile } from 'node:child_process';
import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  autopilotConfigPathFromAgenticConfig,
  loadAgenticConfig,
  runnerPathsFromAgenticConfig,
} from '../config/load-config.js';
import type { AutopilotConfig } from './phase-autopilot.js';
import {
  validatePhaseGraph,
  type AutomergePolicy,
  type PhaseGraph,
  type PhaseState,
  type RunnerPaths,
} from './phase-runner.js';
import { summarizeCommandSafety } from './command-safety.js';
import { detectMigrations } from './migrate.js';

export type DoctorCheckStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  id: string;
  status: DoctorCheckStatus;
  message: string;
  details?: unknown;
}

export interface DoctorReport {
  schemaVersion: 1;
  status: DoctorCheckStatus;
  repoRoot: string;
  checks: DoctorCheck[];
  recommendedNextActions: string[];
}

export interface SafeCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type SafeCommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<SafeCommandResult>;

export interface DoctorOptions {
  commandRunner?: SafeCommandRunner;
}

const execFileAsync = promisify(execFile);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const exists = async (filePath: string): Promise<boolean> =>
  access(filePath)
    .then(() => true)
    .catch(() => false);

const fileExists = async (filePath: string): Promise<boolean> =>
  stat(filePath)
    .then((entry) => entry.isFile())
    .catch(() => false);

const directoryExists = async (filePath: string): Promise<boolean> =>
  stat(filePath)
    .then((entry) => entry.isDirectory())
    .catch(() => false);

const readJson = async <T>(filePath: string): Promise<{ value?: T; error?: string }> => {
  try {
    return { value: JSON.parse(await readFile(filePath, 'utf8')) as T };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

const defaultCommandRunner: SafeCommandRunner = async (command, args, options) => {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      encoding: 'utf8',
      timeout: 10000,
    });
    return {
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    const commandError = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      exitCode: typeof commandError.code === 'number' ? commandError.code : 1,
      stdout: commandError.stdout ?? '',
      stderr: commandError.stderr ?? commandError.message ?? '',
    };
  }
};

const checkFile = async (
  id: string,
  filePath: string,
  message: string,
  missingMessage: string,
): Promise<DoctorCheck> =>
  (await fileExists(filePath))
    ? { id, status: 'pass', message, details: { path: filePath } }
    : { id, status: 'fail', message: missingMessage, details: { path: filePath } };

const checkDirectory = async (
  id: string,
  dirPath: string,
  message: string,
  missingMessage: string,
): Promise<DoctorCheck> =>
  (await directoryExists(dirPath))
    ? { id, status: 'pass', message, details: { path: dirPath } }
    : { id, status: 'fail', message: missingMessage, details: { path: dirPath } };

const loadRunnerPaths = async (repoRoot: string): Promise<{ paths: RunnerPaths; autopilotConfigPath: string }> => {
  const agenticConfig = await loadAgenticConfig(repoRoot).catch(() => undefined);
  if (!agenticConfig) {
    throw new Error('Unable to read agentic.config.*; using defaults was not possible.');
  }
  return {
    paths: runnerPathsFromAgenticConfig(repoRoot, agenticConfig),
    autopilotConfigPath: autopilotConfigPathFromAgenticConfig(repoRoot, agenticConfig),
  };
};

const graphPhaseIds = (graph: PhaseGraph | undefined): Set<string> =>
  new Set((graph?.phases ?? []).map((phase) => phase.id));

const statusFromChecks = (checks: DoctorCheck[]): DoctorCheckStatus => {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'pass';
};

const commandTemplateChecks = (config: AutopilotConfig | undefined): DoctorCheck => {
  if (!config) {
    return {
      id: 'agent-command-templates-valid',
      status: 'warn',
      message: 'Autopilot config is unavailable, so agent command templates could not be checked.',
    };
  }

  const invalid = Object.entries(config.agents ?? {})
    .filter(([, agent]) => agent?.provider === 'shell' && !agent.commandTemplate?.trim())
    .map(([role]) => role);

  if (invalid.length > 0) {
    return {
      id: 'agent-command-templates-valid',
      status: 'fail',
      message: 'One or more shell agent providers have empty command templates.',
      details: { roles: invalid },
    };
  }

  return {
    id: 'agent-command-templates-valid',
    status: 'pass',
    message: 'Configured shell agent command templates are non-empty.',
  };
};

const schemaVersionCheck = (
  graph: PhaseGraph | undefined,
  state: PhaseState | undefined,
  policy: AutomergePolicy | undefined,
  autopilotConfig: AutopilotConfig | undefined,
): DoctorCheck => {
  const missing = [
    ['phaseGraph', graph],
    ['phaseState', state],
    ['automergePolicy', policy],
    ['autopilotConfig', autopilotConfig],
  ]
    .filter(([, value]) => !isRecord(value) || value.schemaVersion !== 1)
    .map(([name]) => name);

  return missing.length === 0
    ? {
        id: 'schema-version-present',
        status: 'pass',
        message: 'Workflow config schema versions are present.',
      }
    : {
        id: 'schema-version-present',
        status: 'warn',
        message: 'Some workflow config files are missing schemaVersion: 1.',
        details: { missing },
      };
};

const policySafeDefaultsCheck = (policy: AutomergePolicy | undefined): DoctorCheck => {
  if (!policy) {
    return {
      id: 'policy-safe-merge-defaults',
      status: 'warn',
      message: 'Policy is unavailable, so safe merge defaults could not be checked.',
    };
  }
  const unsafe = {
    enabled: policy.enabled !== false,
    allowNoRemoteChecksWhenLocalGatePasses: policy.allowNoRemoteChecksWhenLocalGatePasses !== false,
    deleteBranchAfterMerge: policy.deleteBranchAfterMerge !== false,
    removeCleanWorktreeAfterMerge: policy.removeCleanWorktreeAfterMerge !== false,
  };
  const unsafeFields = Object.entries(unsafe)
    .filter(([, value]) => value)
    .map(([field]) => field);
  return unsafeFields.length === 0
    ? {
        id: 'policy-safe-merge-defaults',
        status: 'pass',
        message: 'Policy keeps conservative merge defaults.',
      }
    : {
        id: 'policy-safe-merge-defaults',
        status: 'warn',
        message: 'Policy has merge automation fields that should be reviewed.',
        details: { unsafeFields },
      };
};

const commandSafetyCheck = (
  graph: PhaseGraph | undefined,
  policy: AutomergePolicy | undefined,
  autopilotConfig: AutopilotConfig | undefined,
): DoctorCheck => {
  const commands = [
    ...(graph?.globalValidationCommands ?? []),
    ...(policy?.requiredLocalCommands ?? []),
    ...(policy?.requiredPreflight ?? []),
    ...(autopilotConfig?.preflightCommands ?? []),
    ...Object.values(autopilotConfig?.agents ?? {})
      .filter((agent) => agent?.provider === 'shell')
      .map((agent) => agent.commandTemplate),
  ].filter((command): command is string => typeof command === 'string' && command.trim().length > 0);

  if (commands.length === 0) {
    return {
      id: 'command-safety',
      status: 'pass',
      message: 'No configured shell commands require safety review.',
    };
  }

  const reports = summarizeCommandSafety(commands).filter((report) => report.status !== 'safe');
  if (reports.some((report) => report.status === 'blocked')) {
    return {
      id: 'command-safety',
      status: 'fail',
      message: 'Configured commands include blocked destructive patterns.',
      details: { reports },
    };
  }
  if (reports.length > 0) {
    return {
      id: 'command-safety',
      status: 'warn',
      message: 'Configured commands include patterns that should be reviewed before supervised execution.',
      details: { reports },
    };
  }
  return {
    id: 'command-safety',
    status: 'pass',
    message: 'Configured commands do not match known unsafe patterns.',
  };
};

const githubRelevant = (policy: AutomergePolicy | undefined): boolean =>
  Boolean(
    policy?.enabled ||
      policy?.deleteBranchAfterMerge ||
      policy?.removeCleanWorktreeAfterMerge ||
      policy?.allowNoRemoteChecksWhenLocalGatePasses,
  );

export const runDoctor = async (
  repoRootInput: string,
  options: DoctorOptions = {},
): Promise<DoctorReport> => {
  const repoRoot = path.resolve(repoRootInput);
  const commandRunner = options.commandRunner ?? defaultCommandRunner;
  const checks: DoctorCheck[] = [];

  const repoRootExists = await directoryExists(repoRoot);
  checks.push(
    repoRootExists
      ? { id: 'repo-root-exists', status: 'pass', message: 'Repo root exists.', details: { path: repoRoot } }
      : { id: 'repo-root-exists', status: 'fail', message: 'Repo root does not exist.', details: { path: repoRoot } },
  );

  const gitStatus = repoRootExists
    ? await commandRunner('git', ['status', '--short', '--branch'], { cwd: repoRoot })
    : { exitCode: 1, stdout: '', stderr: 'Repo root does not exist.' };
  checks.push(
    gitStatus.exitCode === 0
      ? { id: 'git-repo-detected', status: 'pass', message: 'Git repository detected.' }
      : {
          id: 'git-repo-detected',
          status: 'warn',
          message: 'Git repository was not detected. Phase execution expects git to be initialized.',
          details: { stderr: gitStatus.stderr },
        },
  );
  checks.push(
    gitStatus.exitCode === 0
      ? {
          id: 'git-status-readable',
          status: 'pass',
          message: 'Git status is readable.',
          details: { output: gitStatus.stdout },
        }
      : {
          id: 'git-status-readable',
          status: 'warn',
          message: 'Git status is not readable.',
          details: { stderr: gitStatus.stderr },
        },
  );

  let paths: RunnerPaths = {
    graphPath: path.join(repoRoot, 'automation', 'phase-graph.json'),
    statePath: path.join(repoRoot, 'automation', 'phase-state.json'),
    policyPath: path.join(repoRoot, 'automation', 'policies', 'automerge-policy.json'),
    promptsDir: path.join(repoRoot, 'automation', 'prompts'),
  };
  let autopilotConfigPath = path.join(repoRoot, 'automation', 'autopilot-config.json');
  try {
    const loaded = await loadRunnerPaths(repoRoot);
    paths = loaded.paths;
    autopilotConfigPath = loaded.autopilotConfigPath;
  } catch (error) {
    checks.push({
      id: 'agentic-config-readable',
      status: 'warn',
      message: 'agentic.config.* could not be read; default workflow paths will be checked.',
      details: { error: error instanceof Error ? error.message : String(error) },
    });
  }

  checks.push(
    await checkFile(
      'agents-md-exists',
      path.join(repoRoot, 'AGENTS.md'),
      'AGENTS.md exists.',
      'AGENTS.md is missing.',
    ),
  );
  checks.push(
    await checkFile(
      'claude-md-exists',
      path.join(repoRoot, 'CLAUDE.md'),
      'CLAUDE.md exists.',
      'CLAUDE.md is missing.',
    ),
  );
  const progressMd = path.join(repoRoot, 'PROGRESS.md');
  const progressUpper = path.join(repoRoot, 'PROGRESS.MD');
  checks.push(
    (await fileExists(progressMd)) || (await fileExists(progressUpper))
      ? {
          id: 'progress-md-exists',
          status: 'pass',
          message: 'Progress file exists.',
          details: { preferredPath: progressMd, acceptedFallback: progressUpper },
        }
      : {
          id: 'progress-md-exists',
          status: 'fail',
          message: 'PROGRESS.md is missing.',
          details: { preferredPath: progressMd, acceptedFallback: progressUpper },
        },
  );

  checks.push(
    await checkDirectory(
      'concept-dir-exists',
      path.join(repoRoot, 'concept-and-ideas'),
      'concept-and-ideas/ exists.',
      'concept-and-ideas/ is missing.',
    ),
  );
  checks.push(
    await checkDirectory(
      'phase-plan-dir-exists',
      path.join(repoRoot, 'phase-plans'),
      'phase-plans/ exists.',
      'phase-plans/ is missing.',
    ),
  );
  checks.push(
    await checkFile(
      'phase-template-exists',
      path.join(repoRoot, 'phase-plans', 'PHASE-TEMPLATE.md'),
      'Phase template exists.',
      'phase-plans/PHASE-TEMPLATE.md is missing.',
    ),
  );
  checks.push(await checkFile('phase-graph-exists', paths.graphPath, 'Phase graph exists.', 'Phase graph is missing.'));
  checks.push(await checkFile('phase-state-exists', paths.statePath, 'Phase state exists.', 'Phase state is missing.'));
  checks.push(
    await checkFile(
      'automerge-policy-exists',
      paths.policyPath,
      'Automerge policy exists.',
      'Automerge policy is missing.',
    ),
  );
  checks.push(
    await checkFile(
      'autopilot-config-exists',
      autopilotConfigPath,
      'Autopilot config exists.',
      'Autopilot config is missing.',
    ),
  );
  checks.push(
    await checkDirectory(
      'prompts-dir-exists',
      paths.promptsDir,
      'Prompt templates directory exists.',
      'Prompt templates directory is missing.',
    ),
  );

  const graphRead = await readJson<PhaseGraph>(paths.graphPath);
  const stateRead = await readJson<PhaseState>(paths.statePath);
  const policyRead = await readJson<AutomergePolicy>(paths.policyPath);
  const autopilotRead = await readJson<AutopilotConfig>(autopilotConfigPath);

  const graph = graphRead.value;
  const state = stateRead.value;
  const policy = policyRead.value;
  const autopilotConfig = autopilotRead.value;
  const graphErrors = graph ? validatePhaseGraph(graph) : [];

  checks.push(
    graphRead.error
      ? {
          id: 'phase-graph-valid',
          status: 'fail',
          message: 'Phase graph could not be read as JSON.',
          details: { error: graphRead.error, path: paths.graphPath },
        }
      : graphErrors.length > 0
        ? {
            id: 'phase-graph-valid',
            status: 'fail',
            message: 'Phase graph is invalid.',
            details: { errors: graphErrors },
          }
        : { id: 'phase-graph-valid', status: 'pass', message: 'Phase graph is valid.' },
  );

  const ids = graphPhaseIds(graph);
  const stateIds = new Set(Object.keys(state?.phases ?? {}));
  const missingStateIds = [...ids].filter((phaseId) => !stateIds.has(phaseId));
  const extraStateIds = [...stateIds].filter((phaseId) => !ids.has(phaseId));
  checks.push(
    graphRead.error || stateRead.error
      ? {
          id: 'phase-state-matches-graph',
          status: 'fail',
          message: 'Phase state could not be checked because graph or state JSON is unreadable.',
          details: { graphError: graphRead.error, stateError: stateRead.error },
        }
      : missingStateIds.length > 0
        ? {
            id: 'phase-state-matches-graph',
            status: 'fail',
            message: 'Phase state is missing one or more graph phase IDs.',
            details: { missingStateIds, extraStateIds },
          }
        : extraStateIds.length > 0
          ? {
              id: 'phase-state-matches-graph',
              status: 'warn',
              message: 'Phase state has extra phase IDs not present in the graph.',
              details: { extraStateIds },
            }
          : { id: 'phase-state-matches-graph', status: 'pass', message: 'Phase state matches graph phase IDs.' },
  );

  checks.push(
    graphRead.error || stateRead.error
      ? {
          id: 'current-phase-exists',
          status: 'fail',
          message: 'Current phase could not be checked because graph or state JSON is unreadable.',
        }
      : state?.currentPhase && ids.has(state.currentPhase)
        ? { id: 'current-phase-exists', status: 'pass', message: 'Current phase exists in graph.' }
        : {
            id: 'current-phase-exists',
            status: 'fail',
            message: 'Current phase is missing from the graph.',
            details: { currentPhase: state?.currentPhase },
          },
  );

  checks.push(
    policyRead.error
      ? {
          id: 'policy-readable',
          status: 'fail',
          message: 'Automerge policy is not readable JSON.',
          details: { path: paths.policyPath, error: policyRead.error },
        }
      : { id: 'policy-readable', status: 'pass', message: 'Automerge policy is readable.' },
  );
  checks.push(
    autopilotRead.error
      ? {
          id: 'autopilot-config-readable',
          status: 'fail',
          message: 'Autopilot config is not readable JSON.',
          details: { path: autopilotConfigPath, error: autopilotRead.error },
        }
      : { id: 'autopilot-config-readable', status: 'pass', message: 'Autopilot config is readable.' },
  );

  const promptCandidates = {
    planner: ['planner.md', 'codex-planner.md'],
    executor: ['executor.md', 'codex-executor.md'],
    recheck: ['recheck.md'],
  };
  for (const [role, candidates] of Object.entries(promptCandidates)) {
    const found = await Promise.all(candidates.map((candidate) => exists(path.join(paths.promptsDir, candidate))));
    checks.push(
      found.some(Boolean)
        ? {
            id: `${role}-prompt-exists`,
            status: 'pass',
            message: `${role} prompt template exists.`,
            details: { candidates },
          }
        : {
            id: `${role}-prompt-exists`,
            status: 'fail',
            message: `${role} prompt template is missing.`,
            details: { candidates },
          },
    );
  }

  checks.push(
    Array.isArray(graph?.globalValidationCommands) && graph.globalValidationCommands.length > 0
      ? {
          id: 'global-validation-commands-present',
          status: 'pass',
          message: 'Global validation commands are configured.',
          details: { commands: graph.globalValidationCommands },
        }
      : {
          id: 'global-validation-commands-present',
          status: 'warn',
          message: 'No global validation commands are configured.',
        },
  );
  checks.push(
    Array.isArray(policy?.requiredLocalCommands) && policy.requiredLocalCommands.length > 0
      ? {
          id: 'required-local-commands-present',
          status: 'pass',
          message: 'Required local commands are configured.',
          details: { commands: policy.requiredLocalCommands },
        }
      : {
          id: 'required-local-commands-present',
          status: 'warn',
          message: 'No required local commands are configured in the automerge policy.',
        },
  );
  checks.push(
    Array.isArray(autopilotConfig?.preflightCommands) && autopilotConfig.preflightCommands.length > 0
      ? {
          id: 'preflight-commands-present',
          status: 'pass',
          message: 'Preflight commands are configured.',
          details: { commands: autopilotConfig.preflightCommands },
        }
      : {
          id: 'preflight-commands-present',
          status: 'warn',
          message: 'Preflight commands are missing and should be migrated to an explicit safe default.',
          details: { default: ['git status --short --branch'] },
        },
  );

  checks.push(schemaVersionCheck(graph, state, policy, autopilotConfig));
  checks.push(policySafeDefaultsCheck(policy));
  checks.push(commandTemplateChecks(autopilotConfig));
  checks.push(commandSafetyCheck(graph, policy, autopilotConfig));

  const migrations = await detectMigrations(repoRoot).catch(() => []);
  checks.push(
    migrations.length === 0
      ? {
          id: 'config-migrations-available',
          status: 'pass',
          message: 'No known schema or safe-default migrations are needed.',
        }
      : {
          id: 'config-migrations-available',
          status: 'warn',
          message: 'Fixable workflow config drift was detected.',
          details: { migrations },
        },
  );

  if (githubRelevant(policy)) {
    const gh = await commandRunner('gh', ['--version'], { cwd: repoRoot });
    checks.push(
      gh.exitCode === 0
        ? {
            id: 'gh-available',
            status: 'pass',
            message: 'GitHub CLI is available.',
            details: { output: gh.stdout.split('\n')[0] },
          }
        : {
            id: 'gh-available',
            status: 'warn',
            message: 'GitHub CLI is not available. PR automation should stay disabled.',
            details: { stderr: gh.stderr },
          },
    );
  } else {
    checks.push({
      id: 'gh-available',
      status: 'pass',
      message: 'GitHub CLI was not checked because GitHub automation is disabled.',
      details: { checked: false },
    });
  }

  const recommendedNextActions = [
    checks.some((check) => check.status === 'fail')
      ? 'Run agentic init --repo-root . if workflow files are missing.'
      : 'Run agentic status --repo-root . to inspect the current phase.',
    'Run agentic onboard --repo-root . --dry-run to inspect repo profile.',
    'Run agentic run --repo-root . --phase <PHASE_ID> --dry-run before enabling agents.',
  ];

  if (isRecord(autopilotConfig) && autopilotConfig.agents === undefined) {
    recommendedNextActions.push('Review automation/autopilot-config.json before enabling agent execution.');
  }
  if (migrations.length > 0) {
    recommendedNextActions.push('Run agentic migrate --repo-root . --dry-run to review safe config repairs.');
  }

  return {
    schemaVersion: 1,
    status: statusFromChecks(checks),
    repoRoot,
    checks,
    recommendedNextActions,
  };
};
