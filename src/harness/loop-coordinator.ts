import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { fileExists } from './artifact-write-policy.js';
import {
  evaluateAcceptanceGate,
  type CommandCheckId,
  type CommandCheckStatus,
} from './acceptance-gate.js';
import { getDeveloperTaskOutputPath } from './developer-workflow.js';
import { stringifyDeterministicJson } from './json.js';
import { getPatchProposalOutputPath } from './structured-patch-proposal.js';
import {
  getDefaultVersionRuns,
  getVersionPaths,
  summarizeVersion,
  validateVersionId,
  type VersionRunSpec,
  type VersionSummary,
} from './version-loop.js';

export const LOOP_COORDINATOR_SCHEMA_VERSION = '1' as const;
export const LOOP_COORDINATOR_CHECKPOINT_SCHEMA_VERSION = '1' as const;

export const LOOP_COORDINATOR_STEP_ORDER = [
  'run',
  'review',
  'proposal',
  'developer_task',
  'validation',
  'acceptance',
] as const;

export type LoopCoordinatorStepId = (typeof LOOP_COORDINATOR_STEP_ORDER)[number];

export type LoopStepStatus =
  | 'complete'
  | 'partial'
  | 'missing'
  | 'blocked'
  | 'not_run'
  | 'not_required';

export type LoopCoordinatorOutcome =
  | 'blocked'
  | 'partial'
  | 'ready_for_acceptance'
  | 'accepted'
  | 'rejected';

export interface LoopCoordinatorGovernance {
  human_governed: true;
  autonomous_code_edit: false;
  autonomous_merge: false;
  coordinator_executes_repo_gates: false;
}

export interface LoopCoordinatorStep {
  id: LoopCoordinatorStepId;
  name: string;
  status: LoopStepStatus;
  summary: string;
  evidence_paths: string[];
  blockers: string[];
  suggested_commands: string[];
  human_decision_required: boolean;
}

export interface LoopCoordinatorValidationPreview {
  machine_recommendation: 'pass' | 'fail' | 'blocked';
  blockers: string[];
  command_statuses_supplied: boolean;
}

export interface LoopCoordinatorAssessment {
  schema_version: typeof LOOP_COORDINATOR_CHECKPOINT_SCHEMA_VERSION;
  loop_id: string;
  runs_root: string;
  base_version: string;
  target_version: string;
  reviewer_driven: boolean;
  governance: LoopCoordinatorGovernance;
  outcome: LoopCoordinatorOutcome;
  steps: LoopCoordinatorStep[];
  blockers: string[];
  required_human_decisions: string[];
  next_commands: string[];
  artifact_preservation: {
    traces: boolean;
    reviews: boolean;
    scorecards: boolean;
    changelog: boolean;
    acceptance: boolean;
    note: string;
  };
  base_summary?: VersionSummary;
  target_summary?: VersionSummary;
  validation_preview?: LoopCoordinatorValidationPreview;
}

export interface LoopCoordinatorAssessOptions {
  runsRoot: string;
  baseVersion: string;
  targetVersion: string;
  reviewerDriven?: boolean;
  requireProposal?: boolean;
  requireDeveloperTask?: boolean;
  specs?: readonly VersionRunSpec[];
  commandStatuses?: Partial<Record<CommandCheckId, CommandCheckStatus>>;
  loopId?: string;
}

export interface LoopCoordinatorCheckpoint extends LoopCoordinatorAssessment {
  checkpoint_kind: 'loop_coordinator_decision';
  generated_at: string;
}

const GOVERNANCE: LoopCoordinatorGovernance = {
  human_governed: true,
  autonomous_code_edit: false,
  autonomous_merge: false,
  coordinator_executes_repo_gates: false,
};

const STEP_NAMES: Record<LoopCoordinatorStepId, string> = {
  run: 'Run playthrough evidence',
  review: 'Reviewer critique from traces',
  proposal: 'Structured patch proposal',
  developer_task: 'Developer task handoff',
  validation: 'Local validation gates',
  acceptance: 'Acceptance decision',
};

const PLACEHOLDER_MARKERS = [
  'status: pending',
  'record implemented changes',
  'planned changes should be written',
  'record implementation notes',
];

