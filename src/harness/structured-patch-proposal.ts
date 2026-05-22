import { access } from 'node:fs/promises';
import path from 'node:path';

import { FORBIDDEN_MVP_FEATURES } from './acceptance-gate.js';
import {
  collectDeveloperTaskDiagnostics,
  DEFAULT_DEVELOPER_TEST_COMMANDS,
  GLOBAL_FORBIDDEN_CHANGES,
  type DeveloperTaskInput,
  type DeveloperTaskValidationResult,
} from './developer-workflow.js';
import type { PlaythroughReview, ReviewIssueEvidence } from './reviewer-client.js';
import { isReviewStructurallyUsable } from './review-validation.js';
import { isScorecardStructurallyUsable } from './reviewer-client.js';
import type { PlaythroughScorecard } from './types.js';
import { getVersionPaths, validateVersionId } from './version-loop.js';

export const PATCH_PROPOSAL_SCHEMA_VERSION = '1' as const;

export type PatchProposalSchemaVersion = typeof PATCH_PROPOSAL_SCHEMA_VERSION;

export type PatchProposalEvidenceKind =
  | 'trace'
  | 'review'
  | 'scorecard'
  | 'acceptance'
  | ReviewIssueEvidence['kind'];

export interface PatchProposalEvidenceArtifact {
  kind: 'trace' | 'review' | 'scorecard' | 'acceptance';
  path: string;
  version: string;
  seed?: string;
  persona?: string;
  required: boolean;
}

export interface PatchProposalChangeEvidence {
  kind: PatchProposalEvidenceKind;
  detail: string;
  turn?: number;
  quote?: string;
}

export interface PatchProposalChange {
  change_id: string;
  title: string;
  description: string;
  addresses_issue_indices: number[];
  evidence: PatchProposalChangeEvidence[];
}

export interface StructuredPatchProposal {
  schema_version: PatchProposalSchemaVersion;
  proposal_id: string;
  base_version: string;
  target_version: string;
  target_scope: string;
  status: 'draft';
  governance: {
    human_governed: true;
    autonomous_patch_execution: false;
    implementation_authority: 'human_owner';
  };
  evidence_artifacts: {
    trace: PatchProposalEvidenceArtifact;
    review: PatchProposalEvidenceArtifact;
    scorecard: PatchProposalEvidenceArtifact;
    acceptance?: PatchProposalEvidenceArtifact;
  };
  changes: PatchProposalChange[];
  scope: {
    allowed_paths: string[];
    forbidden_changes: string[];
    forbidden_mvp_features: readonly string[];
    global_forbidden_changes: readonly string[];
    protocol_invariants: readonly string[];
  };
  risks: string[];
  validation_commands: string[];
}

export type PatchProposalDiagnosticCategory =
  | 'blocker'
  | 'warning'
  | 'forbidden'
  | 'evidence'
  | 'scope';

export interface PatchProposalDiagnostic {
  category: PatchProposalDiagnosticCategory;
  message: string;
  field?: string;
  entry?: string;
}

export interface PatchProposalValidationResult {
  ok: boolean;
  diagnostics: PatchProposalDiagnostic[];
  blockers: PatchProposalDiagnostic[];
  warnings: PatchProposalDiagnostic[];
}

export class PatchProposalValidationError extends Error {
  readonly diagnostics: PatchProposalDiagnostic[];

  constructor(message: string, diagnostics: PatchProposalDiagnostic[] = []) {
    super(message);
    this.name = 'PatchProposalValidationError';
    this.diagnostics = diagnostics;
  }
}

export const PROTOCOL_INVARIANTS = [
  'Gameplay remains finite, turn-based, text/ASCII-first, seedable, and structured-action based.',
  'Terminal states remain explicit: ACTIVE, WIN, LOSS, ABORTED.',
  'GameEngine interface stays stable: start, getAvailableActions, step, render, isTerminal.',
  'Reviewer output must not mutate game state directly.',
  'Harness validation and trace evidence remain authoritative over agent self-report.',
] as const;

