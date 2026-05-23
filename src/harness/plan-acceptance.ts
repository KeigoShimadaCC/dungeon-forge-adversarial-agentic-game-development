import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from './json.js';
import type { PlannerReport } from './agent-report-parser.js';
import type { PhaseDefinition } from './phase-runner.js';

export type PlanApprovalMode = 'auto' | 'manual' | 'disabled';

export interface PlanAcceptanceDecision {
  decision: 'accept' | 'block';
  reasons: string[];
  acceptedPlanPath?: string;
}

const FORBIDDEN_PLAN_TEXT = [
  'real-time',
  'image-only',
  'required audio',
  'infinite floors',
  'free-text gameplay',
  'external api dependency during gameplay',
  '.env',
  'secret',
  'credential',
];

const pathBase = (scope: string): string => (scope.endsWith('/**') ? scope.slice(0, -3) : scope);

const isTaskPathAllowed = (phase: PhaseDefinition, taskPath: string): boolean => {
  const taskBase = pathBase(taskPath);
  return phase.allowedPaths.some((allowedPath) => {
    const allowedBase = pathBase(allowedPath);
    return (
      taskBase === allowedBase ||
      taskBase.startsWith(`${allowedBase}/`) ||
      (allowedPath.endsWith('/**') && taskPath === allowedBase)
    );
  });
};

export const validatePlannerReportForAcceptance = (
  phase: PhaseDefinition,
  report: PlannerReport | undefined,
  mode: PlanApprovalMode,
): PlanAcceptanceDecision => {
  const reasons: string[] = [];

  if (mode === 'disabled') {
    reasons.push('Plan acceptance is disabled.');
  }
  if (mode === 'manual') {
    reasons.push('Manual plan approval is required before execution.');
  }
  if (!report) {
    reasons.push('Planner report is missing.');
    return { decision: 'block', reasons };
  }
  if (report.phase !== phase.id) {
    reasons.push(`Planner phase mismatch: expected ${phase.id}, got ${report.phase}`);
  }
  if (report.status !== 'pass') {
    reasons.push(`Planner status is not pass: ${report.status}`);
  }
  if (report.planAcceptanceRecommendation !== 'accept') {
    reasons.push('Planner did not recommend accepting the plan.');
  }
  if ((report.questions ?? []).length > 0) {
    reasons.push('Planner reported unresolved questions.');
  }
  if (!Array.isArray(report.tasks) || report.tasks.length === 0) {
    reasons.push('Planner report has no tasks.');
  }
  if (!Array.isArray(report.requiredFocusedTests) || report.requiredFocusedTests.length === 0) {
    reasons.push('Planner report has no required focused tests.');
  }
  if (!Array.isArray(report.requiredSmokeCommands) || report.requiredSmokeCommands.length === 0) {
    reasons.push('Planner report has no required smoke commands.');
  }
  if (!Array.isArray(report.requiredArtifacts) || report.requiredArtifacts.length === 0) {
    reasons.push('Planner report has no required artifacts.');
  }

  for (const task of report.tasks ?? []) {
    if (!task.id?.trim()) {
      reasons.push('Planner task is missing id.');
    }
    if (!Array.isArray(task.allowedPaths) || task.allowedPaths.length === 0) {
      reasons.push(`Planner task ${task.id} has no allowed paths.`);
    }
    for (const taskPath of task.allowedPaths ?? []) {
      if (!isTaskPathAllowed(phase, taskPath)) {
        reasons.push(`Task ${task.id} touches path outside phase scope: ${taskPath}`);
      }
    }
    if (
      !Array.isArray(task.acceptanceCriteriaCovered) ||
      task.acceptanceCriteriaCovered.length === 0
    ) {
      reasons.push(`Planner task ${task.id} covers no acceptance criteria.`);
    }
  }

  const searchable = JSON.stringify(report).toLowerCase();
  for (const forbidden of FORBIDDEN_PLAN_TEXT) {
    if (searchable.includes(forbidden)) {
      reasons.push(`Planner report contains forbidden or secret-related text: ${forbidden}`);
    }
  }

  return { decision: reasons.length === 0 ? 'accept' : 'block', reasons };
};

export const writeAcceptedPlanArtifacts = async (
  evidenceDir: string,
  report: PlannerReport,
  decision: PlanAcceptanceDecision,
): Promise<PlanAcceptanceDecision> => {
  const acceptedPlanDir = path.join(evidenceDir, 'accepted-plan');
  await mkdir(acceptedPlanDir, { recursive: true });
  const acceptedPlanPath = path.join(acceptedPlanDir, 'accepted-plan.json');
  const approvedDecision: PlanAcceptanceDecision = {
    ...decision,
    acceptedPlanPath,
  };
  await writeFile(acceptedPlanPath, stringifyDeterministicJson(report));
  await writeFile(
    path.join(acceptedPlanDir, 'plan-approval.json'),
    stringifyDeterministicJson(approvedDecision),
  );
  await writeFile(
    path.join(acceptedPlanDir, 'accepted-plan.md'),
    [
      `# Accepted Plan - ${report.phase}`,
      '',
      report.summary ?? '',
      '',
      ...(report.tasks ?? []).map((task) => `- ${task.id}: ${task.title}`),
      '',
    ].join('\n'),
  );
  return approvedDecision;
};

export const readAcceptedPlanPath = (evidenceDir: string): string =>
  path.join(evidenceDir, 'accepted-plan', 'accepted-plan.json');
