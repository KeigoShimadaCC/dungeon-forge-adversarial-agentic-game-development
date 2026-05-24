import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { VersionSummary, VersionSummaryRun } from './version-loop.js';

export type EvidenceIntegrityArtifactKind = 'trace' | 'scorecard';
export type EvidenceIntegrityDiagnosticCode =
  | 'missing_source'
  | 'malformed_json'
  | 'mismatched_source';

export interface EvidenceIntegrityDiagnostic {
  code: EvidenceIntegrityDiagnosticCode;
  kind: EvidenceIntegrityArtifactKind;
  version: string;
  seed: string;
  persona: string;
  path: string;
  message: string;
}

export interface EvidenceIntegrityResult {
  ok: boolean;
  diagnostics: EvidenceIntegrityDiagnostic[];
}

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

const normalizeRunsRelativePath = (relativePath: string): string =>
  relativePath.replace(/\\/g, '/').replace(/^\.\//, '');

const resolveSourcePath = (runsRoot: string, relativePath: string): string => {
  const normalized = normalizeRunsRelativePath(relativePath);
  if (!normalized.startsWith('runs/')) {
    throw new Error(`Evidence source path must stay under runs/: ${relativePath}`);
  }
  if (normalized.includes('..')) {
    throw new Error(`Evidence source path must not contain .. segments: ${relativePath}`);
  }
  const absolutePath = path.resolve(runsRoot, normalized);
  const root = path.resolve(runsRoot);
  if (!absolutePath.startsWith(root + path.sep) && absolutePath !== root) {
    throw new Error(`Evidence source path escapes runs root: ${relativePath}`);
  }
  return absolutePath;
};

const readJsonSource = async (
  runsRoot: string,
  relativePath: string,
): Promise<{ status: 'missing' } | { status: 'malformed' } | { status: 'ok'; value: unknown }> => {
  const absolutePath = resolveSourcePath(runsRoot, relativePath);
  if (!(await fileExists(absolutePath))) {
    return { status: 'missing' };
  }
  try {
    return { status: 'ok', value: JSON.parse(await readFile(absolutePath, 'utf8')) };
  } catch {
    return { status: 'malformed' };
  }
};

const valueAt = (value: unknown, key: string): unknown =>
  value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;

const diagnostic = (
  code: EvidenceIntegrityDiagnosticCode,
  kind: EvidenceIntegrityArtifactKind,
  run: VersionSummaryRun,
  version: string,
  sourcePath: string,
  message: string,
): EvidenceIntegrityDiagnostic => ({
  code,
  kind,
  version,
  seed: run.seed,
  persona: run.persona,
  path: sourcePath,
  message,
});

const validateSource = async (
  runsRoot: string,
  run: VersionSummaryRun,
  version: string,
  kind: EvidenceIntegrityArtifactKind,
  sourcePath: string,
): Promise<EvidenceIntegrityDiagnostic[]> => {
  const parsed = await readJsonSource(runsRoot, sourcePath);
  if (parsed.status === 'missing') {
    return [
      diagnostic(
        'missing_source',
        kind,
        run,
        version,
        sourcePath,
        `${version}: missing ${kind} source ${sourcePath}`,
      ),
    ];
  }
  if (parsed.status === 'malformed') {
    return [
      diagnostic(
        'malformed_json',
        kind,
        run,
        version,
        sourcePath,
        `${version}: malformed ${kind} JSON ${sourcePath}`,
      ),
    ];
  }

  const mismatches: string[] = [];
  for (const [key, expected] of [
    ['version', version],
    ['seed', run.seed],
    ['persona', run.persona],
    ['result', run.result],
  ] as const) {
    if (valueAt(parsed.value, key) !== expected) {
      mismatches.push(`${key} expected ${expected}`);
    }
  }
  if (kind === 'scorecard' && valueAt(parsed.value, 'trace_path') !== run.trace_path) {
    mismatches.push(`trace_path expected ${run.trace_path}`);
  }

  if (mismatches.length === 0) {
    return [];
  }
  return [
    diagnostic(
      'mismatched_source',
      kind,
      run,
      version,
      sourcePath,
      `${version}: ${kind} source mismatch ${sourcePath} (${mismatches.join('; ')})`,
    ),
  ];
};

export const validateVersionEvidenceIntegrity = async (
  runsRoot: string,
  summary: VersionSummary,
): Promise<EvidenceIntegrityResult> => {
  const diagnostics = (
    await Promise.all(
      summary.runs.flatMap((run) => [
        validateSource(runsRoot, run, summary.version, 'trace', run.trace_path),
        validateSource(runsRoot, run, summary.version, 'scorecard', run.scorecard_path),
      ]),
    )
  ).flat();

  return {
    ok: diagnostics.length === 0,
    diagnostics,
  };
};
