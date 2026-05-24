import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  type NormalizedRestrictedSourcePatchOperation,
  type NormalizedRestrictedSourcePatchPlan,
  type RestrictedSourcePatchDiagnostic,
} from './patch-validator.js';

export type RestrictedSourcePatchApplyMode = 'dry-run' | 'apply';
export type RestrictedSourcePatchApplyStatus = 'applied' | 'dry-run' | 'blocked';

export interface RestrictedSourcePatchOperationSummary {
  path: string;
  kind: NormalizedRestrictedSourcePatchOperation['kind'];
  replacementBytes: number;
}

export interface RestrictedSourcePatchFileSummary {
  path: string;
  changed: boolean;
  existedBefore: boolean;
  beforeSha256: string | null;
  afterSha256: string;
  beforeBytes: number;
  afterBytes: number;
  rollbackPath?: string;
}

export interface RestrictedSourcePatchApplyReport {
  schemaVersion: 1;
  mode: RestrictedSourcePatchApplyMode;
  status: RestrictedSourcePatchApplyStatus;
  diagnostics: RestrictedSourcePatchDiagnostic[];
  operations: RestrictedSourcePatchOperationSummary[];
  files: RestrictedSourcePatchFileSummary[];
}

export interface RestrictedSourcePatchApplyInput {
  repoRoot: string;
  plan: NormalizedRestrictedSourcePatchPlan;
  evidenceDir?: string;
  mode?: RestrictedSourcePatchApplyMode;
}

interface PlannedFileWrite {
  path: string;
  absolutePath: string;
  beforeContent: string | null;
  afterContent: string;
  existedBefore: boolean;
}

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

const normalizePath = (entry: string): string =>
  entry.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');

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

const applyOperation = (content: string, operation: NormalizedRestrictedSourcePatchOperation): string => {
  const expected = operation.expected ?? '';
  switch (operation.kind) {
    case 'replace_exact':
      return content.replace(expected, operation.replacement);
    case 'insert_before_exact':
      return content.replace(expected, `${operation.replacement}${expected}`);
    case 'insert_after_exact':
      return content.replace(expected, `${expected}${operation.replacement}`);
    case 'create_file':
      return operation.replacement;
  }
};

const deterministicRollbackPath = (evidenceDir: string, targetPath: string): string => {
  const encoded = normalizePath(targetPath).replace(/[^a-zA-Z0-9._-]/g, '__');
  return path.join(evidenceDir, 'rollback', `${encoded}.before`);
};

