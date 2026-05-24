export const RESTRICTED_AGENT_SCHEMA_VERSION = 1 as const;

export const RESTRICTED_AGENT_ACTIONS = [
  'search_allowed',
  'read_file_range',
  'propose_patch',
  'request_check',
  'explain_blocker',
] as const;

export type RestrictedAgentAction = (typeof RESTRICTED_AGENT_ACTIONS)[number];

export const RESTRICTED_AGENT_PATCH_KINDS = [
  'replace_exact',
  'insert_before_exact',
  'insert_after_exact',
  'create_file',
] as const;

export type RestrictedAgentPatchKind = (typeof RESTRICTED_AGENT_PATCH_KINDS)[number];

export interface RestrictedAgentPatchIntent {
  path: string;
  kind: RestrictedAgentPatchKind;
  expected?: string;
  replacement: string;
}

export interface RestrictedAgentBlocker {
  code: string;
  message: string;
  evidence?: string;
}

export interface RestrictedAgentAvailableCommand {
  id: string;
  label: string;
  description: string;
}

export interface RestrictedAgentTurnInput {
  schemaVersion: typeof RESTRICTED_AGENT_SCHEMA_VERSION;
  phase: string;
  taskId: string;
  objective: string;
  allowedPaths: string[];
  forbiddenPaths: string[];
  relevantSnippets: Array<{
    path: string;
    startLine: number;
    endLine: number;
    text: string;
  }>;
  previousFailedChecks: Array<{
    commandId: string;
    summary: string;
  }>;
  patchBudget: {
    maxFiles: number;
    maxBytes: number;
  };
  availableCommands: RestrictedAgentAvailableCommand[];
}

export interface RestrictedAgentModelResponse {
  schemaVersion: typeof RESTRICTED_AGENT_SCHEMA_VERSION;
  phase: string;
  taskId: string;
  action: RestrictedAgentAction;
  rationale: string;
  patches?: RestrictedAgentPatchIntent[];
  requestedChecks?: string[];
  blockers?: RestrictedAgentBlocker[];
}

export type RestrictedAgentValidationCategory =
  | 'schema'
  | 'action'
  | 'command'
  | 'patch'
  | 'forbidden';

export interface RestrictedAgentValidationDiagnostic {
  category: RestrictedAgentValidationCategory;
  message: string;
  field?: string;
  entry?: string;
}

export type RestrictedAgentValidationResult =
  | {
      ok: true;
      response: RestrictedAgentModelResponse;
      diagnostics: RestrictedAgentValidationDiagnostic[];
    }
  | {
      ok: false;
      diagnostics: RestrictedAgentValidationDiagnostic[];
    };

export const isRestrictedAgentAction = (value: unknown): value is RestrictedAgentAction =>
  typeof value === 'string' &&
  (RESTRICTED_AGENT_ACTIONS as readonly string[]).includes(value);

export const isRestrictedAgentPatchKind = (value: unknown): value is RestrictedAgentPatchKind =>
  typeof value === 'string' &&
  (RESTRICTED_AGENT_PATCH_KINDS as readonly string[]).includes(value);
