import { access } from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_DEVELOPER_TEST_COMMANDS,
  GLOBAL_FORBIDDEN_CHANGES,
} from './developer-workflow.js';
import { PROTOCOL_INVARIANTS } from './structured-patch-proposal.js';
import type { StructuredPatchProposal } from './structured-patch-proposal.js';
import {
  branchNameForPhase,
  loadPhaseRunnerConfig,
  type PhaseDefinition,
  type PhaseGraph,
  worktreePathForPhase,
} from './phase-runner.js';

export const WORKTREE_TASK_BUNDLE_SCHEMA_VERSION = '1' as const;
export const WORKTREE_RESULT_SUMMARY_SCHEMA_VERSION = '1' as const;

export type WorktreeTaskBundleSchemaVersion = typeof WORKTREE_TASK_BUNDLE_SCHEMA_VERSION;
export type WorktreeResultSummarySchemaVersion = typeof WORKTREE_RESULT_SUMMARY_SCHEMA_VERSION;

export type WorktreeTaskKind = 'implementation' | 'read_only_audit';

export type WorktreeCheckStatus = 'pass' | 'fail' | 'blocked' | 'not_run';

export type WorktreeEvidenceKind =
  | 'trace'
  | 'review'
  | 'scorecard'
  | 'acceptance'
  | 'patch_proposal'
  | 'developer_task'
  | 'phase_plan';

export interface WorktreeEvidenceArtifact {
  kind: WorktreeEvidenceKind;
  path: string;
  version?: string;
  seed?: string;
  persona?: string;
  required: boolean;
}

export interface WorktreeTaskGovernance {
  human_governed: true;
  orchestrator_merges: false;
  autonomous_merge: false;
  autonomous_push: false;
  agent_report_advisory: true;
}

export interface WorktreeTaskScope {
  allowed_paths: string[];
  forbidden_paths: string[];
  forbidden_changes: string[];
  protocol_invariants: readonly string[];
}

export interface WorktreeTaskDelegate {
  agent: 'cursor';
  model: 'composer-2.5';
  mode: 'agent' | 'ask';
}

export interface WorktreeImplementationInstructions {
  summary: string;
  ownership: string;
  forbidden_actions: string[];
}

export interface WorktreeAuditInstructions {
  summary: string;
  ownership: string;
  review_targets: string[];
  forbidden_actions: Array<'edit' | 'install' | 'commit' | 'push' | 'merge' | 'write_artifacts'>;
}

export interface WorktreeTaskPhaseContext {
  id: string;
  plan_path: string;
  branch: string;
  worktree_path: string;
}

export interface WorktreeTaskBundleBase {
  schema_version: WorktreeTaskBundleSchemaVersion;
  bundle_id: string;
  task_kind: WorktreeTaskKind;
  phase: WorktreeTaskPhaseContext;
  governance: WorktreeTaskGovernance;
  scope: WorktreeTaskScope;
  evidence: {
    artifacts: WorktreeEvidenceArtifact[];
    runs_root: string;
    repo_root: string;
  };
  context_exclusions: string[];
  validation_commands: string[];
  delegate: WorktreeTaskDelegate;
  inputs: {
    target_version?: string;
    target_scope?: string;
    patch_proposal_path?: string;
    developer_task_path?: string;
  };
}

export interface WorktreeImplementationTaskBundle extends WorktreeTaskBundleBase {
  task_kind: 'implementation';
  delegate: WorktreeTaskDelegate & { mode: 'agent' };
  instructions: WorktreeImplementationInstructions;
}

export interface WorktreeAuditorTaskBundle extends WorktreeTaskBundleBase {
  task_kind: 'read_only_audit';
  delegate: WorktreeTaskDelegate & { mode: 'ask' };
  instructions: WorktreeAuditInstructions;
}

export type WorktreeTaskBundle = WorktreeImplementationTaskBundle | WorktreeAuditorTaskBundle;

