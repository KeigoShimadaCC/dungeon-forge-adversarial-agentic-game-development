import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { scanTextForSecrets } from '../secret-scan.js';
import { isRestrictedAgentPatchKind, type RestrictedAgentPatchIntent } from './schemas.js';

export type RestrictedSourcePatchDiagnosticCode =
  | 'unknown_operation'
  | 'unsafe_path'
  | 'out_of_scope'
  | 'forbidden_path'
  | 'forbidden_file_type'
  | 'forbidden_dependency_change'
  | 'budget_exceeded'
  | 'missing_file'
  | 'existing_file'
  | 'context_mismatch'
  | 'ambiguous_anchor'
  | 'secret_like_content';

export interface RestrictedSourcePatchDiagnostic {
  code: RestrictedSourcePatchDiagnosticCode;
  message: string;
  path?: string;
  field?: string;
}

export interface RestrictedSourcePatchValidatorBudgets {
  maxFiles: number;
  maxOperations: number;
  maxReplacementBytes: number;
  maxTotalReplacementBytes: number;
}

export const DEFAULT_RESTRICTED_SOURCE_PATCH_BUDGETS: RestrictedSourcePatchValidatorBudgets = {
  maxFiles: 3,
  maxOperations: 6,
  maxReplacementBytes: 8000,
  maxTotalReplacementBytes: 16000,
};

export interface RestrictedSourcePatchValidationInput {
  repoRoot: string;
  phaseAllowedPaths: string[];
  taskAllowedPaths: string[];
  forbiddenPaths: string[];
  patches: unknown[];
  budgets?: Partial<RestrictedSourcePatchValidatorBudgets>;
}

export interface NormalizedRestrictedSourcePatchOperation {
  path: string;
  kind: RestrictedAgentPatchIntent['kind'];
  expected?: string;
  replacement: string;
  replacementBytes: number;
}

export interface NormalizedRestrictedSourcePatchPlan {
  operations: NormalizedRestrictedSourcePatchOperation[];
  budgets: RestrictedSourcePatchValidatorBudgets;
}

export interface RestrictedSourcePatchValidationResult {
  ok: boolean;
  plan?: NormalizedRestrictedSourcePatchPlan;
  diagnostics: RestrictedSourcePatchDiagnostic[];
}

const mergeBudgets = (
  budgets: Partial<RestrictedSourcePatchValidatorBudgets> = {},
): RestrictedSourcePatchValidatorBudgets => ({
  ...DEFAULT_RESTRICTED_SOURCE_PATCH_BUDGETS,
  ...budgets,
});

const normalizePath = (entry: string): string =>
  entry.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');

const pathMatches = (entry: string, pattern: string): boolean => {
  const normalizedPattern = normalizePath(pattern);
  if (normalizedPattern.endsWith('/**')) {
    const prefix = normalizedPattern.slice(0, -3);
    return entry === prefix || entry.startsWith(`${prefix}/`);
  }
  return entry === normalizedPattern;
};

const isSafeRelativePath = (entry: string): boolean => {
  const normalized = normalizePath(entry);
  return normalized.length > 0 && !path.posix.isAbsolute(normalized) && !normalized.split('/').includes('..');
};

const FORBIDDEN_PATH_PATTERNS: ReadonlyArray<{ pattern: RegExp; code: RestrictedSourcePatchDiagnosticCode; message: string }> = [
  { pattern: /(^|\/)\.env(\.|$|\/)?/, code: 'forbidden_path', message: 'Credential environment files are forbidden.' },
  { pattern: /(^|\/)(credentials?|secrets?|private)(\/|\.|$)/i, code: 'forbidden_path', message: 'Credential-like paths are forbidden.' },
  { pattern: /^runs\//, code: 'forbidden_path', message: 'Generated evidence paths are forbidden.' },
  { pattern: /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/, code: 'forbidden_dependency_change', message: 'Lockfile changes are forbidden.' },
  { pattern: /(^|\/)package\.json$/, code: 'forbidden_dependency_change', message: 'Dependency manifest changes are forbidden.' },
];

const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.txt']);

const countOccurrences = (content: string, needle: string): number => {
  if (needle.length === 0) {
    return 0;
  }
  let count = 0;
  let index = content.indexOf(needle);
  while (index >= 0) {
    count += 1;
    index = content.indexOf(needle, index + needle.length);
  }
  return count;
};

const asPatchIntent = (
  value: unknown,
  diagnostics: RestrictedSourcePatchDiagnostic[],
): RestrictedAgentPatchIntent | undefined => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    diagnostics.push({ code: 'unknown_operation', message: 'Patch intent must be an object.' });
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.path !== 'string' || record.path.trim().length === 0) {
    diagnostics.push({ code: 'unsafe_path', field: 'path', message: 'Patch path is required.' });
    return undefined;
  }
  if (!isRestrictedAgentPatchKind(record.kind)) {
    diagnostics.push({
      code: 'unknown_operation',
      path: record.path,
      field: 'kind',
      message: 'Unsupported restricted patch kind.',
    });
    return undefined;
  }
  if (typeof record.replacement !== 'string') {
    diagnostics.push({
      code: 'unknown_operation',
      path: record.path,
      field: 'replacement',
      message: 'Patch replacement is required.',
    });
    return undefined;
  }
  if (record.kind !== 'create_file' && typeof record.expected !== 'string') {
    diagnostics.push({
      code: 'context_mismatch',
      path: record.path,
      field: 'expected',
      message: 'Exact edit patches require expected text.',
    });
    return undefined;
  }
  return {
    path: record.path,
    kind: record.kind,
    ...(typeof record.expected === 'string' ? { expected: record.expected } : {}),
    replacement: record.replacement,
  };
};

