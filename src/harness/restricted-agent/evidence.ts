import type {
  RestrictedAgentModelResponse,
  RestrictedAgentTurnInput,
  RestrictedAgentValidationDiagnostic,
} from './schemas.js';

export const RESTRICTED_AGENT_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type RestrictedAgentEvidenceDecision = 'accepted' | 'blocked';

export interface RestrictedAgentEvidenceRecord {
  schemaVersion: typeof RESTRICTED_AGENT_EVIDENCE_SCHEMA_VERSION;
  phase: string;
  taskId: string;
  action: string;
  decision: RestrictedAgentEvidenceDecision;
  exposedContext: Array<{
    path: string;
    startLine: number;
    endLine: number;
  }>;
  requestedChecks: string[];
  patchPaths: string[];
  diagnostics: RestrictedAgentValidationDiagnostic[];
}

export const buildRestrictedAgentEvidenceRecord = (options: {
  turnInput: RestrictedAgentTurnInput;
  response?: RestrictedAgentModelResponse;
  diagnostics?: RestrictedAgentValidationDiagnostic[];
}): RestrictedAgentEvidenceRecord => ({
  schemaVersion: RESTRICTED_AGENT_EVIDENCE_SCHEMA_VERSION,
  phase: options.turnInput.phase,
  taskId: options.turnInput.taskId,
  action: options.response?.action ?? 'invalid_response',
  decision: (options.diagnostics?.length ?? 0) > 0 ? 'blocked' : 'accepted',
  exposedContext: options.turnInput.relevantSnippets.map((snippet) => ({
    path: snippet.path,
    startLine: snippet.startLine,
    endLine: snippet.endLine,
  })),
  requestedChecks: options.response?.requestedChecks ?? [],
  patchPaths: options.response?.patches?.map((patch) => patch.path) ?? [],
  diagnostics: options.diagnostics ?? [],
});