const writeReport = async (
  evidenceDir: string | undefined,
  report: RestrictedSourcePatchApplyReport,
): Promise<void> => {
  if (!evidenceDir) {
    return;
  }
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(path.join(evidenceDir, 'patch-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const operationSummary = (
  operation: NormalizedRestrictedSourcePatchOperation,
): RestrictedSourcePatchOperationSummary => ({
  path: operation.path,
  kind: operation.kind,
  replacementBytes: operation.replacementBytes,
});

const buildFileSummary = (
  planned: PlannedFileWrite,
  evidenceDir: string | undefined,
): RestrictedSourcePatchFileSummary => {
  const beforeContent = planned.beforeContent ?? '';
  const afterContent = planned.afterContent;
  const summary: RestrictedSourcePatchFileSummary = {
    path: planned.path,
    changed: planned.beforeContent !== planned.afterContent,
    existedBefore: planned.existedBefore,
    beforeSha256: planned.beforeContent === null ? null : sha256(beforeContent),
    afterSha256: sha256(afterContent),
    beforeBytes: Buffer.byteLength(beforeContent, 'utf8'),
    afterBytes: Buffer.byteLength(afterContent, 'utf8'),
  };
  if (evidenceDir && planned.existedBefore && summary.changed) {
    summary.rollbackPath = deterministicRollbackPath(evidenceDir, planned.path);
  }
  return summary;
};

const blockedReport = async (
  input: RestrictedSourcePatchApplyInput,
  diagnostics: RestrictedSourcePatchDiagnostic[],
  files: RestrictedSourcePatchFileSummary[] = [],
): Promise<RestrictedSourcePatchApplyReport> => {
  const mode = input.mode ?? 'dry-run';
  const report: RestrictedSourcePatchApplyReport = {
    schemaVersion: 1,
    mode,
    status: 'blocked',
    diagnostics,
    operations: input.plan.operations.map(operationSummary),
    files,
  };
  await writeReport(input.evidenceDir, report);
  return report;
};

const precomputeFileWrites = async (
  input: RestrictedSourcePatchApplyInput,
): Promise<{ diagnostics: RestrictedSourcePatchDiagnostic[]; writes: PlannedFileWrite[] }> => {
  const diagnostics: RestrictedSourcePatchDiagnostic[] = [];
  const contentByPath = new Map<string, PlannedFileWrite>();

  for (const operation of input.plan.operations) {
    const normalizedPath = normalizePath(operation.path);
    const absolutePath = path.resolve(input.repoRoot, normalizedPath);
    const existing = contentByPath.get(normalizedPath);

    if (operation.kind === 'create_file') {
      if (existing) {
        diagnostics.push({
          code: 'existing_file',
          path: normalizedPath,
          message: 'create_file cannot target a file already changed earlier in the plan.',
        });
        continue;
      }
      try {
        await stat(absolutePath);
        diagnostics.push({ code: 'existing_file', path: normalizedPath, message: 'create_file target already exists.' });
        continue;
      } catch {
        contentByPath.set(normalizedPath, {
          path: normalizedPath,
          absolutePath,
          beforeContent: null,
          afterContent: operation.replacement,
          existedBefore: false,
        });
        continue;
      }
    }

    let currentContent: string;
    if (existing) {
      currentContent = existing.afterContent;
    } else {
      try {
        currentContent = await readFile(absolutePath, 'utf8');
      } catch {
        diagnostics.push({ code: 'missing_file', path: normalizedPath, message: 'Edit target file is missing.' });
        continue;
      }
    }

    const occurrences = countOccurrences(currentContent, operation.expected ?? '');
    if (occurrences === 0) {
      diagnostics.push({
        code: 'context_mismatch',
        path: normalizedPath,
        message: 'Expected text was not found exactly during apply preflight.',
      });
      continue;
    }
    if (occurrences > 1) {
      diagnostics.push({
        code: 'ambiguous_anchor',
        path: normalizedPath,
        message: 'Expected text matched more than once during apply preflight.',
      });
      continue;
    }

    const nextContent = applyOperation(currentContent, operation);
    contentByPath.set(normalizedPath, {
      path: normalizedPath,
      absolutePath,
      beforeContent: existing?.beforeContent ?? currentContent,
      afterContent: nextContent,
      existedBefore: true,
    });
  }

  return {
    diagnostics,
    writes: [...contentByPath.values()].sort((left, right) => left.path.localeCompare(right.path)),
  };
};

export const applyRestrictedSourcePatchPlan = async (
  input: RestrictedSourcePatchApplyInput,
): Promise<RestrictedSourcePatchApplyReport> => {
  const mode = input.mode ?? 'dry-run';
  if (input.plan.operations.some((operation) => typeof operation.replacementBytes !== 'number')) {
    return blockedReport(input, [
      {
        code: 'unknown_operation',
        message: 'Patch applier requires a normalized validator plan with replacement byte counts.',
      },
    ]);
  }

  const precomputed = await precomputeFileWrites(input);
  const files = precomputed.writes.map((planned) => buildFileSummary(planned, input.evidenceDir));
  if (precomputed.diagnostics.length > 0) {
    return blockedReport(input, precomputed.diagnostics, files);
  }

  const report: RestrictedSourcePatchApplyReport = {
    schemaVersion: 1,
    mode,
    status: mode === 'dry-run' ? 'dry-run' : 'applied',
    diagnostics: [],
    operations: input.plan.operations.map(operationSummary),
    files,
  };

  if (mode === 'apply') {
    if (input.evidenceDir) {
      await mkdir(path.join(input.evidenceDir, 'rollback'), { recursive: true });
      for (const planned of precomputed.writes) {
        if (planned.beforeContent !== null && planned.beforeContent !== planned.afterContent) {
          await writeFile(deterministicRollbackPath(input.evidenceDir, planned.path), planned.beforeContent, 'utf8');
        }
      }
    }
    for (const planned of precomputed.writes) {
      await mkdir(path.dirname(planned.absolutePath), { recursive: true });
      await writeFile(planned.absolutePath, planned.afterContent, 'utf8');
    }
  }

  await writeReport(input.evidenceDir, report);
  return report;
};
