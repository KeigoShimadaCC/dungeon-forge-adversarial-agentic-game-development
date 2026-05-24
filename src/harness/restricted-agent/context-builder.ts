import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_RESTRICTED_AGENT_COMMAND_REGISTRY } from './command-registry.js';
import {
  RESTRICTED_AGENT_SCHEMA_VERSION,
  type RestrictedAgentAvailableCommand,
  type RestrictedAgentTurnInput,
} from './schemas.js';

export type RestrictedAgentContextDiagnosticCode =
  | 'forbidden_path'
  | 'credential_path'
  | 'generated_evidence_path'
  | 'absolute_path'
  | 'parent_traversal'
  | 'missing_file'
  | 'binary_file'
  | 'oversized_file'
  | 'out_of_scope'
  | 'invalid_range'
  | 'budget_exhausted';

export interface RestrictedAgentContextDiagnostic {
  code: RestrictedAgentContextDiagnosticCode;
  message: string;
  path?: string;
}

export interface RestrictedAgentContextScope {
  repoRoot: string;
  phaseAllowedPaths: string[];
  taskAllowedPaths: string[];
  forbiddenPaths: string[];
}

export interface RestrictedAgentContextBudgets {
  maxSearchResults: number;
  maxSearchPreviewChars: number;
  maxSnippetLines: number;
  maxTotalSnippetLines: number;
  maxSnippetBytes: number;
  maxTotalSnippetBytes: number;
  maxReadableFileBytes: number;
}

export const DEFAULT_RESTRICTED_AGENT_CONTEXT_BUDGETS: RestrictedAgentContextBudgets = {
  maxSearchResults: 20,
  maxSearchPreviewChars: 160,
  maxSnippetLines: 80,
  maxTotalSnippetLines: 240,
  maxSnippetBytes: 12000,
  maxTotalSnippetBytes: 24000,
  maxReadableFileBytes: 256000,
};

export interface RestrictedAgentSnippetRequest {
  path: string;
  startLine: number;
  endLine: number;
}

export interface RestrictedAgentContextSnippet {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
}

export interface RestrictedAgentSearchResult {
  path: string;
  lineNumber: number;
  preview: string;
}

export interface RestrictedAgentContextExposure {
  path: string;
  startLine: number;
  endLine: number;
  byteLength: number;
}

export interface RestrictedAgentContextExposureReport {
  phase: string;
  taskId: string;
  exposed: RestrictedAgentContextExposure[];
  diagnostics: RestrictedAgentContextDiagnostic[];
}

export interface BuildRestrictedAgentContextInput {
  phase: string;
  taskId: string;
  objective: string;
  scope: RestrictedAgentContextScope;
  snippetRequests: RestrictedAgentSnippetRequest[];
  previousFailedChecks?: Array<{ commandId: string; summary: string }>;
  patchBudget: { maxFiles: number; maxBytes: number };
  availableCommands?: RestrictedAgentAvailableCommand[];
  budgets?: Partial<RestrictedAgentContextBudgets>;
}

export interface BuildRestrictedAgentContextResult {
  turnInput: RestrictedAgentTurnInput;
  exposureReport: RestrictedAgentContextExposureReport;
}

const mergeBudgets = (
  budgets: Partial<RestrictedAgentContextBudgets> = {},
): RestrictedAgentContextBudgets => ({
  ...DEFAULT_RESTRICTED_AGENT_CONTEXT_BUDGETS,
  ...budgets,
});

export const normalizeRestrictedAgentPath = (
  entry: string,
): { ok: true; path: string } | { ok: false; diagnostic: RestrictedAgentContextDiagnostic } => {
  const normalized = entry.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
  if (normalized.length === 0) {
    return {
      ok: false,
      diagnostic: { code: 'forbidden_path', message: 'Path must not be empty.', path: entry },
    };
  }
  if (path.posix.isAbsolute(normalized) || path.isAbsolute(entry)) {
    return {
      ok: false,
      diagnostic: { code: 'absolute_path', message: 'Absolute paths are not allowed.', path: entry },
    };
  }
  if (normalized.split('/').includes('..')) {
    return {
      ok: false,
      diagnostic: {
        code: 'parent_traversal',
        message: 'Parent traversal paths are not allowed.',
        path: entry,
      },
    };
  }
  return { ok: true, path: normalized };
};

