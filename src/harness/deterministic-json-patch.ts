import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { validateChallengeModesBundle } from '../game/challenge-modes.js';
import {
  validateScenarioPackContentOverlay,
  validateScenarioPacksManifest,
} from '../game/scenario-packs.js';
import { FORBIDDEN_MVP_FEATURES } from './acceptance-gate.js';
import { GLOBAL_FORBIDDEN_CHANGES } from './developer-workflow.js';
import { stringifyDeterministicJson } from './json.js';
import {
  collectPatchProposalDiagnostics,
  PROTOCOL_INVARIANTS,
  type PatchProposalEvidenceArtifact,
  type StructuredPatchProposal,
} from './structured-patch-proposal.js';
import { getVersionPaths, validateVersionId } from './version-loop.js';

export const JSON_PATCH_SCHEMA_VERSION = '1' as const;

export type JsonPatchOperationKind = 'set' | 'remove' | 'add';

export type JsonPatchDiagnosticCategory =
  | 'blocker'
  | 'warning'
  | 'forbidden'
  | 'evidence'
  | 'scope';

export interface JsonPatchDiagnostic {
  category: JsonPatchDiagnosticCategory;
  message: string;
  field?: string;
  entry?: string;
}

export interface JsonPatchOperation {
  op: JsonPatchOperationKind;
  target_file: string;
  path: string;
  value?: unknown;
}

export interface DeterministicJsonPatch {
  schema_version: typeof JSON_PATCH_SCHEMA_VERSION;
  patch_id: string;
  proposal_id: string;
  target_version: string;
  governance: {
    human_governed: true;
    human_approved: boolean;
    explicit_apply_required: true;
    mutates_runtime_state: false;
  };
  evidence_artifacts: {
    trace: PatchProposalEvidenceArtifact;
    review: PatchProposalEvidenceArtifact;
    scorecard: PatchProposalEvidenceArtifact;
    acceptance?: PatchProposalEvidenceArtifact;
  };
  scope: {
    allowed_paths: string[];
    forbidden_changes: string[];
  };
  operations: JsonPatchOperation[];
  rationale: string;
}

export type JsonPatchMode = 'dry_run' | 'apply';

export interface JsonPatchFileSummary {
  target_file: string;
  changed: boolean;
  before_sha256: string;
  after_sha256: string;
  before_byte_length: number;
  after_byte_length: number;
  before_preview: string;
  after_preview: string;
  rollback_path?: string;
}

export interface JsonPatchApplicationReport {
  schema_version: typeof JSON_PATCH_SCHEMA_VERSION;
  patch_id: string;
  proposal_id: string;
  target_version: string;
  mode: JsonPatchMode;
  applied: boolean;
  ok: boolean;
  evidence_artifacts: DeterministicJsonPatch['evidence_artifacts'];
  file_summaries: JsonPatchFileSummary[];
  diagnostics: JsonPatchDiagnostic[];
  blockers: JsonPatchDiagnostic[];
  warnings: JsonPatchDiagnostic[];
  applied_at?: string;
}

export interface JsonPatchValidationResult {
  ok: boolean;
  diagnostics: JsonPatchDiagnostic[];
  blockers: JsonPatchDiagnostic[];
  warnings: JsonPatchDiagnostic[];
}

export class JsonPatchValidationError extends Error {
  readonly diagnostics: JsonPatchDiagnostic[];

  constructor(message: string, diagnostics: JsonPatchDiagnostic[] = []) {
    super(message);
    this.name = 'JsonPatchValidationError';
    this.diagnostics = diagnostics;
  }
}

export const JSON_PATCH_GLOBAL_ALLOWED_SURFACES = [
  { prefix: 'content/', extensions: ['.json'] as const },
  { prefix: 'src/agents/prompts/', extensions: ['.md'] as const },
] as const;