export interface WorktreeCommandCheck {
  command: string;
  status: WorktreeCheckStatus;
  exit_code?: number;
  summary?: string;
}

export interface WorktreeDiffSummary {
  status: WorktreeCheckStatus;
  files_changed: string[];
  summary?: string;
}

export interface WorktreeResultSummary {
  schema_version: WorktreeResultSummarySchemaVersion;
  bundle_id: string;
  task_kind: WorktreeTaskKind;
  phase_id: string;
  branch: string;
  worktree_path: string;
  reported_at: string;
  governance: {
    verified_by_orchestrator: boolean;
    merge_authority: 'human_orchestrator';
    agent_report_advisory: true;
  };
  diff: WorktreeDiffSummary;
  checks: WorktreeCommandCheck[];
  blockers: string[];
  risks: string[];
  advisory_notes: string[];
  overall_status: 'pass' | 'fail' | 'blocked';
}

export type WorktreeTaskDiagnosticCategory =
  | 'blocker'
  | 'warning'
  | 'scope'
  | 'evidence'
  | 'forbidden';

export interface WorktreeTaskDiagnostic {
  category: WorktreeTaskDiagnosticCategory;
  message: string;
  field?: string;
  entry?: string;
}

export interface WorktreeTaskValidationResult {
  ok: boolean;
  diagnostics: WorktreeTaskDiagnostic[];
  blockers: WorktreeTaskDiagnostic[];
  warnings: WorktreeTaskDiagnostic[];
}

export class WorktreeTaskValidationError extends Error {
  readonly diagnostics: WorktreeTaskDiagnostic[];

  constructor(message: string, diagnostics: WorktreeTaskDiagnostic[] = []) {
    super(message);
    this.name = 'WorktreeTaskValidationError';
    this.diagnostics = diagnostics;
  }
}

export const DEFAULT_FORBIDDEN_CONTEXT_PATHS = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.env.test',
  '**/.env',
  '**/credentials.json',
  '**/secrets.json',
  '**/*.pem',
  '**/*.key',
] as const;

export const DEFAULT_CONTEXT_EXCLUSIONS = [
  'Do not include local .env files or credential material in delegated agent context.',
  'Do not send unrelated private files outside the repository worktree scope.',
  'Treat agent stdout reports as advisory until the orchestrator verifies files and command output.',
] as const;

export const DEFAULT_IMPLEMENTATION_FORBIDDEN_ACTIONS = [
  'merge branches or open/merge pull requests without orchestrator approval',
  'push to remote without orchestrator approval',
  'edit paths outside allowed_paths',
  'include .env or credential files in context or commits',
  'treat agent self-report as proof without orchestrator verification',
] as const;

export const DEFAULT_AUDIT_FORBIDDEN_ACTIONS: WorktreeAuditInstructions['forbidden_actions'] = [
  'edit',
  'install',
  'commit',
  'push',
  'merge',
  'write_artifacts',
];

const WORKTREE_CHECK_STATUSES = new Set<WorktreeCheckStatus>([
  'pass',
  'fail',
  'blocked',
  'not_run',
]);

const WORKTREE_EVIDENCE_KINDS = new Set<WorktreeEvidenceKind>([
  'trace',
  'review',
  'scorecard',
  'acceptance',
  'patch_proposal',
  'developer_task',
  'phase_plan',
]);

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const normalizeRepoRelativePath = (repoRoot: string, absoluteOrRelative: string): string => {
  const resolved = path.isAbsolute(absoluteOrRelative)
    ? absoluteOrRelative
    : path.resolve(repoRoot, absoluteOrRelative);
  return path.relative(repoRoot, resolved).split(path.sep).join('/');
};

export const buildBundleId = (phaseId: string, taskKind: WorktreeTaskKind): string =>
  `${phaseId.toLowerCase()}-${taskKind}`;

