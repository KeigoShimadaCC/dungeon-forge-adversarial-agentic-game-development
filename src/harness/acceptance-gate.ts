import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  type ArtifactWriteOptions,
  writeArtifactFile,
} from './artifact-write-policy.js';
import { TERMINAL_STATUSES, type TerminalStatus } from '../game/types.js';
import { GLOBAL_FORBIDDEN_CHANGES } from './developer-workflow.js';
import {
  getDefaultVersionRuns,
  getVersionPaths,
  summarizeVersion,
  type VersionRunSpec,
  type VersionSummary,
} from './version-loop.js';

export const ACCEPTANCE_CHECK_STATUSES = [
  'pass',
  'fail',
  'warning',
  'skipped',
  'blocked',
] as const;

export type AcceptanceCheckStatus = (typeof ACCEPTANCE_CHECK_STATUSES)[number];

export const COMMAND_CHECK_IDS = ['typecheck', 'test', 'lint', 'build'] as const;

export type CommandCheckId = (typeof COMMAND_CHECK_IDS)[number];

export type CommandCheckStatus = AcceptanceCheckStatus;

export const FORBIDDEN_MVP_FEATURES = [
  'Real-time combat or timing-sensitive input.',
  'Image-only output or required non-text visuals for core gameplay.',
  'Required audio, voice, or generated media assets.',
  'Infinite floors or no-ending sandbox play.',
  'Arbitrary free-text gameplay commands.',
  'Arbitrary LLM-generated world/story changes during play.',
  'External API dependency during gameplay.',
  'Engine rewrites that break the stable game/harness protocol.',
] as const;

export interface AcceptanceCheck {
  id: string;
  name: string;
  status: AcceptanceCheckStatus;
  summary: string;
  details?: string[];
}

export interface AcceptanceGateInput {
  runsRoot: string;
  onExisting?: ArtifactWriteOptions['onExisting'];
  version: string;
  commandStatuses?: Partial<Record<CommandCheckId, CommandCheckStatus>>;
  reviewerDriven?: boolean;
  specs?: readonly VersionRunSpec[];
  generatedAt?: string;
}

export interface AcceptanceGateResult {
  version: string;
  versionDir: string;
  acceptancePath: string;
  generatedAt: string;
  machine_recommendation: 'pass' | 'fail' | 'blocked';
  human_decision: 'pending';
  checks: AcceptanceCheck[];
  blockers: string[];
  risks: string[];
  forbidden_mvp_checklist: readonly string[];
  global_forbidden_changes: readonly string[];
  summary: VersionSummary;
  counts: Record<AcceptanceCheckStatus, number>;
}

const VALID_TERMINAL_RESULTS = new Set<TerminalStatus>(
  TERMINAL_STATUSES.filter((status) => status !== 'ACTIVE'),
);

const PLACEHOLDER_MARKERS = [
  'status: pending',
  'record implemented changes',
  'planned changes should be written',
  'record implementation notes',
];

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

const isPlaceholderMarkdown = (contents: string): boolean => {
  const normalized = contents.trim().toLowerCase();
  if (normalized.length === 0) {
    return true;
  }
  return PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
};

const pushCheck = (
  checks: AcceptanceCheck[],
  check: AcceptanceCheck,
): void => {
  checks.push(check);
};

const commandCheck = (
  commandStatuses: Partial<Record<CommandCheckId, CommandCheckStatus>> | undefined,
  id: CommandCheckId,
  name: string,
): AcceptanceCheck => {
  const status = commandStatuses?.[id];
  if (!status) {
    if (id === 'typecheck' || id === 'test') {
      return {
        id: `command_${id}`,
        name,
        status: 'blocked',
        summary: `${name} evidence was not supplied; record pass/fail/blocked via --command-status ${id}:<status>.`,
      };
    }
    return {
      id: `command_${id}`,
      name,
      status: 'skipped',
      summary: `${name} was not supplied to the acceptance gate; record pass/fail/blocked via --command-status ${id}:<status>.`,
    };
  }
  return {
    id: `command_${id}`,
    name,
    status,
    summary:
      status === 'pass'
        ? `${name} reported pass.`
        : status === 'blocked'
          ? `${name} was blocked and could not run.`
          : status === 'skipped'
            ? `${name} was intentionally skipped.`
            : `${name} reported ${status}.`,
  };
};