const validatePathPolicy = (
  patchPath: string,
  input: RestrictedSourcePatchValidationInput,
): { normalizedPath: string; diagnostics: RestrictedSourcePatchDiagnostic[] } => {
  const normalizedPath = normalizePath(patchPath);
  const diagnostics: RestrictedSourcePatchDiagnostic[] = [];
  if (!isSafeRelativePath(normalizedPath)) {
    diagnostics.push({ code: 'unsafe_path', path: patchPath, message: 'Patch path must be safe and repo-relative.' });
  }
  if (
    !input.phaseAllowedPaths.some((allowedPath) => pathMatches(normalizedPath, allowedPath)) ||
    !input.taskAllowedPaths.some((allowedPath) => pathMatches(normalizedPath, allowedPath))
  ) {
    diagnostics.push({
      code: 'out_of_scope',
      path: normalizedPath,
      message: 'Patch path must be inside both phase and accepted-task allowed paths.',
    });
  }
  if (input.forbiddenPaths.some((forbiddenPath) => pathMatches(normalizedPath, forbiddenPath))) {
    diagnostics.push({ code: 'forbidden_path', path: normalizedPath, message: 'Patch path is explicitly forbidden.' });
  }
  for (const forbidden of FORBIDDEN_PATH_PATTERNS) {
    if (forbidden.pattern.test(normalizedPath)) {
      diagnostics.push({ code: forbidden.code, path: normalizedPath, message: forbidden.message });
    }
  }
  if (!ALLOWED_EXTENSIONS.has(path.extname(normalizedPath))) {
    diagnostics.push({
      code: 'forbidden_file_type',
      path: normalizedPath,
      message: 'Patch target extension is not approved for restricted source patches.',
    });
  }
  return { normalizedPath, diagnostics };
};

export const validateRestrictedSourcePatches = async (
  input: RestrictedSourcePatchValidationInput,
): Promise<RestrictedSourcePatchValidationResult> => {
  const budgets = mergeBudgets(input.budgets);
  const diagnostics: RestrictedSourcePatchDiagnostic[] = [];
  const normalizedOperations: NormalizedRestrictedSourcePatchOperation[] = [];
  const normalizedFiles = new Set<string>();
  let totalReplacementBytes = 0;

  if (input.patches.length > budgets.maxOperations) {
    diagnostics.push({
      code: 'budget_exceeded',
      message: `Patch operation count exceeds maxOperations ${budgets.maxOperations}.`,
    });
  }

  for (const rawPatch of input.patches) {
    const patch = asPatchIntent(rawPatch, diagnostics);
    if (!patch) {
      continue;
    }
    const pathPolicy = validatePathPolicy(patch.path, input);
    diagnostics.push(...pathPolicy.diagnostics);
    const normalizedPath = pathPolicy.normalizedPath;
    normalizedFiles.add(normalizedPath);

    const replacementBytes = Buffer.byteLength(patch.replacement, 'utf8');
    totalReplacementBytes += replacementBytes;
    if (replacementBytes > budgets.maxReplacementBytes) {
      diagnostics.push({
        code: 'budget_exceeded',
        path: normalizedPath,
        message: `Replacement exceeds maxReplacementBytes ${budgets.maxReplacementBytes}.`,
      });
    }
    for (const hit of scanTextForSecrets(patch.replacement, normalizedPath)) {
      diagnostics.push({
        code: 'secret_like_content',
        path: normalizedPath,
        message: `Replacement content matched secret scanner pattern: ${hit.split(': matched ')[1] ?? 'secret-like content'}`,
      });
    }

    const absolutePath = path.resolve(input.repoRoot, normalizedPath);
    if (patch.kind === 'create_file') {
      try {
        await stat(absolutePath);
        diagnostics.push({ code: 'existing_file', path: normalizedPath, message: 'create_file target already exists.' });
      } catch {
        normalizedOperations.push({ path: normalizedPath, kind: patch.kind, replacement: patch.replacement, replacementBytes });
      }
      continue;
    }

    let content: string;
    try {
      content = await readFile(absolutePath, 'utf8');
    } catch {
      diagnostics.push({ code: 'missing_file', path: normalizedPath, message: 'Edit target file is missing.' });
      continue;
    }
    const occurrences = countOccurrences(content, patch.expected ?? '');
    if (occurrences === 0) {
      diagnostics.push({ code: 'context_mismatch', path: normalizedPath, message: 'Expected text was not found exactly.' });
      continue;
    }
    if (occurrences > 1) {
      diagnostics.push({ code: 'ambiguous_anchor', path: normalizedPath, message: 'Expected text matched more than once.' });
      continue;
    }
    normalizedOperations.push({
      path: normalizedPath,
      kind: patch.kind,
      expected: patch.expected,
      replacement: patch.replacement,
      replacementBytes,
    });
  }

  if (normalizedFiles.size > budgets.maxFiles) {
    diagnostics.push({
      code: 'budget_exceeded',
      message: `Patch file count exceeds maxFiles ${budgets.maxFiles}.`,
    });
  }
  if (totalReplacementBytes > budgets.maxTotalReplacementBytes) {
    diagnostics.push({
      code: 'budget_exceeded',
      message: `Patch replacement total exceeds maxTotalReplacementBytes ${budgets.maxTotalReplacementBytes}.`,
    });
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }
  return { ok: true, plan: { operations: normalizedOperations, budgets }, diagnostics: [] };
};