export const getWorktreeTaskBundleOutputPath = (
  runsRoot: string,
  phaseId: string,
  taskKind: WorktreeTaskKind,
): string =>
  path.join(
    runsRoot,
    'runs',
    'worktree-tasks',
    phaseId,
    taskKind === 'implementation' ? 'implementation_task.json' : 'auditor_task.json',
  );

export const getWorktreeResultSummaryOutputPath = (
  runsRoot: string,
  phaseId: string,
): string => path.join(runsRoot, 'runs', 'worktree-tasks', phaseId, 'result_summary.json');

const defaultForbiddenChanges = (): string[] => [...GLOBAL_FORBIDDEN_CHANGES];

const defaultValidationCommands = (commands?: string[]): string[] =>
  commands && commands.length > 0 ? [...commands] : [...DEFAULT_DEVELOPER_TEST_COMMANDS, 'pnpm run check'];

const buildScope = (
  allowedPaths: string[],
  options?: { forbiddenPaths?: string[]; forbiddenChanges?: string[] },
): WorktreeTaskScope => ({
  allowed_paths: allowedPaths,
  forbidden_paths: [...(options?.forbiddenPaths ?? DEFAULT_FORBIDDEN_CONTEXT_PATHS)],
  forbidden_changes: options?.forbiddenChanges ?? defaultForbiddenChanges(),
  protocol_invariants: PROTOCOL_INVARIANTS,
});

const buildGovernance = (): WorktreeTaskGovernance => ({
  human_governed: true,
  orchestrator_merges: false,
  autonomous_merge: false,
  autonomous_push: false,
  agent_report_advisory: true,
});

const buildPhaseArtifacts = (
  repoRoot: string,
  phase: PhaseDefinition,
  extraArtifacts: WorktreeEvidenceArtifact[] = [],
): WorktreeEvidenceArtifact[] => [
  {
    kind: 'phase_plan',
    path: phase.plan,
    required: true,
  },
  ...extraArtifacts,
];

export interface WorktreeTaskAssemblyInput {
  phase: PhaseDefinition;
  repoRoot: string;
  runsRoot: string;
  worktreePath?: string;
  branch?: string;
  bundleId?: string;
  validationCommands?: string[];
  forbiddenPaths?: string[];
  forbiddenChanges?: string[];
  evidenceArtifacts?: WorktreeEvidenceArtifact[];
  patchProposal?: StructuredPatchProposal;
  patchProposalPath?: string;
  targetVersion?: string;
  targetScope?: string;
  developerTaskPath?: string;
  graph?: PhaseGraph;
}

