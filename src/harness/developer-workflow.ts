import path from 'node:path';

import type { PlaythroughReview } from './reviewer-client.js';
import {
  isScorecardStructurallyUsable,
  isReviewerPersona,
} from './reviewer-client.js';
import type { PlaythroughScorecard } from './types.js';
import { getVersionPaths, validateVersionId } from './version-loop.js';

export const GLOBAL_FORBIDDEN_CHANGES = [
  'Change or bypass the stable GameEngine interface (start, getAvailableActions, step, render, isTerminal).',
  'Remove seed determinism or non-reproducible RNG during gameplay.',
  'Remove or bypass explicit terminal states (ACTIVE, WIN, LOSS, ABORTED).',
  'Add infinite floors, sandbox main modes without terminal outcomes, or unbounded play.',
  'Add real-time input, timing-based combat, or non-turn-based play.',
  'Require images, audio, or other non-text media for core gameplay.',
  'Replace structured available actions with arbitrary free-text player commands.',
  'Call external APIs during gameplay or mutate game state directly from reviewer output.',
  'Let reviewer or developer self-report replace harness validation and trace evidence.',
] as const;

export const DEFAULT_DEVELOPER_TEST_COMMANDS = [
  'pnpm test',
  'pnpm run typecheck',
  'pnpm run lint',
  'pnpm run build',
  'git diff --check',
] as const;

const PROTOCOL_BREAKING_PATTERNS: ReadonlyArray<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\bgame\s*engine\b|\bchange\s+.*\binterface\b|\bbypass\b.*\b(engine|interface)\b/i,
    message: 'Must not change or bypass the GameEngine interface.',
  },
  {
    pattern: /\bremove\b.*\b(seed|determinism|deterministic)\b|\bnon-?deterministic\b/i,
    message: 'Must not remove seed determinism.',
  },
  {
    pattern: /\bremove\b.*\bterminal\b|\bno\s+terminal\b/i,
    message: 'Must not remove explicit terminal states.',
  },
  {
    pattern: /\binfinite\b.*\bfloor\b|\bunbounded\b.*\bplay\b|\bsandbox\b.*\bmain\b/i,
    message: 'Must not add infinite floors or unbounded main play.',
  },
  {
    pattern: /\breal-?time\b|\btiming-?based\b|\bnon-?turn-?based\b/i,
    message: 'Must not add real-time or non-turn-based play.',
  },
  {
    pattern: /\bfree-?text\b.*\b(action|command|input)\b/i,
    message: 'Must not replace structured actions with free-text commands.',
  },
];

export interface DeveloperTaskInput {
  review: PlaythroughReview;
  scorecard: PlaythroughScorecard;
  previousReviewPath: string;
  previousScorecardPath: string;
  targetVersion: string;
  targetScope: string;
  allowedChanges: string[];
  proposedChanges: string[];
  forbiddenChanges?: string[];
  expectedImplementationSummary?: string;
  requiredTestCommands?: string[];
  runsRoot?: string;
}

export interface DeveloperTask {
  previous_review_path: string;
  previous_scorecard_path: string;
  target_version: string;
  target_scope: string;
  allowed_changes: string[];
  forbidden_changes: string[];
  proposed_changes: string[];
  required_test_commands: string[];
  required_patch_plan_path: string;
  required_changelog_path: string;
  expected_implementation_summary: string;
  governance: {
    human_governed: true;
    autonomous_patch_execution: false;
  };
  evidence: {
    review_version: string;
    review_seed: string;
    review_persona: string;
    review_summary: string;
    review_issues: Array<{
      severity: PlaythroughReview['top_issues'][number]['severity'];
      observation: string;
      diagnosis: string;
      recommendation: string;
      evidence: PlaythroughReview['top_issues'][number]['evidence'];
    }>;
    suggested_next_changes: string[];
    top_issue_count: number;
    scorecard_result: PlaythroughScorecard['result'];
    scorecard_turns: number;
    reviewer_scores: PlaythroughReview['scores'];
  };
}

export type DeveloperTaskDiagnosticCategory =
  | 'blocker'
  | 'warning'
  | 'allowed'
  | 'proposed'
  | 'forbidden';

export interface DeveloperTaskDiagnostic {
  category: DeveloperTaskDiagnosticCategory;
  message: string;
  field?: string;
  entry?: string;
}

export interface DeveloperTaskValidationResult {
  ok: boolean;
  diagnostics: DeveloperTaskDiagnostic[];
  blockers: DeveloperTaskDiagnostic[];
  warnings: DeveloperTaskDiagnostic[];
}