const pathMatchesAllowedPattern = (entry: string, pattern: string): boolean => {
  const normalizedPattern = pattern.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
  if (normalizedPattern.endsWith('/**')) {
    const prefix = normalizedPattern.slice(0, -3);
    return entry === prefix || entry.startsWith(`${prefix}/`);
  }
  return entry === normalizedPattern;
};

const isForbiddenByPattern = (entry: string, patterns: readonly string[]): boolean =>
  patterns.some((pattern) => pathMatchesAllowedPattern(entry, pattern));

const credentialPathPattern = /(^|\/)(\.env|credentials?|secrets?|private)(\/|\.|$)/i;

export const diagnoseRestrictedAgentPath = (
  rawPath: string,
  scope: RestrictedAgentContextScope,
): RestrictedAgentContextDiagnostic[] => {
  const normalized = normalizeRestrictedAgentPath(rawPath);
  if (!normalized.ok) {
    return [normalized.diagnostic];
  }

  const diagnostics: RestrictedAgentContextDiagnostic[] = [];
  const targetPath = normalized.path;
  if (credentialPathPattern.test(targetPath)) {
    diagnostics.push({
      code: 'credential_path',
      message: 'Credential-like paths are never exposed to the model.',
      path: targetPath,
    });
  }
  if (targetPath.startsWith('runs/')) {
    diagnostics.push({
      code: 'generated_evidence_path',
      message: 'Generated evidence paths are not context-builder inputs.',
      path: targetPath,
    });
  }
  if (isForbiddenByPattern(targetPath, scope.forbiddenPaths)) {
    diagnostics.push({
      code: 'forbidden_path',
      message: 'Path is explicitly forbidden by the task scope.',
      path: targetPath,
    });
  }
  if (
    !scope.phaseAllowedPaths.some((allowedPath) =>
      pathMatchesAllowedPattern(targetPath, allowedPath),
    ) ||
    !scope.taskAllowedPaths.some((allowedPath) => pathMatchesAllowedPattern(targetPath, allowedPath))
  ) {
    diagnostics.push({
      code: 'out_of_scope',
      message: 'Path must be inside both phase allowed paths and accepted-task allowed paths.',
      path: targetPath,
    });
  }

  return diagnostics;
};

const resolveScopedPath = (
  rawPath: string,
  scope: RestrictedAgentContextScope,
): { ok: true; normalizedPath: string; absolutePath: string } | {
  ok: false;
  diagnostics: RestrictedAgentContextDiagnostic[];
} => {
  const normalized = normalizeRestrictedAgentPath(rawPath);
  if (!normalized.ok) {
    return { ok: false, diagnostics: [normalized.diagnostic] };
  }
  const diagnostics = diagnoseRestrictedAgentPath(normalized.path, scope);
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }
  const absolutePath = path.resolve(scope.repoRoot, normalized.path);
  const relativeBack = path.relative(scope.repoRoot, absolutePath).replace(/\\/g, '/');
  if (relativeBack.startsWith('../') || relativeBack === '..' || path.isAbsolute(relativeBack)) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'parent_traversal',
          message: 'Resolved path escapes the repository root.',
          path: normalized.path,
        },
      ],
    };
  }
  return { ok: true, normalizedPath: normalized.path, absolutePath };
};

const isBinaryBuffer = (buffer: Buffer): boolean => buffer.includes(0);

const linePreview = (line: string, maxChars: number): string => {
  const compact = line.replace(/\s+/g, ' ').trim();
  return compact.length <= maxChars ? compact : compact.slice(0, maxChars);
};