const inferReviewerDriven = async (paths: ReturnType<typeof getVersionPaths>): Promise<boolean> => {
  const developerTaskPath = path.join(paths.versionDir, 'developer_task.md');
  if (await fileExists(developerTaskPath)) {
    return true;
  }
  if (await fileExists(paths.patchPlanPath)) {
    const patchPlan = await readFile(paths.patchPlanPath, 'utf8');
    if (!isPlaceholderMarkdown(patchPlan)) {
      return true;
    }
  }
  return false;
};

const buildArtifactChecks = (summary: VersionSummary): AcceptanceCheck[] => {
  const checks: AcceptanceCheck[] = [];
  const { traces, reviews, scorecards } = summary.artifact_coverage;

  pushCheck(checks, {
    id: 'traces_present',
    name: 'Trace coverage',
    status: traces.missing.length === 0 ? 'pass' : 'fail',
    summary:
      traces.missing.length === 0
        ? `All ${traces.expected} expected trace files are present.`
        : `Missing ${traces.missing.length} of ${traces.expected} expected trace files.`,
    ...(traces.missing.length > 0 ? { details: traces.missing } : {}),
  });

  pushCheck(checks, {
    id: 'reviews_present',
    name: 'Review coverage',
    status: reviews.missing.length === 0 ? 'pass' : 'fail',
    summary:
      reviews.missing.length === 0
        ? `All ${reviews.expected} expected review files are present.`
        : `Missing ${reviews.missing.length} of ${reviews.expected} expected review files.`,
    ...(reviews.missing.length > 0 ? { details: reviews.missing } : {}),
  });

  pushCheck(checks, {
    id: 'scorecards_present',
    name: 'Scorecard coverage',
    status: scorecards.missing.length === 0 ? 'pass' : 'fail',
    summary:
      scorecards.missing.length === 0
        ? `All ${scorecards.expected} expected scorecard files are present.`
        : `Missing ${scorecards.missing.length} of ${scorecards.expected} expected scorecard files.`,
    ...(scorecards.missing.length > 0 ? { details: scorecards.missing } : {}),
  });

  return checks;
};

const buildTerminalChecks = (summary: VersionSummary): { checks: AcceptanceCheck[]; risks: string[] } => {
  const checks: AcceptanceCheck[] = [];
  const risks: string[] = [];
  const invalidRuns = summary.runs.filter((run) => !VALID_TERMINAL_RESULTS.has(run.result));
  const activeRuns = summary.runs.filter((run) => run.result === 'ACTIVE');
  const abortedRuns = summary.runs.filter((run) => run.result === 'ABORTED');

  pushCheck(checks, {
    id: 'terminal_status_valid',
    name: 'Terminal outcomes',
    status: invalidRuns.length === 0 ? 'pass' : 'fail',
    summary:
      invalidRuns.length === 0
        ? 'All recorded runs reached WIN, LOSS, or ABORTED.'
        : `Found ${invalidRuns.length} run(s) without a terminal outcome.`,
    ...(invalidRuns.length > 0
      ? {
          details: invalidRuns.map(
            (run) => `${run.seed}/${run.persona}: result=${run.result}`,
          ),
        }
      : {}),
  });

  if (activeRuns.length > 0) {
    risks.push(
      `${activeRuns.length} run(s) ended in ACTIVE; verify playthrough termination and harness policy behavior.`,
    );
  }
  if (abortedRuns.length > 0) {
    risks.push(
      `${abortedRuns.length} run(s) ended in ABORTED; inspect traces for invalid actions, softlocks, or protocol failures.`,
    );
  }

  const unstableRuns = summary.runs.filter(
    (run) => run.metrics.invalid_actions > 0 || run.metrics.softlocks > 0,
  );
  if (unstableRuns.length > 0) {
    pushCheck(checks, {
      id: 'protocol_stability',
      name: 'Protocol stability metrics',
      status: 'warning',
      summary: `${unstableRuns.length} run(s) recorded invalid actions or softlocks.`,
      details: unstableRuns.map(
        (run) =>
          `${run.seed}/${run.persona}: invalid_actions=${run.metrics.invalid_actions}, softlocks=${run.metrics.softlocks}`,
      ),
    });
  } else if (summary.runs.length > 0) {
    pushCheck(checks, {
      id: 'protocol_stability',
      name: 'Protocol stability metrics',
      status: 'pass',
      summary: 'No invalid actions or softlocks recorded across scorecards.',
    });
  }

  return { checks, risks };
};