const PATCH_PROPOSAL_EVIDENCE_KINDS = new Set<PatchProposalEvidenceKind>([
  'trace',
  'review',
  'scorecard',
  'acceptance',
  'turn',
  'result',
  'invalid',
  'event',
  'render',
]);

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

const FORBIDDEN_FEATURE_PATTERNS: ReadonlyArray<{ pattern: RegExp; feature: string }> = [
  {
    pattern: /\breal-?time\b|\btiming-?sensitive\b/i,
    feature: FORBIDDEN_MVP_FEATURES[0],
  },
  {
    pattern: /\bimage-?only\b|\brequired\b.*\b(visual|image)\b/i,
    feature: FORBIDDEN_MVP_FEATURES[1],
  },
  {
    pattern: /\brequired\b.*\b(audio|voice|media)\b/i,
    feature: FORBIDDEN_MVP_FEATURES[2],
  },
  {
    pattern: /\binfinite\b.*\bfloor\b|\bno-?ending\b|\bsandbox\b.*\bplay\b/i,
    feature: FORBIDDEN_MVP_FEATURES[3],
  },
  {
    pattern: /\bfree-?text\b.*\b(command|action|gameplay)\b/i,
    feature: FORBIDDEN_MVP_FEATURES[4],
  },
  {
    pattern: /\bllm-?generated\b.*\b(world|story)\b|\barbitrary\b.*\bstory\b/i,
    feature: FORBIDDEN_MVP_FEATURES[5],
  },
  {
    pattern: /\bexternal\b.*\bapi\b.*\b(gameplay|during play)\b/i,
    feature: FORBIDDEN_MVP_FEATURES[6],
  },
  {
    pattern: /\bengine\b.*\brewrite\b|\bbreak\b.*\bprotocol\b/i,
    feature: FORBIDDEN_MVP_FEATURES[7],
  },
];

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