export const readRestrictedAgentFileRange = async (
  scope: RestrictedAgentContextScope,
  request: RestrictedAgentSnippetRequest,
  budgetsInput: Partial<RestrictedAgentContextBudgets> = {},
): Promise<{
  snippet?: RestrictedAgentContextSnippet;
  exposure?: RestrictedAgentContextExposure;
  diagnostics: RestrictedAgentContextDiagnostic[];
}> => {
  const budgets = mergeBudgets(budgetsInput);
  const resolved = resolveScopedPath(request.path, scope);
  if (!resolved.ok) {
    return { diagnostics: resolved.diagnostics };
  }
  if (
    !Number.isInteger(request.startLine) ||
    !Number.isInteger(request.endLine) ||
    request.startLine < 1 ||
    request.endLine < request.startLine
  ) {
    return {
      diagnostics: [
        {
          code: 'invalid_range',
          message: 'Line range must use positive integer start/end lines.',
          path: resolved.normalizedPath,
        },
      ],
    };
  }

  const requestedLines = request.endLine - request.startLine + 1;
  if (requestedLines > budgets.maxSnippetLines) {
    return {
      diagnostics: [
        {
          code: 'invalid_range',
          message: `Requested range exceeds maxSnippetLines ${budgets.maxSnippetLines}.`,
          path: resolved.normalizedPath,
        },
      ],
    };
  }

  let fileStat;
  try {
    fileStat = await stat(resolved.absolutePath);
  } catch {
    return {
      diagnostics: [
        {
          code: 'missing_file',
          message: 'Requested context file does not exist.',
          path: resolved.normalizedPath,
        },
      ],
    };
  }
  if (!fileStat.isFile()) {
    return {
      diagnostics: [
        {
          code: 'missing_file',
          message: 'Requested context path is not a file.',
          path: resolved.normalizedPath,
        },
      ],
    };
  }
  if (fileStat.size > budgets.maxReadableFileBytes) {
    return {
      diagnostics: [
        {
          code: 'oversized_file',
          message: `File exceeds maxReadableFileBytes ${budgets.maxReadableFileBytes}.`,
          path: resolved.normalizedPath,
        },
      ],
    };
  }

  const buffer = await readFile(resolved.absolutePath);
  if (isBinaryBuffer(buffer)) {
    return {
      diagnostics: [
        {
          code: 'binary_file',
          message: 'Binary files are not exposed to the model.',
          path: resolved.normalizedPath,
        },
      ],
    };
  }

  const lines = buffer.toString('utf8').split(/\r?\n/);
  const selected = lines.slice(request.startLine - 1, request.endLine);
  const text = selected.join('\n');
  const byteLength = Buffer.byteLength(text, 'utf8');
  if (byteLength > budgets.maxSnippetBytes) {
    return {
      diagnostics: [
        {
          code: 'budget_exhausted',
          message: `Snippet exceeds maxSnippetBytes ${budgets.maxSnippetBytes}.`,
          path: resolved.normalizedPath,
        },
      ],
    };
  }

  const actualEndLine = request.startLine + Math.max(selected.length - 1, 0);
  return {
    snippet: {
      path: resolved.normalizedPath,
      startLine: request.startLine,
      endLine: actualEndLine,
      text,
    },
    exposure: {
      path: resolved.normalizedPath,
      startLine: request.startLine,
      endLine: actualEndLine,
      byteLength,
    },
    diagnostics: [],
  };
};

const listAllowedFiles = async (
  scope: RestrictedAgentContextScope,
): Promise<{ files: string[]; diagnostics: RestrictedAgentContextDiagnostic[] }> => {
  const files = new Set<string>();
  const diagnostics: RestrictedAgentContextDiagnostic[] = [];

  const visit = async (relativePath: string) => {
    const resolved = resolveScopedPath(relativePath, scope);
    if (!resolved.ok) {
      diagnostics.push(...resolved.diagnostics);
      return;
    }
    let fileStat;
    try {
      fileStat = await stat(resolved.absolutePath);
    } catch {
      return;
    }
    if (fileStat.isFile()) {
      files.add(resolved.normalizedPath);
      return;
    }
    if (!fileStat.isDirectory()) {
      return;
    }
    const entries = await readdir(resolved.absolutePath, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      await visit(`${resolved.normalizedPath}/${entry.name}`);
    }
  };

  for (const allowedPath of scope.taskAllowedPaths) {
    if (allowedPath.endsWith('/**')) {
      await visit(allowedPath.slice(0, -3));
    } else {
      await visit(allowedPath);
    }
  }

  return { files: [...files].sort((left, right) => left.localeCompare(right)), diagnostics };
};