export const buildWorktreeImplementationTaskBundle = (
  input: WorktreeTaskAssemblyInput,
): WorktreeImplementationTaskBundle => {
  const repoRoot = path.resolve(input.repoRoot);
  const runsRoot = path.resolve(input.runsRoot);
  const branch = input.branch ?? branchNameForPhase(input.phase);
  const worktreePath = input.worktreePath ?? worktreePathForPhase(repoRoot, input.phase);
  const bundleId = input.bundleId ?? buildBundleId(input.phase.id, 'implementation');
  const patchProposal = input.patchProposal;
  const targetVersion = input.targetVersion ?? patchProposal?.target_version;
  const targetScope =
    input.targetScope ??
    patchProposal?.target_scope ??
    `Implement ${input.phase.id} within isolated worktree ${worktreePath}`;

  const evidenceArtifacts = buildPhaseArtifacts(repoRoot, input.phase, input.evidenceArtifacts ?? []);
  if (patchProposal) {
    for (const artifact of Object.values(patchProposal.evidence_artifacts)) {
      if (!artifact) {
        continue;
      }
      evidenceArtifacts.push({
        kind: artifact.kind,
        path: artifact.path,
        version: artifact.version,
        seed: artifact.seed,
        persona: artifact.persona,
        required: artifact.required,
      });
    }
    evidenceArtifacts.push({
      kind: 'patch_proposal',
      path:
        input.patchProposalPath ??
        `runs/${patchProposal.target_version}/patch_proposal.json`,
      version: patchProposal.target_version,
      required: true,
    });
  }

  return {
    schema_version: WORKTREE_TASK_BUNDLE_SCHEMA_VERSION,
    bundle_id: bundleId,
    task_kind: 'implementation',
    phase: {
      id: input.phase.id,
      plan_path: input.phase.plan,
      branch,
      worktree_path: worktreePath,
    },
    governance: buildGovernance(),
    scope: buildScope(input.phase.allowedPaths, {
      forbiddenPaths: input.forbiddenPaths,
      forbiddenChanges: input.forbiddenChanges,
    }),
    evidence: {
      artifacts: evidenceArtifacts,
      runs_root: runsRoot,
      repo_root: repoRoot,
    },
    context_exclusions: [...DEFAULT_CONTEXT_EXCLUSIONS],
    validation_commands: defaultValidationCommands(
      input.validationCommands ??
        patchProposal?.validation_commands ??
        input.graph?.globalValidationCommands,
    ),
    delegate: {
      agent: 'cursor',
      model: 'composer-2.5',
      mode: 'agent',
    },
    inputs: {
      target_version: targetVersion,
      target_scope: targetScope,
      patch_proposal_path: input.patchProposalPath,
      developer_task_path: input.developerTaskPath,
    },
    instructions: {
      summary: targetScope,
      ownership: `Implement only ${input.phase.id} scope inside ${worktreePath}.`,
      forbidden_actions: [...DEFAULT_IMPLEMENTATION_FORBIDDEN_ACTIONS],
    },
  };
};

export const buildWorktreeAuditorTaskBundle = (
  input: WorktreeTaskAssemblyInput & { reviewTargets?: string[] },
): WorktreeAuditorTaskBundle => {
  const repoRoot = path.resolve(input.repoRoot);
  const runsRoot = path.resolve(input.runsRoot);
  const branch = input.branch ?? branchNameForPhase(input.phase);
  const worktreePath = input.worktreePath ?? worktreePathForPhase(repoRoot, input.phase);
  const bundleId = input.bundleId ?? buildBundleId(input.phase.id, 'read_only_audit');

  return {
    schema_version: WORKTREE_TASK_BUNDLE_SCHEMA_VERSION,
    bundle_id: bundleId,
    task_kind: 'read_only_audit',
    phase: {
      id: input.phase.id,
      plan_path: input.phase.plan,
      branch,
      worktree_path: worktreePath,
    },
    governance: buildGovernance(),
    scope: buildScope(input.phase.allowedPaths, {
      forbiddenPaths: input.forbiddenPaths,
      forbiddenChanges: input.forbiddenChanges,
    }),
    evidence: {
      artifacts: buildPhaseArtifacts(repoRoot, input.phase, input.evidenceArtifacts ?? []),
      runs_root: runsRoot,
      repo_root: repoRoot,
    },
    context_exclusions: [...DEFAULT_CONTEXT_EXCLUSIONS],
    validation_commands: defaultValidationCommands(
      input.validationCommands ?? input.graph?.globalValidationCommands,
    ),
    delegate: {
      agent: 'cursor',
      model: 'composer-2.5',
      mode: 'ask',
    },
    inputs: {
      target_version: input.targetVersion,
      target_scope: input.targetScope,
      patch_proposal_path: input.patchProposalPath,
      developer_task_path: input.developerTaskPath,
    },
    instructions: {
      summary: `Read-only audit for ${input.phase.id} in ${worktreePath}.`,
      ownership: 'Audit only; do not modify repository files.',
      review_targets: input.reviewTargets ?? [
        input.phase.plan,
        'PROGRESS.MD',
        ...input.phase.allowedPaths,
      ],
      forbidden_actions: [...DEFAULT_AUDIT_FORBIDDEN_ACTIONS],
    },
  };
};

