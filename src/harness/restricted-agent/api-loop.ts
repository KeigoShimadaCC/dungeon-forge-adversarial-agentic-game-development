import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from '../json.js';
import { createOpenAiCompatibleChatClient, type LlmChatCompletionClient } from '../llm-provider.js';
import { resolveLlmProviderConfig, type LlmCredentialResolution } from '../llm-provider-config.js';
import {
  buildRestrictedAgentEvidenceRecord,
  type RestrictedAgentEvidenceRecord,
} from './evidence.js';
import {
  validateRestrictedAgentModelResponse,
  type RestrictedAgentResponseValidationOptions,
} from './validation.js';
import type {
  RestrictedAgentModelResponse,
  RestrictedAgentTurnInput,
  RestrictedAgentValidationDiagnostic,
} from './schemas.js';

export type RestrictedAgentDryRunProviderMode = 'fake' | 'real';
export type RestrictedAgentDryRunDecisionStatus = 'accepted' | 'blocked';

export interface RestrictedAgentPromptContext {
  phase: string;
  taskId: string;
  objective: string;
  allowedPaths: string[];
  forbiddenPaths: string[];
  snippetRanges: Array<{ path: string; startLine: number; endLine: number }>;
  previousFailedChecks: Array<{ commandId: string; summary: string }>;
  patchBudget: { maxFiles: number; maxBytes: number };
  availableCommandIds: string[];
}

export interface RestrictedAgentDryRunDecision {
  schemaVersion: 1;
  phase: string;
  taskId: string;
  provider: RestrictedAgentDryRunProviderMode;
  status: RestrictedAgentDryRunDecisionStatus;
  action?: string;
  evidence: {
    promptContextPath: string;
    rawResponsePath: string;
    parsedResponsePath?: string;
    validationDiagnosticsPath: string;
    dryRunDecisionPath: string;
  };
  diagnostics: RestrictedAgentValidationDiagnostic[];
}

export interface RestrictedAgentDryRunResult {
  decision: RestrictedAgentDryRunDecision;
  promptContext: RestrictedAgentPromptContext;
  rawResponse: string;
  parsedResponse?: RestrictedAgentModelResponse;
  validationDiagnostics: RestrictedAgentValidationDiagnostic[];
  modelEvidence?: RestrictedAgentEvidenceRecord;
}

export interface RestrictedAgentDryRunOptions {
  turnInput: RestrictedAgentTurnInput;
  outDir: string;
  providerMode: RestrictedAgentDryRunProviderMode;
  client?: LlmChatCompletionClient;
  fakeResponse?: string;
  env?: NodeJS.ProcessEnv;
  validationOptions?: RestrictedAgentResponseValidationOptions;
}

export const buildRestrictedAgentPromptContext = (
  turnInput: RestrictedAgentTurnInput,
): RestrictedAgentPromptContext => ({
  phase: turnInput.phase,
  taskId: turnInput.taskId,
  objective: turnInput.objective,
  allowedPaths: turnInput.allowedPaths,
  forbiddenPaths: turnInput.forbiddenPaths,
  snippetRanges: turnInput.relevantSnippets.map((snippet) => ({
    path: snippet.path,
    startLine: snippet.startLine,
    endLine: snippet.endLine,
  })),
  previousFailedChecks: turnInput.previousFailedChecks,
  patchBudget: turnInput.patchBudget,
  availableCommandIds: turnInput.availableCommands.map((command) => command.id),
});

export const buildRestrictedAgentPrompt = (turnInput: RestrictedAgentTurnInput): string =>
  stringifyDeterministicJson({
    instruction: 'Return one raw strict JSON object only. Do not use Markdown fences or prose.',
    turnInput,
  });