export const searchRestrictedAgentAllowed = async (
  scope: RestrictedAgentContextScope,
  query: string,
  budgetsInput: Partial<RestrictedAgentContextBudgets> = {},
): Promise<{ results: RestrictedAgentSearchResult[]; diagnostics: RestrictedAgentContextDiagnostic[] }> => {
  const budgets = mergeBudgets(budgetsInput);
  const trimmedQuery = query.trim().toLowerCase();
  if (trimmedQuery.length === 0) {
    return {
      results: [],
      diagnostics: [
        {
          code: 'invalid_range',
          message: 'Search query must not be empty.',
        },
      ],
    };
  }

  const listed = await listAllowedFiles(scope);
  const results: RestrictedAgentSearchResult[] = [];
  const diagnostics = [...listed.diagnostics];
  let totalPreviewBytes = 0;

  for (const filePath of listed.files) {
    if (results.length >= budgets.maxSearchResults) {
      break;
    }
    const resolved = resolveScopedPath(filePath, scope);
    if (!resolved.ok) {
      diagnostics.push(...resolved.diagnostics);
      continue;
    }
    const buffer = await readFile(resolved.absolutePath);
    if (isBinaryBuffer(buffer)) {
      diagnostics.push({
        code: 'binary_file',
        message: 'Binary files are skipped during search.',
        path: filePath,
      });
      continue;
    }
    const lines = buffer.toString('utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (results.length >= budgets.maxSearchResults) {
        return;
      }
      if (!line.toLowerCase().includes(trimmedQuery)) {
        return;
      }
      const preview = linePreview(line, budgets.maxSearchPreviewChars);
      const previewBytes = Buffer.byteLength(preview, 'utf8');
      if (totalPreviewBytes + previewBytes > budgets.maxTotalSnippetBytes) {
        diagnostics.push({
          code: 'budget_exhausted',
          message: `Search preview budget exceeded at ${budgets.maxTotalSnippetBytes} bytes.`,
          path: filePath,
        });
        return;
      }
      totalPreviewBytes += previewBytes;
      results.push({ path: filePath, lineNumber: index + 1, preview });
    });
  }

  return { results, diagnostics };
};

export const buildRestrictedAgentContext = async (
  input: BuildRestrictedAgentContextInput,
): Promise<BuildRestrictedAgentContextResult> => {
  const budgets = mergeBudgets(input.budgets);
  const requests = [...input.snippetRequests].sort((left, right) => {
    const pathCompare = left.path.localeCompare(right.path);
    if (pathCompare !== 0) {
      return pathCompare;
    }
    return left.startLine - right.startLine || left.endLine - right.endLine;
  });

  const snippets: RestrictedAgentContextSnippet[] = [];
  const exposures: RestrictedAgentContextExposure[] = [];
  const diagnostics: RestrictedAgentContextDiagnostic[] = [];
  let totalLines = 0;
  let totalBytes = 0;

  for (const request of requests) {
    const result = await readRestrictedAgentFileRange(input.scope, request, budgets);
    diagnostics.push(...result.diagnostics);
    if (!result.snippet || !result.exposure) {
      continue;
    }
    const lineCount = result.snippet.endLine - result.snippet.startLine + 1;
    if (totalLines + lineCount > budgets.maxTotalSnippetLines) {
      diagnostics.push({
        code: 'budget_exhausted',
        message: `Total snippet line budget exceeded at ${budgets.maxTotalSnippetLines} lines.`,
        path: result.snippet.path,
      });
      continue;
    }
    if (totalBytes + result.exposure.byteLength > budgets.maxTotalSnippetBytes) {
      diagnostics.push({
        code: 'budget_exhausted',
        message: `Total snippet byte budget exceeded at ${budgets.maxTotalSnippetBytes} bytes.`,
        path: result.snippet.path,
      });
      continue;
    }
    totalLines += lineCount;
    totalBytes += result.exposure.byteLength;
    snippets.push(result.snippet);
    exposures.push(result.exposure);
  }

  const availableCommands = input.availableCommands ?? Object.values(DEFAULT_RESTRICTED_AGENT_COMMAND_REGISTRY).map(
    ({ id, label, description }) => ({ id, label, description }),
  );

  return {
    turnInput: {
      schemaVersion: RESTRICTED_AGENT_SCHEMA_VERSION,
      phase: input.phase,
      taskId: input.taskId,
      objective: input.objective,
      allowedPaths: input.scope.taskAllowedPaths,
      forbiddenPaths: input.scope.forbiddenPaths,
      relevantSnippets: snippets,
      previousFailedChecks: input.previousFailedChecks ?? [],
      patchBudget: input.patchBudget,
      availableCommands,
    },
    exposureReport: {
      phase: input.phase,
      taskId: input.taskId,
      exposed: exposures,
      diagnostics,
    },
  };
};