export const buildWorktreeTaskBundleFromPhase = async (
  repoRoot: string,
  phaseId: string,
  options: {
    taskKind?: WorktreeTaskKind;
    runsRoot?: string;
    patchProposalPath?: string;
    targetVersion?: string;
    targetScope?: string;
    developerTaskPath?: string;
    reviewTargets?: string[];
    bundleId?: string;
  } = {},
): Promise<WorktreeTaskBundle> => {
  const config = await loadPhaseRunnerConfig(repoRoot);
  const phase = config.graph.phases.find((entry) => entry.id === phaseId);
  if (!phase) {
    throw new Error(`Unknown phase: ${phaseId}`);
  }

  const assemblyInput: WorktreeTaskAssemblyInput = {
    phase,
    repoRoot,
    runsRoot: options.runsRoot ?? repoRoot,
    graph: config.graph,
    patchProposalPath: options.patchProposalPath,
    targetVersion: options.targetVersion,
    targetScope: options.targetScope,
    developerTaskPath: options.developerTaskPath,
    bundleId: options.bundleId,
  };

  if (options.patchProposalPath) {
    const { readFile } = await import('node:fs/promises');
    const proposalPath = path.isAbsolute(options.patchProposalPath)
      ? options.patchProposalPath
      : path.resolve(repoRoot, options.patchProposalPath);
    assemblyInput.patchProposal = JSON.parse(
      await readFile(proposalPath, 'utf8'),
    ) as StructuredPatchProposal;
    assemblyInput.patchProposalPath = normalizeRepoRelativePath(repoRoot, proposalPath);
  }

  const taskKind = options.taskKind ?? 'implementation';
  return taskKind === 'read_only_audit'
    ? buildWorktreeAuditorTaskBundle({ ...assemblyInput, reviewTargets: options.reviewTargets })
    : buildWorktreeImplementationTaskBundle(assemblyInput);
};