const buildMarkdownEvidenceChecks = async (
  paths: ReturnType<typeof getVersionPaths>,
  reviewerDriven: boolean,
): Promise<{ checks: AcceptanceCheck[]; blockers: string[] }> => {
  const checks: AcceptanceCheck[] = [];
  const blockers: string[] = [];

  const changelogPresent = await fileExists(paths.changelogPath);
  const changelogContents = changelogPresent ? await readFile(paths.changelogPath, 'utf8') : '';
  const changelogPlaceholder = !changelogPresent || isPlaceholderMarkdown(changelogContents);

  pushCheck(checks, {
    id: 'changelog_present',
    name: 'Changelog evidence',
    status: changelogPresent && !changelogPlaceholder ? 'pass' : changelogPresent ? 'fail' : 'fail',
    summary: changelogPresent
      ? changelogPlaceholder
        ? 'changelog.md exists but still contains placeholder content.'
        : 'changelog.md exists with non-placeholder content.'
      : 'changelog.md is missing.',
  });
  if (!changelogPresent || changelogPlaceholder) {
    blockers.push('Provide a non-placeholder changelog.md explaining what changed in this version.');
  }

  const developerNotesPresent = await fileExists(paths.developerNotesPath);
  const developerNotesContents = developerNotesPresent
    ? await readFile(paths.developerNotesPath, 'utf8')
    : '';
  const developerNotesPlaceholder =
    !developerNotesPresent || isPlaceholderMarkdown(developerNotesContents);

  pushCheck(checks, {
    id: 'developer_notes_present',
    name: 'Developer notes evidence',
    status: developerNotesPresent && !developerNotesPlaceholder ? 'pass' : 'fail',
    summary: developerNotesPresent
      ? developerNotesPlaceholder
        ? 'developer_notes.md exists but still contains placeholder content.'
        : 'developer_notes.md exists with non-placeholder implementation notes.'
      : 'developer_notes.md is missing.',
  });
  if (!developerNotesPresent || developerNotesPlaceholder) {
    blockers.push(
      'Provide non-placeholder developer_notes.md with implementation notes, risks, and follow-ups.',
    );
  }

  const patchPlanPresent = await fileExists(paths.patchPlanPath);
  const patchPlanContents = patchPlanPresent ? await readFile(paths.patchPlanPath, 'utf8') : '';
  const patchPlanPlaceholder = !patchPlanPresent || isPlaceholderMarkdown(patchPlanContents);
  const developerTaskPresent = await fileExists(path.join(paths.versionDir, 'developer_task.md'));

  if (reviewerDriven) {
    const handoffReady = (!patchPlanPlaceholder && patchPlanPresent) || developerTaskPresent;
    pushCheck(checks, {
      id: 'reviewer_handoff',
      name: 'Reviewer-driven handoff',
      status: handoffReady ? 'pass' : 'blocked',
      summary: handoffReady
        ? developerTaskPresent
          ? 'developer_task.md is present for reviewer-driven work.'
          : 'patch_plan.md is present with non-placeholder content.'
        : 'Reviewer-driven version is missing patch_plan.md and developer_task.md evidence.',
    });
    if (!handoffReady) {
      blockers.push(
        'Add patch_plan.md with scoped planned changes or keep developer_task.md from the reviewer handoff.',
      );
    }
  } else {
    pushCheck(checks, {
      id: 'reviewer_handoff',
      name: 'Reviewer-driven handoff',
      status: 'skipped',
      summary: 'Version was not classified as reviewer-driven; patch plan/developer task not required.',
    });
  }

  return { checks, blockers };
};

const buildForbiddenChecklist = (): AcceptanceCheck => ({
  id: 'forbidden_mvp_checklist',
  name: 'Forbidden MVP feature checklist',
  status: 'warning',
  summary:
    'Manual verification required: confirm no forbidden MVP feature was introduced in this version.',
  details: [...FORBIDDEN_MVP_FEATURES],
});

const buildGlobalInvariantChecklist = (): AcceptanceCheck => ({
  id: 'global_forbidden_changes',
  name: 'Global forbidden change checklist',
  status: 'warning',
  summary:
    'Manual verification required: confirm developer work respected harness/global forbidden changes.',
  details: [...GLOBAL_FORBIDDEN_CHANGES],
});

const countStatuses = (checks: readonly AcceptanceCheck[]): Record<AcceptanceCheckStatus, number> => {
  const counts = Object.fromEntries(
    ACCEPTANCE_CHECK_STATUSES.map((status) => [status, 0]),
  ) as Record<AcceptanceCheckStatus, number>;
  for (const check of checks) {
    counts[check.status] += 1;
  }
  return counts;
};