export class DeveloperTaskValidationError extends Error {
  readonly diagnostics: DeveloperTaskDiagnostic[];

  constructor(message: string, diagnostics: DeveloperTaskDiagnostic[] = []) {
    super(message);
    this.name = 'DeveloperTaskValidationError';
    this.diagnostics = diagnostics;
  }
}

const isReviewStructurallyUsable = (review: PlaythroughReview): boolean =>
  typeof review.version === 'string' &&
  review.version.length > 0 &&
  typeof review.seed === 'string' &&
  review.seed.length > 0 &&
  typeof review.persona === 'string' &&
  isReviewerPersona(review.persona) &&
  typeof review.summary === 'string' &&
  review.summary.trim().length > 0 &&
  Array.isArray(review.top_issues) &&
  Array.isArray(review.suggested_next_changes) &&
  typeof review.scores === 'object' &&
  review.scores !== null;

const collectProtocolBreakingDiagnostics = (
  entries: string[],
  field: 'allowedChanges' | 'proposedChanges',
): DeveloperTaskDiagnostic[] => {
  const diagnostics: DeveloperTaskDiagnostic[] = [];
  for (const entry of entries) {
    for (const rule of PROTOCOL_BREAKING_PATTERNS) {
      if (rule.pattern.test(entry)) {
        diagnostics.push({
          category: 'blocker',
          field,
          entry,
          message: `${field} contains protocol-breaking text: ${rule.message}`,
        });
      }
    }
  }
  return diagnostics;
};

const matchesForbiddenPattern = (entry: string): string | undefined => {
  const lowered = entry.toLowerCase();
  for (const forbidden of GLOBAL_FORBIDDEN_CHANGES) {
    const keywords = forbidden
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 5);
    const hits = keywords.filter((token) => lowered.includes(token));
    if (hits.length >= 2) {
      return `May conflict with global forbidden rule: ${forbidden}`;
    }
  }
  return undefined;
};

const tryNormalizeStringList = (
  values: string[],
  fieldName: string,
): { values: string[]; diagnostics: DeveloperTaskDiagnostic[] } => {
  const normalized = values.map((value) => value.trim()).filter((value) => value.length > 0);
  if (normalized.length === 0) {
    return {
      values: normalized,
      diagnostics: [
        {
          category: 'blocker',
          field: fieldName,
          message: `${fieldName} must include at least one non-empty entry.`,
        },
      ],
    };
  }
  return { values: normalized, diagnostics: [] };
};

export const toHandoffDisplayPath = (
  runsRoot: string,
  repoRoot: string,
  targetPath: string,
): string => {
  const resolvedRunsRoot = path.resolve(runsRoot);
  const resolvedRepoRoot = path.resolve(repoRoot);
  const resolvedTarget = path.resolve(targetPath);

  const relativeToRepo = path.relative(resolvedRepoRoot, resolvedTarget);
  if (
    relativeToRepo.length > 0 &&
    !relativeToRepo.startsWith('..') &&
    !path.isAbsolute(relativeToRepo)
  ) {
    return relativeToRepo.split(path.sep).join('/');
  }

  const relativeToRuns = path.relative(resolvedRunsRoot, resolvedTarget);
  if (
    relativeToRuns.length > 0 &&
    !relativeToRuns.startsWith('..') &&
    !path.isAbsolute(relativeToRuns)
  ) {
    return relativeToRuns.split(path.sep).join('/');
  }

  return resolvedTarget.split(path.sep).join('/');
};

