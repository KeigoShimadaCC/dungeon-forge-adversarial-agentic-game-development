import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from './json.js';

export type PlannedFileAction = 'create' | 'overwrite';
export type AppliedFileAction = 'created' | 'overwritten' | 'skipped';

export interface PlannedFile {
  path: string;
  action: PlannedFileAction;
  contents: string;
}

export interface PlannedFilePreview {
  path: string;
  action: PlannedFileAction;
  preview: string;
}

export interface AppliedFile {
  path: string;
  action: AppliedFileAction;
  reason?: string;
}

export interface PlanApplicationReport {
  schemaVersion: 1;
  status: 'applied' | 'applied_with_skips';
  dryRun: false;
  appliedAt: string;
  repoRoot: string;
  force: boolean;
  files: AppliedFile[];
}

const exists = async (filePath: string): Promise<boolean> =>
  access(filePath)
    .then(() => true)
    .catch(() => false);

const assertSafeRelativePath = (relativePath: string): void => {
  if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..')) {
    throw new Error(`Unsafe planned file path: ${relativePath}`);
  }
};

export const previewPlannedFiles = (files: PlannedFile[]): PlannedFilePreview[] =>
  files.map((file) => ({
    path: file.path,
    action: file.action,
    preview: file.contents.slice(0, 2000),
  }));

export const writePlanPreview = async (files: PlannedFile[], outputDir: string): Promise<string[]> => {
  const written: string[] = [];
  for (const file of files) {
    assertSafeRelativePath(file.path);
    const target = path.join(outputDir, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.contents);
    written.push(target);
  }
  return written;
};

export const applyFilePlan = async (
  repoRootInput: string,
  files: PlannedFile[],
  options: { force?: boolean; timestamp?: string; appliedAt?: string } = {},
): Promise<{ report: PlanApplicationReport; reportPath: string; planRunDir: string }> => {
  const repoRoot = path.resolve(repoRootInput);
  const force = options.force === true;
  const timestamp = options.timestamp ?? new Date().toISOString().replace(/[:.]/g, '-');
  const appliedAt = options.appliedAt ?? new Date().toISOString();
  const appliedFiles: AppliedFile[] = [];

  for (const file of files) {
    assertSafeRelativePath(file.path);
    const target = path.join(repoRoot, file.path);
    const alreadyExists = await exists(target);
    if (alreadyExists && !force) {
      appliedFiles.push({
        path: file.path,
        action: 'skipped',
        reason: 'File exists. Re-run with --force to overwrite.',
      });
      continue;
    }

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.contents);
    appliedFiles.push({
      path: file.path,
      action: alreadyExists ? 'overwritten' : 'created',
    });
  }

  const report: PlanApplicationReport = {
    schemaVersion: 1,
    status: appliedFiles.some((file) => file.action === 'skipped') ? 'applied_with_skips' : 'applied',
    dryRun: false,
    appliedAt,
    repoRoot,
    force,
    files: appliedFiles,
  };
  const planRunDir = path.join(repoRoot, '.agentic', 'plan-runs', timestamp);
  const reportPath = path.join(planRunDir, 'plan-application-report.json');
  await mkdir(path.dirname(reportPath), { recursive: true });
  const existingReport = await readFile(reportPath, 'utf8').catch(() => undefined);
  if (existingReport !== stringifyDeterministicJson(report)) {
    await writeFile(reportPath, stringifyDeterministicJson(report));
  }
  return { report, reportPath, planRunDir };
};

export const writePlanSummary = async (
  planRunDir: string,
  contents: string,
): Promise<string> => {
  const summaryPath = path.join(planRunDir, 'plan-summary.md');
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, contents);
  return summaryPath;
};
