import path from 'node:path';

import { applyFilePlan, previewPlannedFiles, writePlanPreview, writePlanSummary } from '../../core/file-plan.js';
import { buildPlanSummaryMarkdown, generateStarterPhasePlan } from '../../core/phase-plan-generator.js';
import { createRepoProfile } from '../../core/repo-profiler.js';
import { optionValue, requireOption, writeJson } from './shared.js';

const resolveOutputPath = (repoRoot: string, output: string): string =>
  path.isAbsolute(output) ? output : path.join(repoRoot, output);

const isPathInside = (child: string, parent: string): boolean => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

export const runPlanCommand = async (
  repoRoot: string,
  options: Record<string, string | boolean>,
): Promise<void> => {
  const idea = requireOption(options, 'idea');
  if (options.apply === true && options['dry-run'] === true) {
    throw new Error('Choose either --dry-run or --apply, not both.');
  }
  const dryRun = options.apply !== true;
  const force = options.force === true;
  const output = optionValue(options, 'output');
  const profile = await createRepoProfile(repoRoot);
  const plan = await generateStarterPhasePlan({ repoRoot, idea, profile });

  if (dryRun) {
    let previewOutputDir: string | undefined;
    let previewFiles: string[] | undefined;
    if (output) {
      previewOutputDir = resolveOutputPath(repoRoot, output);
      if (isPathInside(previewOutputDir, path.resolve(repoRoot))) {
        throw new Error('--dry-run --output must point outside --repo-root to avoid modifying target repo files.');
      }
      previewFiles = await writePlanPreview(plan.proposedFiles, previewOutputDir);
    }
    writeJson({
      schemaVersion: 1,
      status: 'planned',
      dryRun: true,
      idea: plan.idea,
      planQuality: plan.planQuality,
      proposedFiles: previewPlannedFiles(plan.proposedFiles),
      ...(previewOutputDir ? { previewOutputDir, previewFiles } : {}),
      recommendedNextActions: [
        'Review proposed files.',
        'Run with --apply to write them.',
        'Then run agentic status and agentic run --phase PHASE-01A --dry-run.',
      ],
    });
    return;
  }

  const { report, reportPath, planRunDir } = await applyFilePlan(repoRoot, plan.proposedFiles, { force });
  const summaryPath = await writePlanSummary(planRunDir, buildPlanSummaryMarkdown(plan, profile));
  const skippedFiles = report.files.filter((file) => file.action === 'skipped');
  writeJson({
    schemaVersion: 1,
    status: report.status,
    dryRun: false,
    idea: plan.idea,
    planQuality: plan.planQuality,
    reportPath,
    summaryPath,
    files: report.files,
    skippedFiles: skippedFiles.map((file) => file.path),
    recommendedNextActions:
      skippedFiles.length > 0
        ? [
            'Review skipped files in plan-application-report.json.',
            'Re-run with --force only if replacing generated placeholders is intended.',
            'Otherwise merge the proposed content manually before running phases.',
          ]
        : [
            'Review plan-application-report.json.',
            'Run agentic doctor --repo-root .',
            'Run agentic run --phase PHASE-01A --dry-run before enabling agents.',
          ],
  });
};