const deriveMachineRecommendation = (
  checks: readonly AcceptanceCheck[],
): AcceptanceGateResult['machine_recommendation'] => {
  if (checks.some((check) => check.status === 'blocked')) {
    return 'blocked';
  }
  if (checks.some((check) => check.status === 'fail')) {
    return 'fail';
  }
  return 'pass';
};

const collectBlockers = (checks: readonly AcceptanceCheck[], extra: readonly string[]): string[] => {
  const blockers = [...extra];
  for (const check of checks) {
    if (check.status === 'fail' || check.status === 'blocked') {
      blockers.push(`${check.name}: ${check.summary}`);
    }
  }
  return [...new Set(blockers)];
};

export const evaluateAcceptanceGate = async (
  input: AcceptanceGateInput,
): Promise<AcceptanceGateResult> => {
  const specs = input.specs ?? getDefaultVersionRuns();
  const paths = getVersionPaths(input.runsRoot, input.version);
  const summary = await summarizeVersion(input.runsRoot, input.version, specs);
  const reviewerDriven =
    input.reviewerDriven ?? (await inferReviewerDriven(paths));

  const checks: AcceptanceCheck[] = [];
  const risks: string[] = [];

  for (const commandId of COMMAND_CHECK_IDS) {
    const label =
      commandId === 'typecheck'
        ? 'Typecheck'
        : commandId === 'test'
          ? 'Tests'
          : commandId === 'lint'
            ? 'Lint'
            : 'Build';
    pushCheck(checks, commandCheck(input.commandStatuses, commandId, label));
  }

  checks.push(...buildArtifactChecks(summary));
  const terminal = buildTerminalChecks(summary);
  checks.push(...terminal.checks);
  risks.push(...terminal.risks);

  const markdownEvidence = await buildMarkdownEvidenceChecks(paths, reviewerDriven);
  checks.push(...markdownEvidence.checks);

  if (summary.status !== 'complete') {
    pushCheck(checks, {
      id: 'evidence_matrix_complete',
      name: 'Default evidence matrix',
      status: 'fail',
      summary: 'Version evidence coverage is partial; run the default seed/persona matrix before acceptance.',
    });
  } else {
    pushCheck(checks, {
      id: 'evidence_matrix_complete',
      name: 'Default evidence matrix',
      status: 'pass',
      summary: 'Default trace/review/scorecard matrix is complete.',
    });
  }

  checks.push(buildForbiddenChecklist());
  checks.push(buildGlobalInvariantChecklist());

  const blockers = collectBlockers(checks, markdownEvidence.blockers);
  const machine_recommendation = deriveMachineRecommendation(checks);

  if (machine_recommendation === 'pass') {
    risks.push(
      'Machine checks passed, but final acceptance still requires explicit human owner approval.',
    );
  }

  return {
    version: input.version,
    versionDir: paths.versionDir,
    acceptancePath: paths.acceptancePath,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    machine_recommendation,
    human_decision: 'pending',
    checks,
    blockers,
    risks: [...new Set(risks)],
    forbidden_mvp_checklist: FORBIDDEN_MVP_FEATURES,
    global_forbidden_changes: GLOBAL_FORBIDDEN_CHANGES,
    summary,
    counts: countStatuses(checks),
  };
};

