import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { applyFilePlan, previewPlannedFiles, writePlanPreview, writePlanSummary, type AppliedFile } from './file-plan.js';
import { buildPlanSummaryMarkdown, generateStarterPhasePlan, type PlanQuality } from './phase-plan-generator.js';
import { createRepoProfile, writeRepoProfile, type RepoProfile } from './repo-profiler.js';
import { runDoctor, type DoctorCheckStatus } from './doctor.js';
import { stringifyDeterministicJson } from './json.js';

export interface BoomOptions {
  idea: string;
  dryRun?: boolean;
  apply?: boolean;
  force?: boolean;
  output?: string;
  timestamp?: string;
  now?: Date;
}

export interface BoomDoctorSummary {
  status: DoctorCheckStatus;
  failCount: number;
  warnCount: number;
}

export interface BoomProfileSummary {
  packageManager: RepoProfile['packageManager'];
  languages: string[];
  frameworks: string[];
  validationCandidates: string[];
}

export interface BoomPlanSummary {
  proposedFileCount: number;
  proposedFiles: string[];
  planQuality: PlanQuality;
}

export interface BoomDryRunReport {
  schemaVersion: 1;
  status: 'planned';
  dryRun: true;
  idea: string;
  doctor: BoomDoctorSummary;
  repoProfile: BoomProfileSummary;
  plan: BoomPlanSummary;
  previewOutputDir?: string;
  previewFiles?: string[];
  recommendedNextActions: string[];
}

export interface BoomApplyReport {
  schemaVersion: 1;
  status: 'applied' | 'applied_with_skips';
  dryRun: false;
  idea: string;
  doctorStatusBefore: DoctorCheckStatus;
  doctor: BoomDoctorSummary;
  repoProfile: BoomProfileSummary;
  plan: BoomPlanSummary;
  profilePath: string;
  planApplicationReportPath: string;
  planSummaryPath: string;
  boomReportPath: string;
  files: AppliedFile[];
  skippedFiles: string[];
  recommendedNextActions: string[];
}

export type BoomReport = BoomDryRunReport | BoomApplyReport;

const isPathInside = (child: string, parent: string): boolean => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const resolveOutputPath = (repoRoot: string, output: string): string =>
  path.isAbsolute(output) ? output : path.join(repoRoot, output);

const summarizeDoctor = (status: DoctorCheckStatus, checks: Array<{ status: DoctorCheckStatus }>): BoomDoctorSummary => ({
  status,
  failCount: checks.filter((check) => check.status === 'fail').length,
  warnCount: checks.filter((check) => check.status === 'warn').length,
});

const summarizeProfile = (profile: RepoProfile): BoomProfileSummary => ({
  packageManager: profile.packageManager,
  languages: profile.languages,
  frameworks: profile.frameworks,
  validationCandidates: profile.validationCandidates,
});

const planSummary = (plan: Awaited<ReturnType<typeof generateStarterPhasePlan>>): BoomPlanSummary => ({
  proposedFileCount: plan.proposedFiles.length,
  proposedFiles: plan.proposedFiles.map((file) => file.path),
  planQuality: plan.planQuality,
});

const nextActionsForApply = (phase = 'PHASE-01A'): string[] => [
  'Review .agentic/boom-runs and .agentic/plan-runs reports.',
  `Run agentic run --repo-root . --phase ${phase} --mode manual --dry-run.`,
  `Run agentic run --repo-root . --phase ${phase} --mode supervised --agents shell when ready.`,
];

export const runBoom = async (
  repoRootInput: string,
  options: BoomOptions,
): Promise<BoomReport> => {
  const repoRoot = path.resolve(repoRootInput);
  const idea = options.idea.trim();
  if (!idea) throw new Error('--idea must not be empty');
  if (options.apply === true && options.dryRun === true) {
    throw new Error('Choose either --dry-run or --apply, not both.');
  }

  const doctor = await runDoctor(repoRoot);
  const profile = await createRepoProfile(repoRoot);
  const plan = await generateStarterPhasePlan({ repoRoot, idea, profile, now: options.now });
  const doctorSummary = summarizeDoctor(doctor.status, doctor.checks);
  const dryRun = options.apply !== true;

  if (dryRun) {
    const output = options.output;
    let previewOutputDir: string | undefined;
    let previewFiles: string[] | undefined;
    if (output) {
      previewOutputDir = resolveOutputPath(repoRoot, output);
      if (isPathInside(previewOutputDir, repoRoot)) {
        throw new Error('boom --dry-run --output must point outside --repo-root to avoid modifying target repo files.');
      }
      previewFiles = await writePlanPreview(plan.proposedFiles, previewOutputDir);
      await writeFile(
        path.join(previewOutputDir, 'boom-report.json'),
        stringifyDeterministicJson({
          schemaVersion: 1,
          status: 'planned',
          dryRun: true,
          idea,
          doctor: doctorSummary,
          repoProfile: summarizeProfile(profile),
          plan: planSummary(plan),
        }),
      );
    }
    return {
      schemaVersion: 1,
      status: 'planned',
      dryRun: true,
      idea,
      doctor: doctorSummary,
      repoProfile: summarizeProfile(profile),
      plan: planSummary(plan),
      ...(previewOutputDir ? { previewOutputDir, previewFiles } : {}),
      recommendedNextActions: [
        'Review proposed files.',
        `Run agentic boom --repo-root . --idea "${idea}" --apply to write them.`,
        'Run agentic run --repo-root . --phase PHASE-01A --mode manual --dry-run.',
      ],
    };
  }

  const timestamp = options.timestamp ?? new Date().toISOString().replace(/[:.]/g, '-');
  const profilePath = path.join(repoRoot, '.agentic', 'repo-profile.json');
  await writeRepoProfile(profile, profilePath);
  const { report, reportPath, planRunDir } = await applyFilePlan(repoRoot, plan.proposedFiles, {
    force: options.force === true,
    timestamp,
  });
  const planSummaryPath = await writePlanSummary(planRunDir, buildPlanSummaryMarkdown(plan, profile));
  const skippedFiles = report.files.filter((file) => file.action === 'skipped').map((file) => file.path);
  const boomRunDir = path.join(repoRoot, '.agentic', 'boom-runs', timestamp);
  const boomReportPath = path.join(boomRunDir, 'boom-report.json');
  const boomReport: BoomApplyReport = {
    schemaVersion: 1,
    status: report.status,
    dryRun: false,
    idea,
    doctorStatusBefore: doctor.status,
    doctor: doctorSummary,
    repoProfile: summarizeProfile(profile),
    plan: planSummary(plan),
    profilePath,
    planApplicationReportPath: reportPath,
    planSummaryPath,
    boomReportPath,
    files: report.files,
    skippedFiles,
    recommendedNextActions:
      skippedFiles.length > 0
        ? [
            'Review skipped files before running phases.',
            'Re-run boom with --apply --force only if replacing generated starter files is intended.',
            'Otherwise merge the proposed content manually.',
          ]
        : nextActionsForApply(),
  };
  await mkdir(boomRunDir, { recursive: true });
  await writeFile(boomReportPath, stringifyDeterministicJson(boomReport));
  return boomReport;
};