const FORBIDDEN_TARGET_PREFIXES = ['src/game/', 'src/harness/', 'node_modules/', 'runs/'] as const;
const FORBIDDEN_TARGET_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'] as const;

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
    pattern: /\binfinite\b.*\bfloor\b|\bunbounded\b.*\bplay\b/i,
    message: 'Must not add infinite floors or unbounded main play.',
  },
  {
    pattern: /\breal-?time\b|\btiming-?based\b/i,
    message: 'Must not add real-time or timing-based play.',
  },
  {
    pattern: /\bfree-?text\b.*\b(action|command|input)\b/i,
    message: 'Must not replace structured actions with free-text commands.',
  },
];

const FORBIDDEN_FEATURE_PATTERNS: ReadonlyArray<{ pattern: RegExp; feature: string }> = [
  { pattern: /\breal-?time\b/i, feature: FORBIDDEN_MVP_FEATURES[0] },
  { pattern: /\brequired\b.*\b(visual|image)\b/i, feature: FORBIDDEN_MVP_FEATURES[1] },
  { pattern: /\brequired\b.*\b(audio|voice|media)\b/i, feature: FORBIDDEN_MVP_FEATURES[2] },
  { pattern: /\binfinite\b.*\bfloor\b|\bno-?ending\b/i, feature: FORBIDDEN_MVP_FEATURES[3] },
  { pattern: /\bfree-?text\b.*\b(command|action|gameplay)\b/i, feature: FORBIDDEN_MVP_FEATURES[4] },
  { pattern: /\bexternal\b.*\bapi\b.*\b(gameplay|during play)\b/i, feature: FORBIDDEN_MVP_FEATURES[6] },
];

const normalizeRepoRelativePath = (entry: string): string =>
  entry.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');

const isSafeRepoRelativePath = (entry: string): boolean => {
  const normalized = normalizeRepoRelativePath(entry);
  return (
    normalized.length > 0 &&
    !path.posix.isAbsolute(normalized) &&
    !normalized.split('/').includes('..')
  );
};

const resolveRepoTargetPath = (repoRoot: string, targetFile: string): string => {
  if (!isSafeRepoRelativePath(targetFile)) {
    throw new JsonPatchValidationError(
      `Target file must be a safe repo-relative path: ${targetFile}`,
    );
  }
  return path.resolve(repoRoot, normalizeRepoRelativePath(targetFile));
};

export const pathMatchesAllowedPrefix = (targetPath: string, prefix: string): boolean => {
  const normalizedTarget = normalizeRepoRelativePath(targetPath);
  const normalizedPrefix = normalizeRepoRelativePath(prefix);
  if (normalizedPrefix.endsWith('/**')) {
    const base = normalizedPrefix.slice(0, -3);
    return normalizedTarget === base || normalizedTarget.startsWith(`${base}/`);
  }
  if (normalizedPrefix.endsWith('/')) {
    const base = normalizedPrefix.slice(0, -1);
    return normalizedTarget === base || normalizedTarget.startsWith(normalizedPrefix);
  }
  return normalizedTarget === normalizedPrefix || normalizedTarget.startsWith(`${normalizedPrefix}/`);
};

const fileIsReadable = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const resolveArtifactAbsolutePath = (runsRoot: string, artifactPath: string): string => {
  if (path.isAbsolute(artifactPath)) {
    return artifactPath;
  }
  return path.resolve(runsRoot, artifactPath);
};

const sha256 = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex');