export const collectWorktreeTaskDiagnostics = async (
  bundle: WorktreeTaskBundle,
  options: { verifyEvidenceFiles?: boolean } = {},
): Promise<WorktreeTaskValidationResult> => {
  const diagnostics: WorktreeTaskDiagnostic[] = [];

  if (bundle.schema_version !== WORKTREE_TASK_BUNDLE_SCHEMA_VERSION) {
    diagnostics.push({
      category: 'blocker',
      field: 'schema_version',
      message: `Unsupported bundle schema version: ${String(bundle.schema_version)}`,
    });
  }

  if (!bundle.phase.id.trim()) {
    diagnostics.push({
      category: 'blocker',
      field: 'phase.id',
      message: 'Phase id is required.',
    });
  }

  if (!bundle.phase.plan_path.trim()) {
    diagnostics.push({
      category: 'blocker',
      field: 'phase.plan_path',
      message: 'Phase plan path is required.',
    });
  }

  if (bundle.scope.allowed_paths.length === 0) {
    diagnostics.push({
      category: 'blocker',
      field: 'scope.allowed_paths',
      message: 'At least one allowed path is required.',
    });
  }

  if (bundle.validation_commands.length === 0) {
    diagnostics.push({
      category: 'blocker',
      field: 'validation_commands',
      message: 'At least one validation command is required.',
    });
  }

  const requiredEvidence = bundle.evidence.artifacts.filter((artifact) => artifact.required);
  if (requiredEvidence.length === 0) {
    diagnostics.push({
      category: 'blocker',
      field: 'evidence.artifacts',
      message: 'At least one required evidence artifact is required.',
    });
  }

  for (const artifact of bundle.evidence.artifacts) {
    if (!WORKTREE_EVIDENCE_KINDS.has(artifact.kind)) {
      diagnostics.push({
        category: 'blocker',
        field: 'evidence.artifacts',
        entry: artifact.path,
        message: `Unsupported evidence kind: ${String(artifact.kind)}`,
      });
    }
    if (artifact.path.trim().length === 0) {
      diagnostics.push({
        category: 'blocker',
        field: 'evidence.artifacts',
        entry: artifact.kind,
        message: 'Evidence artifact path must be non-empty.',
      });
    }
  }

  const hasPhasePlan = bundle.evidence.artifacts.some(
    (artifact) => artifact.kind === 'phase_plan' && artifact.required,
  );
  if (!hasPhasePlan) {
    diagnostics.push({
      category: 'blocker',
      field: 'evidence.artifacts',
      message: 'Phase plan evidence is required.',
    });
  }

  if (bundle.task_kind === 'implementation' && !bundle.inputs.target_scope?.trim()) {
    diagnostics.push({
      category: 'blocker',
      field: 'inputs.target_scope',
      message: 'Implementation bundles require target_scope.',
    });
  }

  if (bundle.task_kind === 'read_only_audit') {
    const audit = bundle as WorktreeAuditorTaskBundle;
    if (audit.instructions.review_targets.length === 0) {
      diagnostics.push({
        category: 'blocker',
        field: 'instructions.review_targets',
        message: 'Auditor tasks require at least one review target.',
      });
    }
  }

  for (const allowedPath of bundle.scope.allowed_paths) {
    for (const forbiddenPath of bundle.scope.forbidden_paths) {
      if (allowedPath === forbiddenPath) {
        diagnostics.push({
          category: 'blocker',
          field: 'scope',
          entry: allowedPath,
          message: 'Allowed and forbidden paths must not overlap.',
        });
      }
    }
  }

  if (options.verifyEvidenceFiles) {
    const repoRoot = bundle.evidence.repo_root;
    for (const artifact of requiredEvidence) {
      const resolved = path.isAbsolute(artifact.path)
        ? artifact.path
        : path.resolve(repoRoot, artifact.path);
      if (!(await fileExists(resolved))) {
        diagnostics.push({
          category: 'blocker',
          field: 'evidence.artifacts',
          entry: artifact.path,
          message: `Required evidence file is missing: ${artifact.path}`,
        });
      }
    }
  }

  if (!bundle.governance.agent_report_advisory) {
    diagnostics.push({
      category: 'warning',
      field: 'governance.agent_report_advisory',
      message: 'Agent reports should remain advisory until orchestrator verification.',
    });
  }

  const blockers = diagnostics.filter((entry) => entry.category === 'blocker');
  const warnings = diagnostics.filter((entry) => entry.category === 'warning');
  return {
    ok: blockers.length === 0,
    diagnostics,
    blockers,
    warnings,
  };
};

export const validateWorktreeTaskBundle = async (
  bundle: WorktreeTaskBundle,
  options: { verifyEvidenceFiles?: boolean } = {},
): Promise<WorktreeTaskValidationResult> => {
  const result = await collectWorktreeTaskDiagnostics(bundle, options);
  if (!result.ok) {
    throw new WorktreeTaskValidationError(
      formatWorktreeTaskValidationMessage(result),
      result.diagnostics,
    );
  }
  return result;
};

export const formatWorktreeTaskValidationMessage = (
  result: WorktreeTaskValidationResult,
): string => {
  const lines = ['Worktree task validation:'];
  if (result.ok) {
    lines.push('  status: ok');
  } else {
    lines.push('  status: blocked');
  }
  for (const entry of result.diagnostics) {
    lines.push(`  [${entry.category}] ${entry.message}`);
  }
  return lines.join('\n');
};