const collectProtocolBreakingDiagnostics = (
  entries: string[],
  field: string,
): PatchProposalDiagnostic[] => {
  const diagnostics: PatchProposalDiagnostic[] = [];
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

const collectForbiddenFeatureDiagnostics = (
  entries: string[],
  field: string,
): PatchProposalDiagnostic[] => {
  const diagnostics: PatchProposalDiagnostic[] = [];
  for (const entry of entries) {
    for (const rule of FORBIDDEN_FEATURE_PATTERNS) {
      if (rule.pattern.test(entry)) {
        diagnostics.push({
          category: 'blocker',
          field,
          entry,
          message: `Forbidden MVP feature detected: ${rule.feature}`,
        });
      }
    }
    const conflict = matchesForbiddenPattern(entry);
    if (conflict) {
      diagnostics.push({
        category: 'blocker',
        field,
        entry,
        message: conflict,
      });
    }
  }
  return diagnostics;
};

const collectChangeEvidenceDiagnostics = (
  change: PatchProposalChange,
): PatchProposalDiagnostic[] => {
  const diagnostics: PatchProposalDiagnostic[] = [];

  if (change.evidence.length === 0) {
    diagnostics.push({
      category: 'blocker',
      field: 'changes',
      entry: change.change_id,
      message: `Change ${change.change_id} cannot claim scope without evidence entries.`,
    });
    return diagnostics;
  }

  for (let index = 0; index < change.evidence.length; index += 1) {
    const evidence = change.evidence[index];
    const field = `changes.${change.change_id}.evidence[${index}]`;
    if (!PATCH_PROPOSAL_EVIDENCE_KINDS.has(evidence.kind)) {
      diagnostics.push({
        category: 'blocker',
        field,
        entry: change.change_id,
        message: `Evidence kind "${String(evidence.kind)}" is not supported.`,
      });
    }
    if (evidence.detail.trim().length === 0) {
      diagnostics.push({
        category: 'blocker',
        field,
        entry: change.change_id,
        message: 'Evidence detail must be a non-empty string.',
      });
    }
    if (
      evidence.turn !== undefined &&
      (typeof evidence.turn !== 'number' || !Number.isFinite(evidence.turn))
    ) {
      diagnostics.push({
        category: 'blocker',
        field: `${field}.turn`,
        entry: change.change_id,
        message: 'Evidence turn must be a finite number when provided.',
      });
    }
  }

  return diagnostics;
};

const fileIsReadable = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const resolveArtifactAbsolutePath = (
  runsRoot: string,
  artifactPath: string,
): string =>
  path.isAbsolute(artifactPath)
    ? artifactPath
    : path.resolve(runsRoot, artifactPath);

export interface PatchProposalAssemblyInput {
  review: PlaythroughReview;
  scorecard: PlaythroughScorecard;
  baseVersion: string;
  targetVersion: string;
  targetScope: string;
  tracePath: string;
  reviewPath: string;
  scorecardPath: string;
  acceptancePath?: string;
  allowedPaths: string[];
  changes: PatchProposalChange[];
  forbiddenChanges?: string[];
  risks?: string[];
  validationCommands?: string[];
  runsRoot?: string;
  proposalId?: string;
}

export const buildPatchProposalChangeFromIssue = (
  issue: PlaythroughReview['top_issues'][number],
  index: number,
): PatchProposalChange => ({
  change_id: `change_${index + 1}`,
  title: issue.observation.trim(),
  description: issue.recommendation.trim(),
  addresses_issue_indices: [index],
  evidence: issue.evidence.map((entry) => ({
    kind: entry.kind,
    detail: entry.detail,
    turn: entry.turn,
    quote: entry.quote,
  })),
});

export const buildPatchProposalChangesFromReview = (
  review: PlaythroughReview,
  maxChanges = 3,
): PatchProposalChange[] => {
  if (review.top_issues.length > 0) {
    return review.top_issues.slice(0, maxChanges).map(buildPatchProposalChangeFromIssue);
  }

  return review.suggested_next_changes.slice(0, maxChanges).map((entry, index) => ({
    change_id: `suggested_${index + 1}`,
    title: entry.trim(),
    description: entry.trim(),
    addresses_issue_indices: [],
    evidence: [
      {
        kind: 'review',
        detail: 'Derived from reviewer suggested_next_changes because top_issues was empty.',
      },
    ],
  }));
};

export const assembleStructuredPatchProposal = (
  input: PatchProposalAssemblyInput,
): StructuredPatchProposal => {
  validateVersionId(input.baseVersion);
  validateVersionId(input.targetVersion);

  const forbidden: string[] = [...GLOBAL_FORBIDDEN_CHANGES];
  if (input.forbiddenChanges) {
    for (const entry of input.forbiddenChanges) {
      const trimmed = entry.trim();
      if (trimmed.length > 0 && !forbidden.includes(trimmed)) {
        forbidden.push(trimmed);
      }
    }
  }

  const proposalId =
    input.proposalId ??
    `${input.baseVersion}_to_${input.targetVersion}_${input.review.seed}_${input.review.persona}`;

  return {
    schema_version: PATCH_PROPOSAL_SCHEMA_VERSION,
    proposal_id: proposalId,
    base_version: input.baseVersion,
    target_version: input.targetVersion,
    target_scope: input.targetScope.trim(),
    status: 'draft',
    governance: {
      human_governed: true,
      autonomous_patch_execution: false,
      implementation_authority: 'human_owner',
    },
    evidence_artifacts: {
      trace: {
        kind: 'trace',
        path: input.tracePath.trim(),
        version: input.baseVersion,
        seed: input.review.seed,
        persona: input.review.persona,
        required: true,
      },
      review: {
        kind: 'review',
        path: input.reviewPath.trim(),
        version: input.baseVersion,
        seed: input.review.seed,
        persona: input.review.persona,
        required: true,
      },
      scorecard: {
        kind: 'scorecard',
        path: input.scorecardPath.trim(),
        version: input.baseVersion,
        seed: input.review.seed,
        persona: input.review.persona,
        required: true,
      },
      ...(input.acceptancePath
        ? {
            acceptance: {
              kind: 'acceptance' as const,
              path: input.acceptancePath.trim(),
              version: input.baseVersion,
              required: false,
            },
          }
        : {}),
    },
    changes: input.changes,
    scope: {
      allowed_paths: input.allowedPaths.map((entry) => entry.trim()).filter(Boolean),
      forbidden_changes: forbidden,
      forbidden_mvp_features: FORBIDDEN_MVP_FEATURES,
      global_forbidden_changes: GLOBAL_FORBIDDEN_CHANGES,
      protocol_invariants: PROTOCOL_INVARIANTS,
    },
    risks: input.risks ?? [],
    validation_commands: [...(input.validationCommands ?? DEFAULT_DEVELOPER_TEST_COMMANDS)],
  };
};

export const getPatchProposalOutputPath = (
  runsRoot: string,
  targetVersion: string,
): string => path.join(getVersionPaths(runsRoot, targetVersion).versionDir, 'patch_proposal.json');

export const collectPatchProposalDiagnostics = async (
  proposal: StructuredPatchProposal,
  options?: { runsRoot?: string; verifyEvidenceFiles?: boolean },
): Promise<PatchProposalValidationResult> => {
  const diagnostics: PatchProposalDiagnostic[] = [];
  const runsRoot = options?.runsRoot ?? process.cwd();
  const verifyFiles = options?.verifyEvidenceFiles ?? true;

  if (proposal.schema_version !== PATCH_PROPOSAL_SCHEMA_VERSION) {
    diagnostics.push({
      category: 'blocker',
      field: 'schema_version',
      message: `Unsupported schema_version "${proposal.schema_version}". Expected "${PATCH_PROPOSAL_SCHEMA_VERSION}".`,
    });
  }

  if (!proposal.governance.human_governed || proposal.governance.autonomous_patch_execution) {
    diagnostics.push({
      category: 'blocker',
      field: 'governance',
      message:
        'Patch proposals must remain human-governed with autonomous_patch_execution set to false.',
    });
  }

  try {
    validateVersionId(proposal.base_version);
    validateVersionId(proposal.target_version);
  } catch (error) {
    diagnostics.push({
      category: 'blocker',
      field: 'version',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (proposal.target_scope.trim().length === 0) {
    diagnostics.push({
      category: 'blocker',
      field: 'target_scope',
      message: 'target_scope must be a non-empty string.',
    });
  }

  if (proposal.changes.length === 0) {
    diagnostics.push({
      category: 'blocker',
      field: 'changes',
      message: 'At least one proposed change is required.',
    });
  }

  if (proposal.changes.length > 3) {
    diagnostics.push({
      category: 'blocker',
      field: 'changes',
      message: `At most 3 proposed changes are allowed (received ${proposal.changes.length}).`,
    });
  }

  if (proposal.scope.allowed_paths.length === 0) {
    diagnostics.push({
      category: 'blocker',
      field: 'scope.allowed_paths',
      message: 'scope.allowed_paths must include at least one bounded path prefix.',
    });
  }

  const requiredArtifacts = [
    proposal.evidence_artifacts.trace,
    proposal.evidence_artifacts.review,
    proposal.evidence_artifacts.scorecard,
  ];

  for (const artifact of requiredArtifacts) {
    if (artifact.path.trim().length === 0) {
      diagnostics.push({
        category: 'blocker',
        field: `evidence_artifacts.${artifact.kind}`,
        message: `${artifact.kind} evidence path must be non-empty.`,
      });
      continue;
    }

    if (verifyFiles) {
      const absolutePath = resolveArtifactAbsolutePath(runsRoot, artifact.path);
      const readable = await fileIsReadable(absolutePath);
      if (!readable) {
        diagnostics.push({
          category: 'blocker',
          field: `evidence_artifacts.${artifact.kind}`,
          message: `Missing required ${artifact.kind} evidence at ${artifact.path}.`,
        });
      }
    }
  }

  const acceptance = proposal.evidence_artifacts.acceptance;
  if (acceptance?.path) {
    if (verifyFiles) {
      const absolutePath = resolveArtifactAbsolutePath(runsRoot, acceptance.path);
      const readable = await fileIsReadable(absolutePath);
      if (!readable) {
        diagnostics.push({
          category: 'warning',
          field: 'evidence_artifacts.acceptance',
          message: `Optional acceptance evidence is missing at ${acceptance.path}.`,
        });
      }
    }
  }

  for (const change of proposal.changes) {
    if (change.title.trim().length === 0 || change.description.trim().length === 0) {
      diagnostics.push({
        category: 'blocker',
        field: 'changes',
        entry: change.change_id,
        message: `Change ${change.change_id} must include non-empty title and description.`,
      });
    }

    diagnostics.push(...collectChangeEvidenceDiagnostics(change));

    diagnostics.push(
      ...collectProtocolBreakingDiagnostics(
        [change.title, change.description],
        `changes.${change.change_id}`,
      ),
      ...collectForbiddenFeatureDiagnostics(
        [change.title, change.description],
        `changes.${change.change_id}`,
      ),
    );
  }

  diagnostics.push(
    ...collectProtocolBreakingDiagnostics(proposal.scope.allowed_paths, 'scope.allowed_paths'),
    ...collectForbiddenFeatureDiagnostics(
      proposal.changes.flatMap((change) => [change.title, change.description]),
      'changes',
    ),
  );

  for (const forbidden of GLOBAL_FORBIDDEN_CHANGES) {
    diagnostics.push({
      category: 'forbidden',
      message: forbidden,
    });
  }

  for (const feature of FORBIDDEN_MVP_FEATURES) {
    diagnostics.push({
      category: 'forbidden',
      message: feature,
    });
  }

  if (proposal.changes.some((change) => change.description.length < 12)) {
    diagnostics.push({
      category: 'warning',
      field: 'changes',
      message: 'One or more change descriptions are very short; add concrete scope before handoff.',
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

export const formatPatchProposalValidationMessage = (
  result: PatchProposalValidationResult,
): string => {
  const formatDiagnostic = (diagnostic: PatchProposalDiagnostic): string => {
    const prefix = diagnostic.field
      ? `${diagnostic.category} (${diagnostic.field})`
      : diagnostic.category;
    const entry = diagnostic.entry ? ` "${diagnostic.entry}"` : '';
    return `- [${prefix}]${entry}: ${diagnostic.message}`;
  };

  if (result.ok) {
    const lines = ['Patch proposal is valid for human review.'];
    if (result.diagnostics.length > 0) {
      lines.push('Diagnostics:');
      lines.push(...result.diagnostics.map(formatDiagnostic));
    }
    return lines.join('\n');
  }

  const lines = ['Patch proposal validation failed:'];
  lines.push(...result.diagnostics.map(formatDiagnostic));
  return lines.join('\n');
};

export const validateStructuredPatchProposal = async (
  proposal: StructuredPatchProposal,
  options?: { runsRoot?: string; verifyEvidenceFiles?: boolean },
): Promise<void> => {
  const result = await collectPatchProposalDiagnostics(proposal, options);
  if (!result.ok) {
    throw new PatchProposalValidationError(
      formatPatchProposalValidationMessage(result),
      result.diagnostics,
    );
  }
};

export interface PatchProposalDeveloperTaskContext {
  proposal: StructuredPatchProposal;
  review: PlaythroughReview;
  scorecard: PlaythroughScorecard;
  runsRoot?: string;
}

export const developerTaskInputFromPatchProposal = (
  context: PatchProposalDeveloperTaskContext,
): DeveloperTaskInput => {
  const { proposal, review, scorecard, runsRoot } = context;
  const reviewPath = proposal.evidence_artifacts.review.path;
  const scorecardPath = proposal.evidence_artifacts.scorecard.path;
  const extraForbidden = proposal.scope.forbidden_changes.filter(
    (entry) =>
      !GLOBAL_FORBIDDEN_CHANGES.includes(
        entry as (typeof GLOBAL_FORBIDDEN_CHANGES)[number],
      ),
  );

  return {
    review,
    scorecard,
    previousReviewPath: reviewPath,
    previousScorecardPath: scorecardPath,
    targetVersion: proposal.target_version,
    targetScope: proposal.target_scope,
    allowedChanges: [
      ...proposal.scope.allowed_paths.map((entry) => `Touch only paths under ${entry}.`),
    ],
    proposedChanges: proposal.changes.map(
      (change) => `${change.title}: ${change.description}`,
    ),
    forbiddenChanges: extraForbidden,
    requiredTestCommands: [...proposal.validation_commands],
    expectedImplementationSummary: `Human-approved proposal ${proposal.proposal_id}: implement ${proposal.changes.length} bounded change(s) for ${proposal.target_version} with evidence from ${proposal.base_version}.`,
    runsRoot,
  };
};

export const validatePatchProposalForDeveloperTask = async (
  context: PatchProposalDeveloperTaskContext,
  options?: { runsRoot?: string; verifyEvidenceFiles?: boolean },
): Promise<{
  proposalValidation: PatchProposalValidationResult;
  developerTaskValidation: DeveloperTaskValidationResult;
}> => {
  const proposalValidation = await collectPatchProposalDiagnostics(context.proposal, {
    runsRoot: options?.runsRoot ?? context.runsRoot,
    verifyEvidenceFiles: options?.verifyEvidenceFiles,
  });
  if (!proposalValidation.ok) {
    return {
      proposalValidation,
      developerTaskValidation: {
        ok: false,
        diagnostics: [],
        blockers: [],
        warnings: [],
      },
    };
  }

  const developerTaskValidation = collectDeveloperTaskDiagnostics(
    developerTaskInputFromPatchProposal({
      ...context,
      runsRoot: options?.runsRoot ?? context.runsRoot,
    }),
  );

  return { proposalValidation, developerTaskValidation };
};

export const assertPatchProposalStructurallyValid = (
  value: unknown,
): value is StructuredPatchProposal => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const proposal = value as StructuredPatchProposal;
  return (
    proposal.schema_version === PATCH_PROPOSAL_SCHEMA_VERSION &&
    typeof proposal.proposal_id === 'string' &&
    typeof proposal.base_version === 'string' &&
    typeof proposal.target_version === 'string' &&
    typeof proposal.target_scope === 'string' &&
    proposal.status === 'draft' &&
    proposal.governance?.human_governed === true &&
    proposal.governance?.autonomous_patch_execution === false &&
    Array.isArray(proposal.changes) &&
    proposal.changes.length > 0 &&
    Array.isArray(proposal.scope?.allowed_paths) &&
    proposal.scope.allowed_paths.length > 0 &&
    Array.isArray(proposal.validation_commands) &&
    proposal.validation_commands.length > 0 &&
    !!proposal.evidence_artifacts?.trace?.path &&
    !!proposal.evidence_artifacts?.review?.path &&
    !!proposal.evidence_artifacts?.scorecard?.path
  );
};

export const validatePatchProposalReviewContext = (
  review: PlaythroughReview,
  scorecard: PlaythroughScorecard,
): PatchProposalDiagnostic[] => {
  const diagnostics: PatchProposalDiagnostic[] = [];
  if (!isReviewStructurallyUsable(review)) {
    diagnostics.push({
      category: 'blocker',
      field: 'review',
      message:
        'Review JSON is structurally unusable for patch proposal assembly. Require version, seed, persona, summary, evidence_quality, scores, top_issues, and suggested_next_changes.',
    });
  }
  if (!isScorecardStructurallyUsable(scorecard)) {
    diagnostics.push({
      category: 'blocker',
      field: 'scorecard',
      message:
        'Scorecard JSON is structurally unusable for patch proposal assembly. Require version, seed, persona, result, and turns.',
    });
  }
  if (
    isReviewStructurallyUsable(review) &&
    isScorecardStructurallyUsable(scorecard) &&
    review.version !== scorecard.version
  ) {
    diagnostics.push({
      category: 'blocker',
      field: 'version',
      message: `Review version "${review.version}" does not match scorecard version "${scorecard.version}".`,
    });
  }
  return diagnostics;
};