export const collectDeveloperTaskDiagnostics = (
  input: DeveloperTaskInput,
): DeveloperTaskValidationResult => {
  const diagnostics: DeveloperTaskDiagnostic[] = [];

  if (!isReviewStructurallyUsable(input.review)) {
    diagnostics.push({
      category: 'blocker',
      field: 'review',
      message:
        'Review JSON is structurally unusable. Require version, seed, persona, summary, scores, top_issues, and suggested_next_changes.',
    });
  }

  if (!isScorecardStructurallyUsable(input.scorecard)) {
    diagnostics.push({
      category: 'blocker',
      field: 'scorecard',
      message:
        'Scorecard JSON is structurally unusable. Require version, seed, persona, result, and turns.',
    });
  }

  if (
    isReviewStructurallyUsable(input.review) &&
    isScorecardStructurallyUsable(input.scorecard) &&
    input.review.version !== input.scorecard.version
  ) {
    diagnostics.push({
      category: 'blocker',
      field: 'version',
      message: `Review version "${input.review.version}" does not match scorecard version "${input.scorecard.version}".`,
    });
  }

  if (
    isReviewStructurallyUsable(input.review) &&
    isScorecardStructurallyUsable(input.scorecard) &&
    input.review.seed !== input.scorecard.seed
  ) {
    diagnostics.push({
      category: 'blocker',
      field: 'seed',
      message: `Review seed "${input.review.seed}" does not match scorecard seed "${input.scorecard.seed}".`,
    });
  }

  try {
    validateVersionId(input.targetVersion);
  } catch (error) {
    diagnostics.push({
      category: 'blocker',
      field: 'targetVersion',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const targetScope = input.targetScope.trim();
  if (targetScope.length === 0) {
    diagnostics.push({
      category: 'blocker',
      field: 'targetScope',
      message: 'targetScope must be a non-empty string.',
    });
  }

  const allowed = tryNormalizeStringList(input.allowedChanges, 'allowedChanges');
  diagnostics.push(...allowed.diagnostics);
  const proposed = tryNormalizeStringList(input.proposedChanges, 'proposedChanges');
  diagnostics.push(...proposed.diagnostics);

  if (proposed.values.length > 3) {
    diagnostics.push({
      category: 'blocker',
      field: 'proposedChanges',
      message: `proposedChanges must include at most 3 scoped changes (received ${proposed.values.length}).`,
    });
  }

  diagnostics.push(
    ...collectProtocolBreakingDiagnostics(allowed.values, 'allowedChanges'),
    ...collectProtocolBreakingDiagnostics(proposed.values, 'proposedChanges'),
  );

  const previousReviewPath = input.previousReviewPath.trim();
  const previousScorecardPath = input.previousScorecardPath.trim();
  if (previousReviewPath.length === 0 || previousScorecardPath.length === 0) {
    diagnostics.push({
      category: 'blocker',
      field: 'paths',
      message: 'previousReviewPath and previousScorecardPath must be non-empty.',
    });
  }

  for (const entry of input.forbiddenChanges ?? []) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (GLOBAL_FORBIDDEN_CHANGES.some((forbidden) => forbidden === trimmed)) {
      diagnostics.push({
        category: 'forbidden',
        field: 'forbiddenChanges',
        entry: trimmed,
        message: 'Duplicates a global forbidden rule (already enforced by default).',
      });
    }
  }

  for (const entry of proposed.values) {
    const conflict = matchesForbiddenPattern(entry);
    if (conflict) {
      diagnostics.push({
        category: 'blocker',
        field: 'proposedChanges',
        entry,
        message: conflict,
      });
    }
    if (entry.length < 12) {
      diagnostics.push({
        category: 'proposed',
        field: 'proposedChanges',
        entry,
        message: 'Proposed change is very short; add concrete scope before handing off.',
      });
    }
  }

  for (const entry of allowed.values) {
    if (/\b(refactor|rewrite|rearchitect)\b/i.test(entry)) {
      diagnostics.push({
        category: 'allowed',
        field: 'allowedChanges',
        entry,
        message: 'Allowed change mentions broad refactor language; keep the version scope bounded.',
      });
    }
  }

  if (isReviewStructurallyUsable(input.review) && input.review.top_issues.length === 0) {
    diagnostics.push({
      category: 'warning',
      field: 'review',
      message: 'Review has no top_issues; confirm the handoff scope is still evidence-backed.',
    });
  }

  for (const forbidden of GLOBAL_FORBIDDEN_CHANGES) {
    diagnostics.push({
      category: 'forbidden',
      message: forbidden,
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

export const formatDeveloperTaskValidationMessage = (
  result: DeveloperTaskValidationResult,
): string => {
  const formatDiagnostic = (diagnostic: DeveloperTaskDiagnostic): string => {
    const prefix = diagnostic.field
      ? `${diagnostic.category} (${diagnostic.field})`
      : diagnostic.category;
    const entry = diagnostic.entry ? ` "${diagnostic.entry}"` : '';
    return `- [${prefix}]${entry}: ${diagnostic.message}`;
  };

  if (result.ok) {
    const lines = ['Developer task input is valid.'];
    if (result.diagnostics.length > 0) {
      lines.push('Diagnostics:');
      lines.push(...result.diagnostics.map(formatDiagnostic));
    }
    return lines.join('\n');
  }

  const lines = ['Developer task validation failed:'];
  lines.push(...result.diagnostics.map(formatDiagnostic));
  return lines.join('\n');
};

export const validateDeveloperTaskInput = (input: DeveloperTaskInput): void => {
  const result = collectDeveloperTaskDiagnostics(input);
  if (!result.ok) {
    throw new DeveloperTaskValidationError(
      formatDeveloperTaskValidationMessage(result),
      result.diagnostics,
    );
  }
};

const buildForbiddenChanges = (extraForbidden?: string[]): string[] => {
  const merged: string[] = [...GLOBAL_FORBIDDEN_CHANGES];
  if (extraForbidden) {
    for (const entry of extraForbidden) {
      const trimmed = entry.trim();
      if (trimmed.length > 0 && !merged.includes(trimmed)) {
        merged.push(trimmed);
      }
    }
  }
  return merged;
};

const defaultImplementationSummary = (
  targetVersion: string,
  proposedChanges: string[],
): string =>
  `Implement ${proposedChanges.length} bounded change(s) for ${targetVersion}, update patch plan and changelog, then rerun required test commands. Do not execute patches autonomously; a human owner approves scope before coding.`;

export const generateDeveloperTask = (
  input: DeveloperTaskInput,
  options?: { repoRoot?: string },
): DeveloperTask => {
  validateDeveloperTaskInput(input);

  const runsRoot = input.runsRoot ?? process.cwd();
  const repoRoot = options?.repoRoot ?? process.cwd();
  const paths = getVersionPaths(runsRoot, input.targetVersion);
  const proposedChanges = input.proposedChanges.map((value) => value.trim()).filter(Boolean);
  const allowedChanges = input.allowedChanges.map((value) => value.trim()).filter(Boolean);

  return {
    previous_review_path: input.previousReviewPath.trim(),
    previous_scorecard_path: input.previousScorecardPath.trim(),
    target_version: input.targetVersion,
    target_scope: input.targetScope.trim(),
    allowed_changes: allowedChanges,
    forbidden_changes: buildForbiddenChanges(input.forbiddenChanges),
    proposed_changes: proposedChanges,
    required_test_commands: [...(input.requiredTestCommands ?? DEFAULT_DEVELOPER_TEST_COMMANDS)],
    required_patch_plan_path: toHandoffDisplayPath(runsRoot, repoRoot, paths.patchPlanPath),
    required_changelog_path: toHandoffDisplayPath(runsRoot, repoRoot, paths.changelogPath),
    expected_implementation_summary:
      input.expectedImplementationSummary?.trim() ||
      defaultImplementationSummary(input.targetVersion, proposedChanges),
    governance: {
      human_governed: true,
      autonomous_patch_execution: false,
    },
    evidence: {
      review_version: input.review.version,
      review_seed: input.review.seed,
      review_persona: input.review.persona,
      review_summary: input.review.summary.trim(),
      review_issues: input.review.top_issues.map((issue) => ({
        severity: issue.severity,
        observation: issue.observation,
        diagnosis: issue.diagnosis,
        recommendation: issue.recommendation,
        evidence: issue.evidence.map((evidence) => ({ ...evidence })),
      })),
      suggested_next_changes: [...input.review.suggested_next_changes],
      top_issue_count: input.review.top_issues.length,
      scorecard_result: input.scorecard.result,
      scorecard_turns: input.scorecard.turns,
      reviewer_scores: input.review.scores,
    },
  };
};

const bulletList = (items: string[]): string =>
  items.length === 0 ? '- _(none)_\n' : items.map((item) => `- ${item}`).join('\n');

export const renderDeveloperTaskMarkdown = (task: DeveloperTask): string => {
  const relativePatchPlan = task.required_patch_plan_path;
  const relativeChangelog = task.required_changelog_path;

  return [
    '# Developer Task',
    '',
    '## Governance',
    '',
    '- Human-governed handoff only; this artifact does not apply patches automatically.',
    '- `autonomous_patch_execution` is forbidden for this workflow.',
    '- Implement at most three scoped changes, then record outcomes in the required patch plan and changelog paths.',
    '',
    '## Evidence inputs',
    '',
    `- Previous review: \`${task.previous_review_path}\``,
    `- Previous scorecard: \`${task.previous_scorecard_path}\``,
    `- Review version / seed / persona: \`${task.evidence.review_version}\` / \`${task.evidence.review_seed}\` / \`${task.evidence.review_persona}\``,
    `- Scorecard result / turns: \`${task.evidence.scorecard_result}\` / ${task.evidence.scorecard_turns}`,
    `- Top issues in review: ${task.evidence.top_issue_count}`,
    '',
    '## Review summary',
    '',
    task.evidence.review_summary,
    '',
    '## Reviewer scores',
    '',
    `- fun: ${task.evidence.reviewer_scores.fun}`,
    `- clarity: ${task.evidence.reviewer_scores.clarity}`,
    `- fairness: ${task.evidence.reviewer_scores.fairness}`,
    `- tactical_depth: ${task.evidence.reviewer_scores.tactical_depth}`,
    `- replay_value: ${task.evidence.reviewer_scores.replay_value}`,
    '',
    '## Evidence-backed review issues',
    '',
    task.evidence.review_issues.length === 0
      ? '- _(No top issues recorded.)_'
      : task.evidence.review_issues
          .map((issue, index) => {
            const evidence = issue.evidence
              .map((entry) => {
                const turn = entry.turn === undefined ? '' : ` (turn ${entry.turn})`;
                const quote = entry.quote ? ` Quote: "${entry.quote}"` : '';
                return `  - ${entry.kind}${turn}: ${entry.detail}${quote}`;
              })
              .join('\n');
            return [
              `${index + 1}. [${issue.severity}] ${issue.observation}`,
              `  - Diagnosis: ${issue.diagnosis}`,
              `  - Recommendation: ${issue.recommendation}`,
              evidence,
            ]
              .filter((line) => line.length > 0)
              .join('\n');
          })
          .join('\n'),
    '',
    '## Target',
    '',
    `- Target version: \`${task.target_version}\``,
    `- Target scope: ${task.target_scope}`,
    '',
    '## Proposed scoped changes (implement at most 3)',
    '',
    bulletList(task.proposed_changes),
    '',
    '## Allowed changes',
    '',
    bulletList(task.allowed_changes),
    '',
    '## Forbidden changes',
    '',
    bulletList(task.forbidden_changes),
    '',
    '## Required artifacts',
    '',
    `- Patch plan: \`${relativePatchPlan}\``,
    `- Changelog: \`${relativeChangelog}\``,
    '',
    '## Required test commands',
    '',
    bulletList(task.required_test_commands),
    '',
    '## Expected implementation summary',
    '',
    task.expected_implementation_summary,
    '',
    '## Reviewer suggested next changes (reference only)',
    '',
    bulletList(task.evidence.suggested_next_changes),
    '',
  ].join('\n');
};

export const renderPatchPlanTemplate = (
  task: DeveloperTask,
  review: PlaythroughReview,
): string => {
  const issueLines =
    review.top_issues.length === 0
      ? '- _(No top issues recorded; cite trace/scorecard facts manually.)_\n'
      : review.top_issues
          .slice(0, 5)
          .map(
            (issue, index) =>
              `${index + 1}. **[${issue.severity}]** ${issue.observation}\n   - Diagnosis: ${issue.diagnosis}\n   - Recommendation: ${issue.recommendation}`,
          )
          .join('\n');

  return [
    '# Patch Plan',
    '',
    `Target version: ${task.target_version}`,
    '',
    '## Review issues being addressed',
    '',
    issueLines,
    '',
    '## Proposed scoped changes (1-3)',
    '',
    bulletList(task.proposed_changes),
    '',
    '## Expected files/modules',
    '',
    '- _(List concrete paths/modules before coding.)_',
    '',
    '## Tests and checks to add or rerun',
    '',
    bulletList(task.required_test_commands),
    '',
    '## Non-goals',
    '',
    '- Do not expand beyond the target scope for this version.',
    '- Do not implement reviewer suggestions that violate forbidden changes.',
    '',
    '## Forbidden changes',
    '',
    bulletList(task.forbidden_changes),
    '',
    '## Status',
    '',
    'Status: pending',
    '',
  ].join('\n');
};

export const renderChangelogTemplate = (task: DeveloperTask): string =>
  [
    '# Changelog',
    '',
    `Version: ${task.target_version}`,
    '',
    '## Implemented changes',
    '',
    '- _(Record each implemented scoped change.)_',
    '',
    '## Tests and evidence',
    '',
    bulletList(task.required_test_commands),
    '',
    '## Invariants preserved',
    '',
    '- GameEngine interface unchanged.',
    '- Seed determinism and explicit terminal states preserved.',
    '- Gameplay remains finite, turn-based, and text/ASCII-first.',
    '',
    '## Residual risks',
    '',
    '- _(Note follow-ups or harness reruns still needed.)_',
    '',
    '## Status',
    '',
    'Status: pending',
    '',
  ].join('\n');

export const getDeveloperTaskOutputPath = (
  runsRoot: string,
  targetVersion: string,
): string => {
  const paths = getVersionPaths(runsRoot, targetVersion);
  return path.join(paths.versionDir, 'developer_task.md');
};