const previewText = (content: string, maxLength = 240): string => {
  const compact = content.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength)}…`;
};

const decodePointerSegment = (segment: string): string =>
  segment.replace(/~1/g, '/').replace(/~0/g, '~');

export const parseJsonPointer = (pointer: string): string[] => {
  if (pointer === '' || pointer === '/') {
    return [];
  }
  if (!pointer.startsWith('/')) {
    throw new JsonPatchValidationError(`JSON pointer must start with "/": ${pointer}`);
  }
  return pointer
    .slice(1)
    .split('/')
    .map((segment) => decodePointerSegment(segment));
};

const getPointerParent = (
  document: unknown,
  segments: string[],
): { parent: unknown; key: string | number } => {
  if (segments.length === 0) {
    return { parent: undefined, key: '' };
  }

  let current: unknown = document;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (Array.isArray(current)) {
      const arrayIndex = segment === '-' ? current.length : Number(segment);
      if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex > current.length) {
        throw new JsonPatchValidationError(`Invalid array index in pointer: /${segments.join('/')}`);
      }
      current = current[arrayIndex];
      continue;
    }
    if (!current || typeof current !== 'object') {
      throw new JsonPatchValidationError(`Cannot traverse pointer: /${segments.join('/')}`);
    }
    current = (current as Record<string, unknown>)[segment];
  }

  const last = segments[segments.length - 1];
  if (Array.isArray(current)) {
    if (last === '-') {
      return { parent: current, key: current.length };
    }
    const arrayIndex = Number(last);
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex > current.length) {
      throw new JsonPatchValidationError(`Invalid array index in pointer: /${segments.join('/')}`);
    }
    return { parent: current, key: arrayIndex };
  }

  if (!current || typeof current !== 'object') {
    throw new JsonPatchValidationError(`Cannot traverse pointer: /${segments.join('/')}`);
  }

  return { parent: current, key: last };
};

const cloneDocument = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const applyJsonOperation = (document: unknown, operation: JsonPatchOperation): unknown => {
  const segments = parseJsonPointer(operation.path);
  const cloned = cloneDocument(document);

  if (segments.length === 0) {
    if (operation.op !== 'set') {
      throw new JsonPatchValidationError('Root-level patches support only "set" operations.');
    }
    return operation.value;
  }

  const { parent, key } = getPointerParent(cloned, segments);
  if (parent === undefined) {
    throw new JsonPatchValidationError(`Cannot resolve parent for pointer: ${operation.path}`);
  }

  if (Array.isArray(parent)) {
    const index = key as number;
    if (operation.op === 'set') {
      if (index === parent.length) {
        parent.push(operation.value);
      } else {
        parent[index] = operation.value;
      }
      return cloned;
    }
    if (operation.op === 'add') {
      parent.splice(index, 0, operation.value);
      return cloned;
    }
    if (operation.op === 'remove') {
      parent.splice(index, 1);
      return cloned;
    }
  }

  const record = parent as Record<string, unknown>;
  if (operation.op === 'set' || operation.op === 'add') {
    record[String(key)] = operation.value;
    return cloned;
  }
  if (operation.op === 'remove') {
    delete record[String(key)];
    return cloned;
  }

  throw new JsonPatchValidationError(`Unsupported operation: ${operation.op}`);
};

const applyMarkdownOperation = (content: string, operation: JsonPatchOperation): string => {
  const segments = parseJsonPointer(operation.path);
  if (operation.op !== 'set' || segments.length > 0) {
    throw new JsonPatchValidationError(
      'Markdown targets support only root-level set operations (path "/" or "").',
    );
  }
  if (typeof operation.value !== 'string') {
    throw new JsonPatchValidationError('Markdown set operations require a string value.');
  }
  return operation.value.endsWith('\n') ? operation.value : `${operation.value}\n`;
};

const isJsonTarget = (targetFile: string): boolean => targetFile.endsWith('.json');
const isMarkdownTarget = (targetFile: string): boolean => targetFile.endsWith('.md');

export const isGloballyAllowedPatchTarget = (targetFile: string): boolean => {
  if (!isSafeRepoRelativePath(targetFile)) {
    return false;
  }
  const normalized = normalizeRepoRelativePath(targetFile);
  for (const forbiddenPrefix of FORBIDDEN_TARGET_PREFIXES) {
    if (normalized === forbiddenPrefix || normalized.startsWith(forbiddenPrefix)) {
      return false;
    }
  }
  for (const extension of FORBIDDEN_TARGET_EXTENSIONS) {
    if (normalized.endsWith(extension)) {
      return false;
    }
  }
  return JSON_PATCH_GLOBAL_ALLOWED_SURFACES.some((surface) => {
    if (!normalized.startsWith(surface.prefix)) {
      return false;
    }
    return surface.extensions.some((extension) => normalized.endsWith(extension));
  });
};

const collectTextDiagnostics = (
  entries: string[],
  field: string,
): JsonPatchDiagnostic[] => {
  const diagnostics: JsonPatchDiagnostic[] = [];
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
  }
  return diagnostics;
};

const validatePatchedJsonDocument = (targetFile: string, document: unknown): JsonPatchDiagnostic[] => {
  const normalized = normalizeRepoRelativePath(targetFile);
  try {
    if (normalized === 'content/challenge-modes.json') {
      validateChallengeModesBundle(document);
      return [];
    }
    if (normalized === 'content/scenario-packs.json') {
      validateScenarioPacksManifest(document);
      return [];
    }
    if (normalized.startsWith('content/packs/') && normalized.endsWith('.json')) {
      validateScenarioPackContentOverlay(document, normalized);
      return [];
    }
    if (normalized.startsWith('content/') && normalized.endsWith('.json')) {
      if (!document || typeof document !== 'object' || Array.isArray(document)) {
        return [
          {
            category: 'blocker',
            field: 'operations',
            entry: normalized,
            message: `${normalized} must remain a JSON object after patching.`,
          },
        ];
      }
    }
    return [];
  } catch (error) {
    return [
      {
        category: 'blocker',
        field: 'operations',
        entry: normalized,
        message: error instanceof Error ? error.message : String(error),
      },
    ];
  }
};

const serializeJsonDocument = (document: unknown): string => stringifyDeterministicJson(document);

export const getJsonPatchReportPath = (runsRoot: string, targetVersion: string): string =>
  path.join(getVersionPaths(runsRoot, targetVersion).versionDir, 'json_patch_report.json');

export const getJsonPatchAuditLogPath = (runsRoot: string, targetVersion: string): string =>
  path.join(getVersionPaths(runsRoot, targetVersion).versionDir, 'json_patch_audit.jsonl');

export const getJsonPatchRollbackDir = (runsRoot: string, targetVersion: string): string =>
  path.join(getVersionPaths(runsRoot, targetVersion).versionDir, 'json_patch_rollback');

export const assertJsonPatchStructurallyValid = (value: unknown): value is DeterministicJsonPatch => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const patch = value as Partial<DeterministicJsonPatch>;
  const governance = patch.governance;
  const scope = patch.scope;
  const evidence = patch.evidence_artifacts;
  const hasArtifact = (artifact: unknown): artifact is PatchProposalEvidenceArtifact =>
    Boolean(
      artifact &&
        typeof artifact === 'object' &&
        typeof (artifact as PatchProposalEvidenceArtifact).kind === 'string' &&
        typeof (artifact as PatchProposalEvidenceArtifact).path === 'string',
    );
  const hasOperation = (operation: unknown): operation is JsonPatchOperation =>
    Boolean(
      operation &&
        typeof operation === 'object' &&
        ['set', 'remove', 'add'].includes((operation as JsonPatchOperation).op) &&
        typeof (operation as JsonPatchOperation).target_file === 'string' &&
        typeof (operation as JsonPatchOperation).path === 'string',
    );
  return (
    patch.schema_version === JSON_PATCH_SCHEMA_VERSION &&
    typeof patch.patch_id === 'string' &&
    typeof patch.proposal_id === 'string' &&
    typeof patch.target_version === 'string' &&
    governance?.human_governed === true &&
    typeof governance.human_approved === 'boolean' &&
    governance.explicit_apply_required === true &&
    governance.mutates_runtime_state === false &&
    hasArtifact(evidence?.trace) &&
    hasArtifact(evidence?.review) &&
    hasArtifact(evidence?.scorecard) &&
    (evidence?.acceptance === undefined || hasArtifact(evidence.acceptance)) &&
    Array.isArray(scope?.allowed_paths) &&
    scope.allowed_paths.every((entry) => typeof entry === 'string') &&
    Array.isArray(scope.forbidden_changes) &&
    scope.forbidden_changes.every((entry) => typeof entry === 'string') &&
    Array.isArray(patch.operations) &&
    patch.operations.length > 0 &&
    patch.operations.every(hasOperation) &&
    typeof patch.rationale === 'string'
  );
};

export const collectJsonPatchDiagnostics = async (
  patch: DeterministicJsonPatch,
  options: {
    repoRoot: string;
    runsRoot: string;
    proposal?: StructuredPatchProposal;
    verifyEvidenceFiles?: boolean;
    mode?: JsonPatchMode;
  },
): Promise<JsonPatchValidationResult> => {
  const diagnostics: JsonPatchDiagnostic[] = [];
  const verifyFiles = options.verifyEvidenceFiles ?? true;
  const mode = options.mode ?? 'dry_run';

  if (patch.schema_version !== JSON_PATCH_SCHEMA_VERSION) {
    diagnostics.push({
      category: 'blocker',
      field: 'schema_version',
      message: `Unsupported schema_version "${patch.schema_version}". Expected "${JSON_PATCH_SCHEMA_VERSION}".`,
    });
  }

  if (!patch.governance.human_governed || !patch.governance.explicit_apply_required) {
    diagnostics.push({
      category: 'blocker',
      field: 'governance',
      message: 'JSON patches must remain human-governed and require explicit apply mode.',
    });
  }

  if (patch.governance.mutates_runtime_state) {
    diagnostics.push({
      category: 'blocker',
      field: 'governance',
      message: 'JSON patches must not mutate runtime game state during play.',
    });
  }

  if (mode === 'apply' && !patch.governance.human_approved) {
    diagnostics.push({
      category: 'blocker',
      field: 'governance.human_approved',
      message: 'Apply mode requires governance.human_approved=true.',
    });
  }

  try {
    validateVersionId(patch.target_version);
  } catch (error) {
    diagnostics.push({
      category: 'blocker',
      field: 'target_version',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (patch.rationale.trim().length < 12) {
    diagnostics.push({
      category: 'blocker',
      field: 'rationale',
      message: 'rationale must explain why the patch is safe to apply.',
    });
  }

  if (patch.scope.allowed_paths.length === 0) {
    diagnostics.push({
      category: 'blocker',
      field: 'scope.allowed_paths',
      message: 'scope.allowed_paths must include at least one bounded prefix.',
    });
  }

  if (patch.operations.length === 0) {
    diagnostics.push({
      category: 'blocker',
      field: 'operations',
      message: 'At least one patch operation is required.',
    });
  }

  if (patch.operations.length > 12) {
    diagnostics.push({
      category: 'blocker',
      field: 'operations',
      message: `At most 12 operations are allowed (received ${patch.operations.length}).`,
    });
  }

  diagnostics.push(...collectTextDiagnostics([patch.rationale], 'rationale'));

  const proposal = options.proposal;
  if (proposal) {
    if (proposal.proposal_id !== patch.proposal_id) {
      diagnostics.push({
        category: 'blocker',
        field: 'proposal_id',
        message: `proposal_id mismatch: patch references ${patch.proposal_id} but proposal is ${proposal.proposal_id}.`,
      });
    }
    if (proposal.target_version !== patch.target_version) {
      diagnostics.push({
        category: 'blocker',
        field: 'target_version',
        message: `target_version mismatch between patch (${patch.target_version}) and proposal (${proposal.target_version}).`,
      });
    }
    const proposalValidation = await collectPatchProposalDiagnostics(proposal, {
      runsRoot: options.runsRoot,
      verifyEvidenceFiles: verifyFiles,
    });
    if (!proposalValidation.ok) {
      diagnostics.push({
        category: 'blocker',
        field: 'proposal',
        message: 'Linked patch proposal failed validation; resolve proposal blockers first.',
      });
    }
  } else {
    diagnostics.push({
      category: 'blocker',
      field: 'proposal',
      message: 'A validated StructuredPatchProposal must be supplied for JSON patch application.',
    });
  }

  const requiredArtifacts = [
    patch.evidence_artifacts.trace,
    patch.evidence_artifacts.review,
    patch.evidence_artifacts.scorecard,
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
      const absolutePath = resolveArtifactAbsolutePath(options.runsRoot, artifact.path);
      if (!(await fileIsReadable(absolutePath))) {
        diagnostics.push({
          category: 'blocker',
          field: `evidence_artifacts.${artifact.kind}`,
          message: `Missing required ${artifact.kind} evidence at ${artifact.path}.`,
        });
      }
    }
  }

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
  for (const invariant of PROTOCOL_INVARIANTS) {
    diagnostics.push({
      category: 'warning',
      message: invariant,
    });
  }

  const operationTargets = new Set<string>();
  for (const operation of patch.operations) {
    const targetFile = normalizeRepoRelativePath(operation.target_file);
    operationTargets.add(targetFile);

    if (!isSafeRepoRelativePath(operation.target_file)) {
      diagnostics.push({
        category: 'blocker',
        field: 'operations',
        entry: operation.target_file,
        message: `Target file must be a safe repo-relative path: ${operation.target_file}`,
      });
    }

    if (!isGloballyAllowedPatchTarget(targetFile)) {
      diagnostics.push({
        category: 'blocker',
        field: 'operations',
        entry: targetFile,
        message: `Target file is outside bounded JSON/Markdown patch surfaces: ${targetFile}`,
      });
    }

    if (
      !patch.scope.allowed_paths.some((allowedPath) => pathMatchesAllowedPrefix(targetFile, allowedPath))
    ) {
      diagnostics.push({
        category: 'blocker',
        field: 'operations',
        entry: targetFile,
        message: `Target file is outside patch scope.allowed_paths: ${targetFile}`,
      });
    }

    if (proposal && !proposal.scope.allowed_paths.some((allowedPath) => pathMatchesAllowedPrefix(targetFile, allowedPath))) {
      diagnostics.push({
        category: 'blocker',
        field: 'operations',
        entry: targetFile,
        message: `Target file is outside linked proposal scope: ${targetFile}`,
      });
    }

    let absoluteTarget: string;
    try {
      absoluteTarget = resolveRepoTargetPath(options.repoRoot, targetFile);
    } catch (error) {
      diagnostics.push({
        category: 'blocker',
        field: 'operations',
        entry: targetFile,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (!(await fileIsReadable(absoluteTarget))) {
      diagnostics.push({
        category: 'blocker',
        field: 'operations',
        entry: targetFile,
        message: `Target file does not exist: ${targetFile}`,
      });
      continue;
    }

    const serializedValue =
      operation.value === undefined ? '' : JSON.stringify(operation.value);
    diagnostics.push(
      ...collectTextDiagnostics(
        [serializedValue, operation.path],
        `operations.${operation.op}`,
      ),
    );

    let pointerSegments: string[] | undefined;
    try {
      pointerSegments = parseJsonPointer(operation.path);
    } catch (error) {
      diagnostics.push({
        category: 'blocker',
        field: 'operations.path',
        entry: operation.path,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    if (isJsonTarget(targetFile)) {
      if (operation.op === 'add' && !operation.path.endsWith('/-') && !/\/\d+$/.test(operation.path)) {
        diagnostics.push({
          category: 'warning',
          field: 'operations',
          entry: targetFile,
          message: 'JSON add operations should target an explicit index or "/-" append path.',
        });
      }
      if (operation.op !== 'remove' && operation.value === undefined) {
        diagnostics.push({
          category: 'blocker',
          field: 'operations',
          entry: targetFile,
          message: `${operation.op} requires a value for JSON target ${targetFile}.`,
        });
      }
    } else if (isMarkdownTarget(targetFile)) {
      if (operation.op !== 'set') {
        diagnostics.push({
          category: 'blocker',
          field: 'operations',
          entry: targetFile,
          message: 'Markdown targets support only set operations.',
        });
      }
      if (pointerSegments && pointerSegments.length > 0) {
        diagnostics.push({
          category: 'blocker',
          field: 'operations.path',
          entry: targetFile,
          message: 'Markdown targets support only root-level set operations.',
        });
      }
      if (typeof operation.value !== 'string') {
        diagnostics.push({
          category: 'blocker',
          field: 'operations',
          entry: targetFile,
          message: 'Markdown set operations require a string value.',
        });
      }
    } else {
      diagnostics.push({
        category: 'blocker',
        field: 'operations',
        entry: targetFile,
        message: `Unsupported target extension for ${targetFile}.`,
      });
    }
  }

  if (operationTargets.size !== patch.operations.length) {
    diagnostics.push({
      category: 'warning',
      field: 'operations',
      message: 'Multiple operations target the same file; they are applied in document order.',
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

export const formatJsonPatchValidationMessage = (result: JsonPatchValidationResult): string => {
  const formatDiagnostic = (diagnostic: JsonPatchDiagnostic): string => {
    const prefix = diagnostic.field
      ? `${diagnostic.category} (${diagnostic.field})`
      : diagnostic.category;
    const entry = diagnostic.entry ? ` "${diagnostic.entry}"` : '';
    return `- [${prefix}]${entry}: ${diagnostic.message}`;
  };

  if (result.ok) {
    const lines = ['JSON patch is valid for dry-run or explicit apply.'];
    if (result.diagnostics.length > 0) {
      lines.push('Diagnostics:');
      lines.push(...result.diagnostics.map(formatDiagnostic));
    }
    return lines.join('\n');
  }

  const lines = ['JSON patch validation failed:'];
  lines.push(...result.blockers.map(formatDiagnostic));
  return lines.join('\n');
};

export const validateDeterministicJsonPatch = async (
  patch: DeterministicJsonPatch,
  options: Parameters<typeof collectJsonPatchDiagnostics>[1],
): Promise<JsonPatchValidationResult> => {
  const result = await collectJsonPatchDiagnostics(patch, options);
  if (!result.ok) {
    throw new JsonPatchValidationError(formatJsonPatchValidationMessage(result), result.blockers);
  }
  return result;
};

const groupOperationsByTarget = (
  operations: JsonPatchOperation[],
): Map<string, JsonPatchOperation[]> => {
  const grouped = new Map<string, JsonPatchOperation[]>();
  for (const operation of operations) {
    const targetFile = normalizeRepoRelativePath(operation.target_file);
    const existing = grouped.get(targetFile) ?? [];
    existing.push({ ...operation, target_file: targetFile });
    grouped.set(targetFile, existing);
  }
  return grouped;
};

const applyOperationsToTarget = async (
  repoRoot: string,
  targetFile: string,
  operations: JsonPatchOperation[],
): Promise<{ before: string; after: string; document?: unknown }> => {
  const absoluteTarget = resolveRepoTargetPath(repoRoot, targetFile);
  const before = await readFile(absoluteTarget, 'utf8');

  if (isMarkdownTarget(targetFile)) {
    let current = before;
    for (const operation of operations) {
      current = applyMarkdownOperation(current, operation);
    }
    return { before, after: current };
  }

  let document: unknown = JSON.parse(before);
  for (const operation of operations) {
    document = applyJsonOperation(document, operation);
  }
  const schemaDiagnostics = validatePatchedJsonDocument(targetFile, document);
  if (schemaDiagnostics.length > 0) {
    throw new JsonPatchValidationError(
      schemaDiagnostics.map((entry) => entry.message).join('\n'),
      schemaDiagnostics,
    );
  }
  return { before, after: serializeJsonDocument(document), document };
};

export interface ApplyDeterministicJsonPatchOptions {
  repoRoot: string;
  runsRoot: string;
  proposal: StructuredPatchProposal;
  mode: JsonPatchMode;
  writeReport?: boolean;
  writeAuditLog?: boolean;
}

export const applyDeterministicJsonPatch = async (
  patch: DeterministicJsonPatch,
  options: ApplyDeterministicJsonPatchOptions,
): Promise<JsonPatchApplicationReport> => {
  const validation = await collectJsonPatchDiagnostics(patch, {
    repoRoot: options.repoRoot,
    runsRoot: options.runsRoot,
    proposal: options.proposal,
    verifyEvidenceFiles: true,
    mode: options.mode,
  });

  const report: JsonPatchApplicationReport = {
    schema_version: JSON_PATCH_SCHEMA_VERSION,
    patch_id: patch.patch_id,
    proposal_id: patch.proposal_id,
    target_version: patch.target_version,
    mode: options.mode,
    applied: false,
    ok: validation.ok,
    evidence_artifacts: patch.evidence_artifacts,
    file_summaries: [],
    diagnostics: validation.diagnostics,
    blockers: validation.blockers,
    warnings: validation.warnings,
  };

  if (!validation.ok) {
    return report;
  }

  const grouped = groupOperationsByTarget(patch.operations);
  const rollbackDir = getJsonPatchRollbackDir(options.runsRoot, patch.target_version);

  for (const [targetFile, operations] of grouped.entries()) {
    const { before, after } = await applyOperationsToTarget(options.repoRoot, targetFile, operations);
    const summary: JsonPatchFileSummary = {
      target_file: targetFile,
      changed: before !== after,
      before_sha256: sha256(before),
      after_sha256: sha256(after),
      before_byte_length: Buffer.byteLength(before, 'utf8'),
      after_byte_length: Buffer.byteLength(after, 'utf8'),
      before_preview: previewText(before),
      after_preview: previewText(after),
    };

    if (options.mode === 'apply' && summary.changed) {
      await mkdir(rollbackDir, { recursive: true });
      const rollbackName = targetFile.replace(/\//g, '__');
      const rollbackPath = path.join(rollbackDir, rollbackName);
      await writeFile(rollbackPath, before, 'utf8');
      summary.rollback_path = path.relative(options.runsRoot, rollbackPath);
      const absoluteTarget = resolveRepoTargetPath(options.repoRoot, targetFile);
      await writeFile(absoluteTarget, after, 'utf8');
    }

    report.file_summaries.push(summary);
  }

  report.applied = options.mode === 'apply';
  report.ok = true;
  if (options.mode === 'apply') {
    report.applied_at = new Date().toISOString();
  }

  if (options.writeReport) {
    const reportPath = getJsonPatchReportPath(options.runsRoot, patch.target_version);
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, stringifyDeterministicJson(report), 'utf8');
  }

  if (options.writeAuditLog && options.mode === 'apply') {
    const auditPath = getJsonPatchAuditLogPath(options.runsRoot, patch.target_version);
    await mkdir(path.dirname(auditPath), { recursive: true });
    const auditEntry = {
      patch_id: patch.patch_id,
      proposal_id: patch.proposal_id,
      applied_at: report.applied_at,
      changed_files: report.file_summaries.filter((entry) => entry.changed).map((entry) => entry.target_file),
    };
    const existing = (await fileIsReadable(auditPath))
      ? await readFile(auditPath, 'utf8')
      : '';
    await writeFile(auditPath, `${existing}${JSON.stringify(auditEntry)}\n`, 'utf8');
  }

  return report;
};
