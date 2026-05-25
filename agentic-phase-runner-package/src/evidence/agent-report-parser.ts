export type AgentReportRole = 'planner' | 'executor' | 'rechecker' | 'cursor-subtask';

export type AgentReportStatus = 'pass' | 'blocked' | 'fail';

export interface AgentStructuredReportBase {
  schemaVersion: number;
  phase: string;
  status: AgentReportStatus;
}

export interface PlannerReport extends AgentStructuredReportBase {
  summary?: string;
  tasks?: Array<{
    id: string;
    title: string;
    description: string;
    allowedPaths: string[];
    acceptanceCriteriaCovered: string[];
    cursorDelegation?: {
      recommended: boolean;
      reason: string;
    };
  }>;
  requiredFocusedTests?: string[];
  requiredSmokeCommands?: string[];
  requiredArtifacts?: string[];
  risks?: string[];
  questions?: unknown[];
  planAcceptanceRecommendation?: 'accept' | 'block';
}

export interface ExecutorReport extends AgentStructuredReportBase {
  summary?: string;
  filesChanged?: string[];
  commandsRun?: Array<{ command: string; status: string }>;
  tasksCompleted?: string[];
  cursorTasks?: string[];
  gaps?: Array<{ severity?: string; summary?: string; recordedInProgress?: boolean }>;
}

export interface CursorSubtaskReport extends AgentStructuredReportBase {
  taskId?: string;
  summary?: string;
  filesChanged?: string[];
  commandsRun?: Array<{ command: string; status: string }>;
  gaps?: Array<{ severity?: string; summary?: string }>;
}

export interface RecheckerReport extends AgentStructuredReportBase {
  phaseAcceptanceComplete?: boolean;
  filesChangedDuringRecheck?: string[];
  commandsRun?: Array<{ command: string; status: string }>;
  gaps?: Array<{ severity?: string; summary?: string; recordedInProgress?: boolean }>;
  blockingGaps?: string[];
}

export type AgentStructuredReport =
  | PlannerReport
  | ExecutorReport
  | CursorSubtaskReport
  | RecheckerReport;

export interface AgentReportParseResult {
  ok: boolean;
  report?: AgentStructuredReport;
  errors: string[];
}

const extractJsonBlocks = (text: string): string[] => {
  const blocks: string[] = [];
  const fenceMatches = text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  for (const match of fenceMatches) {
    const body = match[1]?.trim();
    if (body) {
      blocks.push(body);
    }
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    blocks.push(text.slice(firstBrace, lastBrace + 1));
  }

  return blocks;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const validateBase = (value: Record<string, unknown>, expectedPhase?: string): string[] => {
  const errors: string[] = [];
  if (value.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1');
  }
  if (typeof value.phase !== 'string' || value.phase.length === 0) {
    errors.push('phase must be a non-empty string');
  } else if (expectedPhase && value.phase !== expectedPhase) {
    errors.push(`phase must match ${expectedPhase}`);
  }
  if (value.status !== 'pass' && value.status !== 'blocked' && value.status !== 'fail') {
    errors.push('status must be pass, blocked, or fail');
  }
  return errors;
};

export const parseAgentStructuredReport = (
  text: string,
  role: AgentReportRole,
  expectedPhase?: string,
): AgentReportParseResult => {
  const errors: string[] = [];
  for (const block of extractJsonBlocks(text)) {
    try {
      const parsed: unknown = JSON.parse(block);
      if (!isRecord(parsed)) {
        errors.push('report must be a JSON object');
        continue;
      }
      const blockErrors = validateBase(parsed, expectedPhase);
      if (blockErrors.length > 0) {
        errors.push(...blockErrors);
        continue;
      }
      return {
        ok: true,
        report: parsed as unknown as AgentStructuredReport,
        errors: [],
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (role === 'rechecker' && /\bPASS\b/i.test(text) && !/\bBLOCKED\b/i.test(text)) {
    return {
      ok: true,
      report: {
        schemaVersion: 1,
        phase: expectedPhase ?? 'UNKNOWN',
        status: 'pass',
        phaseAcceptanceComplete: true,
        blockingGaps: [],
      } satisfies RecheckerReport,
      errors: [],
    };
  }

  if (role === 'rechecker' && /\bBLOCKED\b/i.test(text)) {
    return {
      ok: true,
      report: {
        schemaVersion: 1,
        phase: expectedPhase ?? 'UNKNOWN',
        status: 'blocked',
        phaseAcceptanceComplete: false,
        blockingGaps: ['Recheck agent returned BLOCKED'],
      } satisfies RecheckerReport,
      errors: [],
    };
  }

  return {
    ok: false,
    errors: errors.length > 0 ? errors : ['No valid structured JSON report found'],
  };
};

export const recheckStatusFromReport = (
  report: AgentStructuredReport | undefined,
): 'pass' | 'blocked' | 'not_run' => {
  if (!report) {
    return 'not_run';
  }
  if (report.status === 'pass') {
    return 'pass';
  }
  if (report.status === 'blocked' || report.status === 'fail') {
    return 'blocked';
  }
  return 'not_run';
};

export const phaseAcceptanceFromRecheck = (report: AgentStructuredReport | undefined): boolean => {
  if (!report || !('phaseAcceptanceComplete' in report)) {
    return false;
  }
  return report.phaseAcceptanceComplete === true && report.status === 'pass';
};

export const blockingGapsFromRecheck = (report: AgentStructuredReport | undefined): string[] => {
  if (!report || !('blockingGaps' in report)) {
    return [];
  }
  const gaps = report.blockingGaps;
  return Array.isArray(gaps) ? gaps.filter((gap): gap is string => typeof gap === 'string') : [];
};