const isPlaceholderMarkdown = (contents: string): boolean => {
  const normalized = contents.trim().toLowerCase();
  if (normalized.length === 0) {
    return true;
  }
  return PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
};

const relativeRunsPath = (runsRoot: string, absolutePath: string): string =>
  path.relative(runsRoot, absolutePath).split(path.sep).join('/');

const versionDirExists = async (versionDir: string): Promise<boolean> => {
  try {
    const stats = await stat(versionDir);
    return stats.isDirectory();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

const loadSummaryIfPresent = async (
  runsRoot: string,
  version: string,
  specs: readonly VersionRunSpec[],
): Promise<VersionSummary | undefined> => {
  const paths = getVersionPaths(runsRoot, version);
  if (!(await versionDirExists(paths.versionDir))) {
    return undefined;
  }
  return summarizeVersion(runsRoot, version, specs);
};

const buildRunStep = (
  runsRoot: string,
  summary: VersionSummary | undefined,
  baseVersion: string,
): LoopCoordinatorStep => {
  const suggested = [
    `pnpm run run-version -- --version ${baseVersion} --runs-root ${runsRoot}`,
    `pnpm run summarize-version -- --version ${baseVersion} --runs-root ${runsRoot}`,
  ];
  if (!summary) {
    return {
      id: 'run',
      name: STEP_NAMES.run,
      status: 'missing',
      summary: `No run evidence found for ${baseVersion}.`,
      evidence_paths: [],
      blockers: [`Missing version directory runs/${baseVersion}. Run the default evidence matrix first.`],
      suggested_commands: suggested,
      human_decision_required: false,
    };
  }

  const missing = [
    ...summary.artifact_coverage.traces.missing,
    ...summary.artifact_coverage.scorecards.missing,
  ];
  if (missing.length > 0) {
    return {
      id: 'run',
      name: STEP_NAMES.run,
      status: 'partial',
      summary: `Run evidence for ${baseVersion} is incomplete (${missing.length} missing trace/scorecard artifacts).`,
      evidence_paths: summary.runs.map((run) => run.trace_path),
      blockers: missing.map((entry) => `Missing run artifact: ${entry}`),
      suggested_commands: suggested,
      human_decision_required: false,
    };
  }

  return {
    id: 'run',
    name: STEP_NAMES.run,
    status: 'complete',
    summary: `Run evidence for ${baseVersion} is complete (${summary.runs.length} runs).`,
    evidence_paths: summary.runs.map((run) => run.trace_path),
    blockers: [],
    suggested_commands: [],
    human_decision_required: false,
  };
};

const buildReviewStep = (
  runsRoot: string,
  summary: VersionSummary | undefined,
  baseVersion: string,
): LoopCoordinatorStep => {
  const suggested = [
    `pnpm run run-version -- --version ${baseVersion} --runs-root ${runsRoot}`,
  ];
  if (!summary) {
    return {
      id: 'review',
      name: STEP_NAMES.review,
      status: 'missing',
      summary: 'Reviews cannot exist without base run evidence.',
      evidence_paths: [],
      blockers: ['Base run evidence is missing; reviews are not available.'],
      suggested_commands: suggested,
      human_decision_required: false,
    };
  }

  const missing = summary.artifact_coverage.reviews.missing;
  if (missing.length > 0) {
    return {
      id: 'review',
      name: STEP_NAMES.review,
      status: 'partial',
      summary: `Review artifacts for ${baseVersion} are incomplete.`,
      evidence_paths: summary.runs
        .map((run) => run.review_path)
        .filter((entry): entry is string => typeof entry === 'string'),
      blockers: missing.map((entry) => `Missing review artifact: ${entry}`),
      suggested_commands: suggested,
      human_decision_required: false,
    };
  }

  return {
    id: 'review',
    name: STEP_NAMES.review,
    status: 'complete',
    summary: `Review artifacts for ${baseVersion} are present.`,
    evidence_paths: summary.runs
      .map((run) => run.review_path)
      .filter((entry): entry is string => typeof entry === 'string'),
    blockers: [],
    suggested_commands: [],
    human_decision_required: false,
  };
};

const buildProposalStep = async (
  options: LoopCoordinatorAssessOptions,
  baseSummary: VersionSummary | undefined,
): Promise<LoopCoordinatorStep> => {
  const { runsRoot, targetVersion, baseVersion } = options;
  const requireProposal = options.requireProposal ?? !options.reviewerDriven;
  const proposalPath = getPatchProposalOutputPath(runsRoot, targetVersion);
  const relativeProposal = relativeRunsPath(runsRoot, proposalPath);
  const targetPaths = getVersionPaths(runsRoot, targetVersion);
  const patchPlanRelative = relativeRunsPath(runsRoot, targetPaths.patchPlanPath);

  if (!requireProposal) {
    return {
      id: 'proposal',
      name: STEP_NAMES.proposal,
      status: 'not_required',
      summary: 'Structured patch proposal is optional for reviewer-driven handoffs.',
      evidence_paths: [patchPlanRelative],
      blockers: [],
      suggested_commands: [],
      human_decision_required: false,
    };
  }

  const firstReview = baseSummary?.runs.find((run) => run.review_path)?.review_path;
  const firstScorecard = baseSummary?.runs[0]?.scorecard_path;
  const suggested = firstReview && firstScorecard
    ? [
        `pnpm run patch-proposal -- --review ${firstReview} --scorecard ${firstScorecard} --base-version ${baseVersion} --target-version ${targetVersion} --scope "<bounded scope>" --allowed-path src/game --write --runs-root ${runsRoot}`,
      ]
    : [
        `pnpm run patch-proposal -- --review runs/${baseVersion}/reviews/<seed>_<persona>.json --scorecard runs/${baseVersion}/scorecards/<seed>_<persona>.json --base-version ${baseVersion} --target-version ${targetVersion} --scope "<bounded scope>" --allowed-path src/game --write --runs-root ${runsRoot}`,
      ];

  const proposalPresent = await fileExists(proposalPath);
  if (proposalPresent) {
    return {
      id: 'proposal',
      name: STEP_NAMES.proposal,
      status: 'complete',
      summary: `Structured patch proposal exists for ${targetVersion}.`,
      evidence_paths: [relativeProposal],
      blockers: [],
      suggested_commands: [],
      human_decision_required: true,
    };
  }

  const patchPlanPresent = await fileExists(targetPaths.patchPlanPath);
  const patchPlanContents = patchPlanPresent
    ? await readFile(targetPaths.patchPlanPath, 'utf8')
    : '';
  if (patchPlanPresent && !isPlaceholderMarkdown(patchPlanContents)) {
    return {
      id: 'proposal',
      name: STEP_NAMES.proposal,
      status: 'complete',
      summary: `Non-placeholder patch_plan.md exists for ${targetVersion}.`,
      evidence_paths: [patchPlanRelative],
      blockers: [],
      suggested_commands: [],
      human_decision_required: true,
    };
  }

  return {
    id: 'proposal',
    name: STEP_NAMES.proposal,
    status: 'missing',
    summary: `Missing structured patch proposal for ${targetVersion}.`,
    evidence_paths: [],
    blockers: [
      `Expected ${relativeProposal} or a non-placeholder ${patchPlanRelative} before developer implementation.`,
    ],
    suggested_commands: suggested,
    human_decision_required: true,
  };
};

const buildDeveloperTaskStep = async (
  options: LoopCoordinatorAssessOptions,
): Promise<LoopCoordinatorStep> => {
  const { runsRoot, targetVersion, baseVersion } = options;
  const requireDeveloperTask = options.requireDeveloperTask ?? true;
  const taskPath = getDeveloperTaskOutputPath(runsRoot, targetVersion);
  const relativeTask = relativeRunsPath(runsRoot, taskPath);

  if (!requireDeveloperTask) {
    return {
      id: 'developer_task',
      name: STEP_NAMES.developer_task,
      status: 'not_required',
      summary: 'Developer task artifact not required for this assessment.',
      evidence_paths: [],
      blockers: [],
      suggested_commands: [],
      human_decision_required: false,
    };
  }

  const suggested = [
    `pnpm run developer-task -- --runs-root ${runsRoot} --review runs/${baseVersion}/reviews/<seed>_<persona>.json --scorecard runs/${baseVersion}/scorecards/<seed>_<persona>.json --target-version ${targetVersion} --write`,
  ];

  if (!(await fileExists(taskPath))) {
    return {
      id: 'developer_task',
      name: STEP_NAMES.developer_task,
      status: 'missing',
      summary: `Missing developer_task.md for ${targetVersion}.`,
      evidence_paths: [],
      blockers: [`Expected ${relativeTask} before implementation or acceptance.`],
      suggested_commands: suggested,
      human_decision_required: true,
    };
  }

  const contents = await readFile(taskPath, 'utf8');
  if (isPlaceholderMarkdown(contents)) {
    return {
      id: 'developer_task',
      name: STEP_NAMES.developer_task,
      status: 'blocked',
      summary: `developer_task.md exists for ${targetVersion} but still contains placeholder content.`,
      evidence_paths: [relativeTask],
      blockers: [`Replace placeholder content in ${relativeTask}.`],
      suggested_commands: suggested,
      human_decision_required: true,
    };
  }

  return {
    id: 'developer_task',
    name: STEP_NAMES.developer_task,
    status: 'complete',
    summary: `Developer task handoff exists for ${targetVersion}.`,
    evidence_paths: [relativeTask],
    blockers: [],
    suggested_commands: [],
    human_decision_required: true,
  };
};

const commandStatusesSupplied = (
  commandStatuses?: Partial<Record<CommandCheckId, CommandCheckStatus>>,
): boolean =>
  Boolean(
    commandStatuses &&
      Object.keys(commandStatuses).length > 0 &&
      Object.values(commandStatuses).some((status) => status !== undefined),
  );

const buildValidationStep = async (
  options: LoopCoordinatorAssessOptions,
  targetSummary: VersionSummary | undefined,
): Promise<{ step: LoopCoordinatorStep; preview?: LoopCoordinatorValidationPreview }> => {
  const { runsRoot, targetVersion } = options;
  const suggested = [
    'pnpm run check',
    `pnpm run accept-version -- --version ${targetVersion} --runs-root ${runsRoot} --command-status typecheck:pass --command-status test:pass --command-status lint:pass --command-status build:pass`,
  ];

  if (!commandStatusesSupplied(options.commandStatuses)) {
    return {
      step: {
        id: 'validation',
        name: STEP_NAMES.validation,
        status: 'not_run',
        summary:
          'Validation gate results were not supplied; coordinator will not fabricate pass/fail statuses.',
        evidence_paths: [],
        blockers: [
          'Run local gates (pnpm run check) and pass explicit --command-status values to accept-version.',
        ],
        suggested_commands: suggested,
        human_decision_required: true,
      },
    };
  }

  if (!targetSummary) {
    return {
      step: {
        id: 'validation',
        name: STEP_NAMES.validation,
        status: 'blocked',
        summary: 'Cannot preview validation without target version evidence.',
        evidence_paths: [],
        blockers: [`Target version runs/${targetVersion} is missing.`],
        suggested_commands: suggested,
        human_decision_required: true,
      },
    };
  }

  const gate = await evaluateAcceptanceGate({
    runsRoot,
    version: targetVersion,
    commandStatuses: options.commandStatuses,
    reviewerDriven: options.reviewerDriven,
    specs: options.specs,
  });

  const preview: LoopCoordinatorValidationPreview = {
    machine_recommendation: gate.machine_recommendation,
    blockers: gate.blockers,
    command_statuses_supplied: true,
  };

  const status: LoopStepStatus =
    gate.machine_recommendation === 'pass'
      ? 'complete'
      : gate.machine_recommendation === 'blocked'
        ? 'blocked'
        : 'partial';

  return {
    step: {
      id: 'validation',
      name: STEP_NAMES.validation,
      status,
      summary:
        gate.machine_recommendation === 'pass'
          ? 'Supplied command statuses satisfy the acceptance gate preview.'
          : `Validation preview is ${gate.machine_recommendation} with ${gate.blockers.length} blocker(s).`,
      evidence_paths: [relativeRunsPath(runsRoot, gate.acceptancePath)],
      blockers: gate.blockers,
      suggested_commands:
        gate.machine_recommendation === 'pass'
          ? []
          : suggested,
      human_decision_required: true,
    },
    preview,
  };
};

const buildAcceptanceStep = async (
  options: LoopCoordinatorAssessOptions,
  targetSummary: VersionSummary | undefined,
): Promise<LoopCoordinatorStep> => {
  const { runsRoot, targetVersion } = options;
  const acceptancePath = getVersionPaths(runsRoot, targetVersion).acceptancePath;
  const relativeAcceptance = relativeRunsPath(runsRoot, acceptancePath);
  const suggested = [
    `pnpm run accept-version -- --version ${targetVersion} --runs-root ${runsRoot} --command-status typecheck:pass --command-status test:pass --command-status lint:pass --command-status build:pass${options.reviewerDriven ? ' --reviewer-driven' : ''}`,
  ];

  if (!targetSummary) {
    return {
      id: 'acceptance',
      name: STEP_NAMES.acceptance,
      status: 'missing',
      summary: 'Acceptance cannot be assessed without target version evidence.',
      evidence_paths: [],
      blockers: ['Target version evidence is missing.'],
      suggested_commands: suggested,
      human_decision_required: true,
    };
  }

  const status = targetSummary.acceptance_status;
  if (status === 'accepted') {
    return {
      id: 'acceptance',
      name: STEP_NAMES.acceptance,
      status: 'complete',
      summary: `Human acceptance recorded for ${targetVersion}.`,
      evidence_paths: [relativeAcceptance],
      blockers: [],
      suggested_commands: [],
      human_decision_required: false,
    };
  }

  if (status === 'rejected') {
    return {
      id: 'acceptance',
      name: STEP_NAMES.acceptance,
      status: 'blocked',
      summary: `Acceptance for ${targetVersion} is rejected.`,
      evidence_paths: [relativeAcceptance],
      blockers: [`Acceptance status for ${targetVersion} is rejected.`],
      suggested_commands: [],
      human_decision_required: true,
    };
  }

  if (status === 'blocked') {
    return {
      id: 'acceptance',
      name: STEP_NAMES.acceptance,
      status: 'blocked',
      summary: `Acceptance for ${targetVersion} is blocked pending human resolution.`,
      evidence_paths: [relativeAcceptance],
      blockers: [`Acceptance report marks ${targetVersion} as blocked.`],
      suggested_commands: suggested,
      human_decision_required: true,
    };
  }

  const acceptancePresent = await fileExists(acceptancePath);
  return {
    id: 'acceptance',
    name: STEP_NAMES.acceptance,
    status: acceptancePresent ? 'partial' : 'not_run',
    summary: acceptancePresent
      ? `Acceptance report exists for ${targetVersion}; human decision is still pending.`
      : `No acceptance report for ${targetVersion} yet.`,
    evidence_paths: acceptancePresent ? [relativeAcceptance] : [],
    blockers: [],
    suggested_commands: suggested,
    human_decision_required: true,
  };
};

const deriveOutcome = (
  steps: readonly LoopCoordinatorStep[],
  targetSummary: VersionSummary | undefined,
  validationPreview?: LoopCoordinatorValidationPreview,
): LoopCoordinatorOutcome => {
  if (targetSummary?.acceptance_status === 'accepted') {
    return 'accepted';
  }
  if (targetSummary?.acceptance_status === 'rejected') {
    return 'rejected';
  }

  const acceptanceStep = steps.find((step) => step.id === 'acceptance');
  if (acceptanceStep?.status === 'blocked') {
    return 'blocked';
  }

  const preAcceptanceSteps = steps.filter(
    (step) => step.id !== 'acceptance' && step.status !== 'not_required',
  );
  const hasBlocked = preAcceptanceSteps.some((step) => step.status === 'blocked');
  const hasMissing = preAcceptanceSteps.some((step) => step.status === 'missing');
  if (hasBlocked || hasMissing) {
    return 'blocked';
  }

  const preAcceptanceComplete = preAcceptanceSteps.every((step) => step.status === 'complete');
  const validationReady =
    validationPreview?.machine_recommendation === 'pass' &&
    validationPreview.command_statuses_supplied;

  if (preAcceptanceComplete && validationReady && targetSummary?.status === 'complete') {
    return 'ready_for_acceptance';
  }

  return 'partial';
};

const collectRequiredHumanDecisions = (
  steps: readonly LoopCoordinatorStep[],
  outcome: LoopCoordinatorOutcome,
): string[] => {
  const decisions = new Set<string>();
  for (const step of steps) {
    if (step.human_decision_required) {
      decisions.add(`Review ${step.name} outcome before advancing the loop.`);
    }
  }
  if (outcome === 'ready_for_acceptance') {
    decisions.add('Human owner must record explicit accepted/rejected decision in acceptance.md.');
  }
  if (outcome === 'partial') {
    decisions.add('Resolve partial loop steps before treating the iteration as complete.');
  }
  return [...decisions];
};

const collectNextCommands = (steps: readonly LoopCoordinatorStep[]): string[] => {
  const commands: string[] = [];
  for (const step of LOOP_COORDINATOR_STEP_ORDER) {
    const entry = steps.find((candidate) => candidate.id === step);
    if (!entry) {
      continue;
    }
    if (entry.status === 'complete' || entry.status === 'not_required') {
      continue;
    }
    for (const command of entry.suggested_commands) {
      if (!commands.includes(command)) {
        commands.push(command);
      }
    }
  }
  return commands;
};

export const buildLoopCoordinatorLoopId = (
  baseVersion: string,
  targetVersion: string,
): string => `${baseVersion}_to_${targetVersion}`;

export const assessLoopIteration = async (
  options: LoopCoordinatorAssessOptions,
): Promise<LoopCoordinatorAssessment> => {
  validateVersionId(options.baseVersion);
  validateVersionId(options.targetVersion);
  const specs = options.specs ?? getDefaultVersionRuns();
  const reviewerDriven = options.reviewerDriven ?? false;

  const baseSummary = await loadSummaryIfPresent(
    options.runsRoot,
    options.baseVersion,
    specs,
  );
  let targetSummary: VersionSummary | undefined;
  try {
    targetSummary = await loadSummaryIfPresent(
      options.runsRoot,
      options.targetVersion,
      specs,
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('does not exist')) {
      targetSummary = undefined;
    } else {
      throw error;
    }
  }

  const runStep = buildRunStep(options.runsRoot, baseSummary, options.baseVersion);
  const reviewStep = buildReviewStep(options.runsRoot, baseSummary, options.baseVersion);
  const proposalStep = await buildProposalStep(
    { ...options, reviewerDriven },
    baseSummary,
  );
  const developerTaskStep = await buildDeveloperTaskStep(options);
  const { step: validationStep, preview } = await buildValidationStep(
    options,
    targetSummary,
  );
  const acceptanceStep = await buildAcceptanceStep(options, targetSummary);

  const steps = [
    runStep,
    reviewStep,
    proposalStep,
    developerTaskStep,
    validationStep,
    acceptanceStep,
  ];

  const blockers = [
    ...new Set(steps.flatMap((step) => step.blockers)),
  ];
  const outcome = deriveOutcome(steps, targetSummary, preview);
  const required_human_decisions = collectRequiredHumanDecisions(steps, outcome);
  const next_commands = collectNextCommands(steps);

  return {
    schema_version: LOOP_COORDINATOR_CHECKPOINT_SCHEMA_VERSION,
    loop_id: options.loopId ?? buildLoopCoordinatorLoopId(options.baseVersion, options.targetVersion),
    runs_root: options.runsRoot,
    base_version: options.baseVersion,
    target_version: options.targetVersion,
    reviewer_driven: reviewerDriven,
    governance: GOVERNANCE,
    outcome,
    steps,
    blockers,
    required_human_decisions,
    next_commands,
    artifact_preservation: {
      traces: true,
      reviews: true,
      scorecards: true,
      changelog: true,
      acceptance: true,
      note:
        'Coordinator assessments are advisory. Existing trace, review, scorecard, changelog, and acceptance artifacts are never deleted or auto-overwritten.',
    },
    ...(baseSummary ? { base_summary: baseSummary } : {}),
    ...(targetSummary ? { target_summary: targetSummary } : {}),
    ...(preview ? { validation_preview: preview } : {}),
  };
};

export const buildLoopCoordinatorCheckpoint = (
  assessment: LoopCoordinatorAssessment,
  generatedAt = new Date().toISOString(),
): LoopCoordinatorCheckpoint => ({
  ...assessment,
  checkpoint_kind: 'loop_coordinator_decision',
  generated_at: generatedAt,
});

export const renderLoopCoordinatorRunbook = (
  assessment: LoopCoordinatorAssessment,
): string => {
  const stepLines = assessment.steps.map((step) => {
    const evidence =
      step.evidence_paths.length > 0
        ? ` Evidence: ${step.evidence_paths.join(', ')}.`
        : '';
    return `- **${step.name}** — ${step.status.toUpperCase()}: ${step.summary}${evidence}`;
  });

  const blockerLines =
    assessment.blockers.length > 0
      ? assessment.blockers.map((blocker) => `- ${blocker}`)
      : ['- _(none)_'];

  const decisionLines =
    assessment.required_human_decisions.length > 0
      ? assessment.required_human_decisions.map((entry) => `- ${entry}`)
      : ['- _(none)_'];

  const commandLines =
    assessment.next_commands.length > 0
      ? assessment.next_commands.map((entry) => `- \`${entry}\``)
      : ['- Loop steps are complete for the supplied evidence; run acceptance when ready.'];

  return [
    '# Loop Coordinator Runbook',
    '',
    `Loop \`${assessment.loop_id}\`: \`${assessment.base_version}\` → \`${assessment.target_version}\``,
    '',
    '## Outcome',
    '',
    `- Overall: **${assessment.outcome}**`,
    `- Runs root: \`${assessment.runs_root}\``,
    `- Reviewer-driven: ${assessment.reviewer_driven ? 'yes' : 'no'}`,
    '',
    '## Ordered steps',
    '',
    ...stepLines,
    '',
    '## Blockers',
    '',
    ...blockerLines,
    '',
    '## Required human decisions',
    '',
    ...decisionLines,
    '',
    '## Next commands (suggested, not executed)',
    '',
    ...commandLines,
    '',
    '## Governance',
    '',
    '- Human-governed loop; coordinator does not edit source, merge branches, or run gates automatically.',
    '- Agent and coordinator reports are advisory until the orchestrator verifies files and reruns local gates.',
    '- Credential-free default path uses deterministic baseline playthroughs via `run-version`.',
    '',
    '## Artifact preservation',
    '',
    assessment.artifact_preservation.note,
    '',
    '## Loop outcomes reference',
    '',
    '- **blocked** — missing evidence or explicit blockers stop the loop.',
    '- **partial** — some steps complete; more evidence or human decisions are required.',
    '- **ready_for_acceptance** — evidence and supplied validation statuses are ready for human acceptance.',
    '- **accepted** / **rejected** — recorded in `acceptance.md` for the target version.',
    '',
  ].join('\n');
};

export const getLoopCoordinatorCheckpointPath = (
  runsRoot: string,
  loopId: string,
): string => path.join(runsRoot, 'runs', 'loop-coordinator', `${loopId}.json`);

export const getLoopCoordinatorRunbookPath = (
  runsRoot: string,
  loopId: string,
): string => path.join(runsRoot, 'runs', 'loop-coordinator', `${loopId}.md`);

export const writeLoopCoordinatorArtifacts = async (
  assessment: LoopCoordinatorAssessment,
  options?: { generatedAt?: string },
): Promise<{ checkpointPath: string; runbookPath: string }> => {
  const checkpoint = buildLoopCoordinatorCheckpoint(assessment, options?.generatedAt);
  const checkpointPath = getLoopCoordinatorCheckpointPath(assessment.runs_root, assessment.loop_id);
  const runbookPath = getLoopCoordinatorRunbookPath(assessment.runs_root, assessment.loop_id);
  await mkdir(path.dirname(checkpointPath), { recursive: true });
  await writeFile(checkpointPath, `${stringifyDeterministicJson(checkpoint)}\n`, 'utf8');
  await writeFile(runbookPath, renderLoopCoordinatorRunbook(assessment), 'utf8');
  return { checkpointPath, runbookPath };
};