const readExistingGeneratedAt = async (acceptancePath: string): Promise<string | undefined> => {
  try {
    const contents = await readFile(acceptancePath, 'utf8');
    const match = /^Generated:\s*(.+)$/m.exec(contents);
    return match?.[1]?.trim();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

const statusLabel = (status: AcceptanceCheckStatus): string => status.toUpperCase();

const renderChecksTable = (checks: readonly AcceptanceCheck[]): string => {
  const header = '| Check | Status | Summary |\n| --- | --- | --- |';
  const rows = checks.map(
    (check) => `| ${check.name} | ${statusLabel(check.status)} | ${check.summary.replace(/\|/g, '\\|')} |`,
  );
  return [header, ...rows].join('\n');
};

const bulletSection = (title: string, items: readonly string[]): string => {
  if (items.length === 0) {
    return `## ${title}\n\n- _(none)_\n`;
  }
  return `## ${title}\n\n${items.map((item) => `- ${item}`).join('\n')}\n`;
};

export const renderAcceptanceMarkdown = (result: AcceptanceGateResult): string => {
  const checkDetails = result.checks
    .filter((check) =>
      check.details &&
      check.details.length > 0 &&
      check.id !== 'forbidden_mvp_checklist' &&
      check.id !== 'global_forbidden_changes',
    )
    .map(
      (check) =>
        `### ${check.name}\n\n${(check.details ?? []).map((line) => `- ${line}`).join('\n')}`,
    )
    .join('\n\n');

  return [
    '# Acceptance Report',
    '',
    `Version: ${result.version}`,
    `Generated: ${result.generatedAt}`,
    '',
    '## Machine recommendation',
    '',
    `Status: ${result.machine_recommendation}`,
    '',
    `Checks: ${result.counts.pass} pass, ${result.counts.fail} fail, ${result.counts.warning} warning, ${result.counts.skipped} skipped, ${result.counts.blocked} blocked.`,
    '',
    'Passing machine checks do **not** auto-accept this version. The human owner remains the final governor.',
    '',
    '## Human decision',
    '',
    'Status: pending',
    '',
    'Owner: _(human owner)_',
    'Decision: _(accepted / rejected / blocked)_',
    'Notes:',
    '',
    bulletSection('Blockers', result.blockers).trimEnd(),
    '',
    bulletSection('Risks', result.risks).trimEnd(),
    '',
    '## Checks',
    '',
    renderChecksTable(result.checks),
    '',
    ...(checkDetails.length > 0 ? ['## Check details', '', checkDetails, ''] : []),
    '## Forbidden MVP feature checklist',
    '',
    'Manual verification required before final acceptance:',
    '',
    ...result.forbidden_mvp_checklist.map((item) => `- ${item}`),
    '',
    '## Global forbidden changes',
    '',
    ...result.global_forbidden_changes.map((item) => `- ${item}`),
    '',
    '## Evidence links',
    '',
    `- Version directory: \`${result.versionDir}\``,
    `- Acceptance report: \`${result.acceptancePath}\``,
    `- Patch plan: \`${result.summary.links.patch_plan}\``,
    `- Changelog: \`${result.summary.links.changelog}\``,
    `- Developer notes: \`${result.summary.links.developer_notes}\``,
    `- Summary status: ${result.summary.status}`,
    `- Challenge mode: ${result.summary.challenge_mode ?? 'default'}`,
    `- Scenario pack: ${result.summary.scenario_pack ?? 'default'}${
      result.summary.scenario_pack_label ? ` (${result.summary.scenario_pack_label})` : ''
    }`,
    `- Artifact coverage: ${result.summary.artifact_coverage.traces.present}/${result.summary.artifact_coverage.traces.expected} traces, ${result.summary.artifact_coverage.reviews.present}/${result.summary.artifact_coverage.reviews.expected} reviews, ${result.summary.artifact_coverage.scorecards.present}/${result.summary.artifact_coverage.scorecards.expected} scorecards`,
    '',
  ].join('\n');
};

export const writeAcceptanceReport = async (
  input: AcceptanceGateInput,
): Promise<AcceptanceGateResult> => {
  const paths = getVersionPaths(input.runsRoot, input.version);
  const generatedAt =
    input.generatedAt ?? (await readExistingGeneratedAt(paths.acceptancePath));
  const result = await evaluateAcceptanceGate({
    ...input,
    ...(generatedAt ? { generatedAt } : {}),
  });
  await writeArtifactFile(
    result.acceptancePath,
    renderAcceptanceMarkdown(result),
    { onExisting: input.onExisting },
    {
      runsRoot: input.runsRoot,
      artifactLabel: path.join('runs', result.version, 'acceptance.md'),
    },
  );
  return result;
};

export const parseCommandStatusArg = (value: string): { id: CommandCheckId; status: CommandCheckStatus } => {
  const match = /^([a-z]+):(pass|fail|warning|skipped|blocked)$/i.exec(value.trim());
  if (!match) {
    throw new Error(
      `Invalid --command-status "${value}". Expected format <command>:<status>, e.g. typecheck:pass.`,
    );
  }
  const id = match[1]!.toLowerCase() as CommandCheckId;
  if (!COMMAND_CHECK_IDS.includes(id)) {
    throw new Error(
      `Unknown command "${id}" in --command-status. Expected one of: ${COMMAND_CHECK_IDS.join(', ')}.`,
    );
  }
  const status = match[2]!.toLowerCase() as CommandCheckStatus;
  if (!ACCEPTANCE_CHECK_STATUSES.includes(status)) {
    throw new Error(`Unknown status "${status}" in --command-status.`);
  }
  return { id, status };
};