export const parseRestrictedAgentStrictJsonResponse = (
  rawResponse: string,
): { ok: true; value: unknown } | { ok: false; diagnostic: RestrictedAgentValidationDiagnostic } => {
  const trimmed = rawResponse.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return {
      ok: false,
      diagnostic: {
        category: 'schema',
        field: 'rawResponse',
        message: 'Restricted-agent response must be one raw JSON object with no prose or fences.',
      },
    };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (error) {
    return {
      ok: false,
      diagnostic: {
        category: 'schema',
        field: 'rawResponse',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
};

const buildPhaseTaskDiagnostics = (
  turnInput: RestrictedAgentTurnInput,
  response: RestrictedAgentModelResponse,
): RestrictedAgentValidationDiagnostic[] => {
  const diagnostics: RestrictedAgentValidationDiagnostic[] = [];
  if (response.phase !== turnInput.phase) {
    diagnostics.push({
      category: 'schema',
      field: 'phase',
      message: `Response phase ${response.phase} does not match turn phase ${turnInput.phase}.`,
      entry: response.phase,
    });
  }
  if (response.taskId !== turnInput.taskId) {
    diagnostics.push({
      category: 'schema',
      field: 'taskId',
      message: `Response taskId ${response.taskId} does not match turn taskId ${turnInput.taskId}.`,
      entry: response.taskId,
    });
  }
  return diagnostics;
};

export const validateRestrictedAgentDryRunResponse = (
  rawResponse: string,
  turnInput: RestrictedAgentTurnInput,
  options: RestrictedAgentResponseValidationOptions = {},
): {
  parsedResponse?: RestrictedAgentModelResponse;
  diagnostics: RestrictedAgentValidationDiagnostic[];
} => {
  const parsed = parseRestrictedAgentStrictJsonResponse(rawResponse);
  if (!parsed.ok) {
    return { diagnostics: [parsed.diagnostic] };
  }

  const validated = validateRestrictedAgentModelResponse(parsed.value, options);
  if (!validated.ok) {
    return { diagnostics: validated.diagnostics };
  }

  const phaseTaskDiagnostics = buildPhaseTaskDiagnostics(turnInput, validated.response);
  return {
    parsedResponse: phaseTaskDiagnostics.length === 0 ? validated.response : undefined,
    diagnostics: phaseTaskDiagnostics,
  };
};

export const createRestrictedAgentFakeClient = (response: string): LlmChatCompletionClient => ({
  async complete() {
    return response;
  },
});

const missingCredentialDiagnostics = (
  resolved: LlmCredentialResolution,
): RestrictedAgentValidationDiagnostic[] =>
  resolved.ok
    ? []
    : [
        {
          category: 'schema',
          field: 'provider',
          message: resolved.message,
        },
      ];

const resolveDryRunClient = (
  options: RestrictedAgentDryRunOptions,
): { client?: LlmChatCompletionClient; diagnostics: RestrictedAgentValidationDiagnostic[] } => {
  if (options.client) {
    return { client: options.client, diagnostics: [] };
  }
  if (options.providerMode === 'fake') {
    return {
      client: createRestrictedAgentFakeClient(options.fakeResponse ?? buildDefaultFakeResponse(options.turnInput)),
      diagnostics: [],
    };
  }

  const resolved = resolveLlmProviderConfig(options.env);
  if (!resolved.ok) {
    return { diagnostics: missingCredentialDiagnostics(resolved) };
  }
  return { client: createOpenAiCompatibleChatClient(resolved.config), diagnostics: [] };
};

export const buildDefaultFakeResponse = (turnInput: RestrictedAgentTurnInput): string =>
  stringifyDeterministicJson({
    schemaVersion: 1,
    phase: turnInput.phase,
    taskId: turnInput.taskId,
    action: 'request_check',
    rationale: 'Dry-run fake provider requests a whitelisted focused check.',
    requestedChecks: ['focused_tests'],
  });

const writeEvidence = async (
  outDir: string,
  evidence: {
    promptContext: RestrictedAgentPromptContext;
    rawResponse: string;
    parsedResponse?: RestrictedAgentModelResponse;
    diagnostics: RestrictedAgentValidationDiagnostic[];
    decision: RestrictedAgentDryRunDecision;
  },
) => {
  await mkdir(outDir, { recursive: true });
  const paths = {
    promptContextPath: path.join(outDir, 'prompt-context.json'),
    rawResponsePath: path.join(outDir, 'raw-response.txt'),
    parsedResponsePath: evidence.parsedResponse
      ? path.join(outDir, 'parsed-response.json')
      : undefined,
    validationDiagnosticsPath: path.join(outDir, 'validation-diagnostics.json'),
    dryRunDecisionPath: path.join(outDir, 'dry-run-decision.json'),
  };

  await writeFile(paths.promptContextPath, stringifyDeterministicJson(evidence.promptContext), 'utf8');
  await writeFile(paths.rawResponsePath, evidence.rawResponse, 'utf8');
  if (paths.parsedResponsePath && evidence.parsedResponse) {
    await writeFile(paths.parsedResponsePath, stringifyDeterministicJson(evidence.parsedResponse), 'utf8');
  }
  await writeFile(
    paths.validationDiagnosticsPath,
    stringifyDeterministicJson(evidence.diagnostics),
    'utf8',
  );
  await writeFile(paths.dryRunDecisionPath, stringifyDeterministicJson(evidence.decision), 'utf8');
};

export const runRestrictedAgentDryRun = async (
  options: RestrictedAgentDryRunOptions,
): Promise<RestrictedAgentDryRunResult> => {
  const promptContext = buildRestrictedAgentPromptContext(options.turnInput);
  const resolvedClient = resolveDryRunClient(options);
  const rawResponse = resolvedClient.client
    ? await resolvedClient.client.complete({
        prompt: buildRestrictedAgentPrompt(options.turnInput),
        system: 'You are a restricted API coding agent. Return strict JSON only.',
        temperature: 0,
      })
    : '';

  const validation = resolvedClient.client
    ? validateRestrictedAgentDryRunResponse(rawResponse, options.turnInput, options.validationOptions)
    : { diagnostics: resolvedClient.diagnostics };
  const status: RestrictedAgentDryRunDecisionStatus =
    validation.diagnostics.length === 0 && validation.parsedResponse ? 'accepted' : 'blocked';
  const modelEvidence = validation.parsedResponse
    ? buildRestrictedAgentEvidenceRecord({
        turnInput: options.turnInput,
        response: validation.parsedResponse,
        diagnostics: validation.diagnostics,
      })
    : undefined;
  const evidencePaths = {
    promptContextPath: path.join(options.outDir, 'prompt-context.json'),
    rawResponsePath: path.join(options.outDir, 'raw-response.txt'),
    parsedResponsePath: validation.parsedResponse
      ? path.join(options.outDir, 'parsed-response.json')
      : undefined,
    validationDiagnosticsPath: path.join(options.outDir, 'validation-diagnostics.json'),
    dryRunDecisionPath: path.join(options.outDir, 'dry-run-decision.json'),
  };
  const decision: RestrictedAgentDryRunDecision = {
    schemaVersion: 1,
    phase: options.turnInput.phase,
    taskId: options.turnInput.taskId,
    provider: options.providerMode,
    status,
    ...(validation.parsedResponse ? { action: validation.parsedResponse.action } : {}),
    evidence: evidencePaths,
    diagnostics: validation.diagnostics,
  };

  await writeEvidence(options.outDir, {
    promptContext,
    rawResponse,
    parsedResponse: validation.parsedResponse,
    diagnostics: validation.diagnostics,
    decision,
  });

  return {
    decision,
    promptContext,
    rawResponse,
    ...(validation.parsedResponse ? { parsedResponse: validation.parsedResponse } : {}),
    validationDiagnostics: validation.diagnostics,
    ...(modelEvidence ? { modelEvidence } : {}),
  };
};