export const collectWorktreeResultSummaryDiagnostics = (
  summary: WorktreeResultSummary,
): WorktreeTaskDiagnostic[] => {
  const diagnostics: WorktreeTaskDiagnostic[] = [];

  if (summary.schema_version !== WORKTREE_RESULT_SUMMARY_SCHEMA_VERSION) {
    diagnostics.push({
      category: 'blocker',
      field: 'schema_version',
      message: `Unsupported result summary schema version: ${String(summary.schema_version)}`,
    });
  }

  if (!WORKTREE_CHECK_STATUSES.has(summary.diff.status)) {
    diagnostics.push({
      category: 'blocker',
      field: 'diff.status',
      message: `Invalid diff status: ${String(summary.diff.status)}`,
    });
  }

  for (const check of summary.checks) {
    if (!WORKTREE_CHECK_STATUSES.has(check.status)) {
      diagnostics.push({
        category: 'blocker',
        field: 'checks',
        entry: check.command,
        message: `Invalid check status for ${check.command}: ${String(check.status)}`,
      });
    }
  }

  if (summary.checks.length === 0) {
    diagnostics.push({
      category: 'warning',
      field: 'checks',
      message: 'Result summary has no command checks recorded.',
    });
  }

  if (!summary.governance.agent_report_advisory) {
    diagnostics.push({
      category: 'blocker',
      field: 'governance.agent_report_advisory',
      message: 'Result summaries must keep agent_report_advisory true.',
    });
  }

  if (summary.overall_status === 'pass' && summary.blockers.length > 0) {
    diagnostics.push({
      category: 'blocker',
      field: 'overall_status',
      message: 'Overall pass cannot coexist with blockers.',
    });
  }

  const inferredStatus = inferOverallResultStatus(summary);
  if (summary.overall_status !== inferredStatus) {
    diagnostics.push({
      category: 'blocker',
      field: 'overall_status',
      message: `Overall status "${summary.overall_status}" does not match inferred status "${inferredStatus}".`,
    });
  }

  return diagnostics;
};

export const validateWorktreeResultSummary = (
  summary: WorktreeResultSummary,
): { ok: boolean; diagnostics: WorktreeTaskDiagnostic[] } => {
  const diagnostics = collectWorktreeResultSummaryDiagnostics(summary);
  const blockers = diagnostics.filter((entry) => entry.category === 'blocker');
  return { ok: blockers.length === 0, diagnostics };
};

export const inferOverallResultStatus = (
  summary: Pick<WorktreeResultSummary, 'diff' | 'checks' | 'blockers'>,
): WorktreeResultSummary['overall_status'] => {
  if (summary.blockers.length > 0) {
    return 'blocked';
  }
  if (summary.diff.status === 'fail' || summary.checks.some((check) => check.status === 'fail')) {
    return 'fail';
  }
  if (
    summary.diff.status === 'blocked' ||
    summary.diff.status === 'not_run' ||
    summary.checks.some((check) => check.status === 'not_run') ||
    summary.checks.some((check) => check.status === 'blocked')
  ) {
    return 'blocked';
  }
  return 'pass';
};

export const buildEmptyWorktreeResultSummary = (
  bundle: WorktreeTaskBundle,
): WorktreeResultSummary => ({
  schema_version: WORKTREE_RESULT_SUMMARY_SCHEMA_VERSION,
  bundle_id: bundle.bundle_id,
  task_kind: bundle.task_kind,
  phase_id: bundle.phase.id,
  branch: bundle.phase.branch,
  worktree_path: bundle.phase.worktree_path,
  reported_at: new Date(0).toISOString(),
  governance: {
    verified_by_orchestrator: false,
    merge_authority: 'human_orchestrator',
    agent_report_advisory: true,
  },
  diff: {
    status: 'not_run',
    files_changed: [],
    summary: 'Awaiting orchestrator-verified diff inspection.',
  },
  checks: bundle.validation_commands.map((command) => ({
    command,
    status: 'not_run',
  })),
  blockers: [],
  risks: [],
  advisory_notes: [
    'Agent output is advisory. Orchestrator must verify files, diffs, and rerun local gates.',
  ],
  overall_status: 'blocked',
});

export const normalizeWorktreeResultSummary = (
  summary: WorktreeResultSummary,
): WorktreeResultSummary => ({
  ...summary,
  overall_status: inferOverallResultStatus(summary),
});
