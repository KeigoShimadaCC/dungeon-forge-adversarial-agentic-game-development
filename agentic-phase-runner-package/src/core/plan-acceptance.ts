import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from './json.js';
import type { PlannerReport } from '../evidence/agent-report-parser.js';
import type { PhaseDefinition } from './phase-runner.js';

export type PlanApprovalMode = 'auto' | 'manual' | 'disabled';

export interface PlanAcceptanceDecision {
  decision: 'accept' | 'block';
  reasons: string[];
  acceptedPlanPath?: string;
}

const FORBIDDEN_PLAN_TEXT = [
  'commit secrets',
  'edit .env',
  'skip validation',
  'bypass gate',
  'external service required',
];

const REQUIRED_SECRET_PATTERNS = [
  /\brequires?\s+(?:an?\s+)?(?:secret|credential|api key|token|\.env)\b/i,
  /\bneeds?\s+(?:an?\s+)?(?:secret|credential|api key|token|\.env)\b/i,
  /\bmust\s+(?:read|edit|write|create|load)\s+(?:secret|credential|\.env)\b/i,
  /\bexternal\s+service\s+required\b/i,
];

const NEGATED_FORBIDDEN_CONTEXT =
  /\b(?:avoid|avoids|avoiding|block|blocks|blocked|blocking|forbid|forbids|forbidden|forbidding|no|not|never|without|do not|does not|must not|should not|out of scope)\b/i;

const containsRequiredForbiddenText = (searchable: string, forbidden: string): boolean => {
  let index = searchable.indexOf(forbidden);
  while (index >= 0) {
    const contextStart = Math.max(0, index - 90);
    const context = searchable.slice(contextStart, index);
    if (!NEGATED_FORBIDDEN_CONTEXT.test(context)) {
      return true;
    }
    index = searchable.indexOf(forbidden, index + forbidden.length);
  }
  return false;
};

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
  phasePlanText = '',
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

  const acceptanceCriteria = parseAcceptanceCriteria(phasePlanText);
  if (acceptanceCriteria.length > 0) {
    const covered = new Set(
      (report.tasks ?? []).flatMap((task) =>
        (task.acceptanceCriteriaCovered ?? []).map((criterion) => normalizeCriterion(criterion)),
      ),
    );
    for (const criterion of acceptanceCriteria) {
      const candidates = [
        criterion.id,
        criterion.text,
        `${criterion.id}: ${criterion.text}`,
      ].map(normalizeCriterion);
      if (!candidates.some((candidate) => covered.has(candidate))) {
        reasons.push(`Acceptance criterion is not covered: ${criterion.id} ${criterion.text}`);
      }
    }
  }

  const searchable = JSON.stringify(report).toLowerCase();
  for (const forbidden of FORBIDDEN_PLAN_TEXT) {
    if (containsRequiredForbiddenText(searchable, forbidden)) {
      reasons.push(`Planner report contains forbidden or secret-related text: ${forbidden}`);
    }
  }
  for (const pattern of REQUIRED_SECRET_PATTERNS) {
    if (pattern.test(JSON.stringify(report))) {
      reasons.push(`Planner report appears to require secrets or external services: ${pattern.source}`);
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

export interface ParsedAcceptanceCriterion {
  id: string;
  text: string;
}

const normalizeCriterion = (value: string): string =>
  value.toLowerCase().replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();

export const parseAcceptanceCriteria = (phasePlanText: string): ParsedAcceptanceCriterion[] => {
  const lines = phasePlanText.split('\n');
  const start = lines.findIndex((line) => /^##\s+Acceptance Criteria\s*$/i.test(line.trim()));
  if (start < 0) {
    return [];
  }
  const criteria: ParsedAcceptanceCriterion[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (/^##\s+/.test(line)) {
      break;
    }
    const match = line.match(/^\s*-\s+(.*\S)\s*$/);
    if (match?.[1]) {
      criteria.push({
        id: `AC-${criteria.length + 1}`,
        text: match[1],
      });
    }
  }
  return criteria;
};
