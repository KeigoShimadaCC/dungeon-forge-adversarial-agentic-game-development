import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from '../json.js';
import type { LlmChatCompletionClient } from '../llm-provider.js';
import {
  DEFAULT_RESTRICTED_AGENT_COMMAND_REGISTRY,
  type RestrictedAgentCommandRegistry,
} from './command-registry.js';
import {
  runRestrictedAgentChecks,
  summarizeRestrictedAgentFailedChecks,
  type RestrictedAgentCheckResult,
  type RestrictedAgentCommandExecutor,
} from './check-runner.js';
import {
  buildDefaultFakeResponse,
  buildRestrictedAgentPrompt,
  createRestrictedAgentFakeClient,
  validateRestrictedAgentDryRunResponse,
} from './api-loop.js';
import type {
  RestrictedAgentModelResponse,
  RestrictedAgentTurnInput,
  RestrictedAgentValidationDiagnostic,
} from './schemas.js';

export type RestrictedAgentRepairLoopStatus = 'pass' | 'blocked' | 'max_attempts';

export interface RestrictedAgentRepairLoopAttempt {
  attempt: number;
  promptContextPath: string;
  rawResponsePath: string;
  parsedResponsePath?: string;
  validationDiagnosticsPath: string;
  checkResultsPath?: string;
  parsedResponse?: RestrictedAgentModelResponse;
  diagnostics: RestrictedAgentValidationDiagnostic[];
  checkResults: RestrictedAgentCheckResult[];
}

export interface RestrictedAgentRepairLoopReport {
  schemaVersion: 1;
  phase: string;
  taskId: string;
  status: RestrictedAgentRepairLoopStatus;
  maxAttempts: number;
  attempts: RestrictedAgentRepairLoopAttempt[];
  finalFailedChecks: Array<{ commandId: string; summary: string }>;
  authority: {
    canCommit: false;
    canMerge: false;
    canChangePhaseState: false;
  };
}

export interface RestrictedAgentRepairLoopOptions {
  turnInput: RestrictedAgentTurnInput;
  outDir: string;
  cwd: string;
  maxAttempts: number;
  initialChecks?: readonly string[];
  registry?: RestrictedAgentCommandRegistry;
  executor?: RestrictedAgentCommandExecutor;
  client?: LlmChatCompletionClient;
  fakeResponses?: readonly string[];
}

const writeAttemptFile = async (attemptDir: string, name: string, content: string): Promise<string> => {
  await mkdir(attemptDir, { recursive: true });
  const filePath = path.join(attemptDir, name);
  await writeFile(filePath, content, 'utf8');
  return filePath;
};

const responseForAttempt = (
  options: RestrictedAgentRepairLoopOptions,
  attemptIndex: number,
): LlmChatCompletionClient => {
  if (options.client) {
    return options.client;
  }
  const response = options.fakeResponses?.[attemptIndex] ?? buildDefaultFakeResponse(options.turnInput);
  return createRestrictedAgentFakeClient(response);
};

export const runRestrictedAgentRepairLoop = async (
  options: RestrictedAgentRepairLoopOptions,
): Promise<RestrictedAgentRepairLoopReport> => {
  const maxAttempts = Math.max(0, options.maxAttempts);
  const registry = options.registry ?? DEFAULT_RESTRICTED_AGENT_COMMAND_REGISTRY;
  const attempts: RestrictedAgentRepairLoopAttempt[] = [];
  let turnInput: RestrictedAgentTurnInput = {
    ...options.turnInput,
    previousFailedChecks: [...options.turnInput.previousFailedChecks],
  };
  let finalFailedChecks: Array<{ commandId: string; summary: string }> = [];
  let status: RestrictedAgentRepairLoopStatus = maxAttempts === 0 ? 'max_attempts' : 'blocked';

  await mkdir(options.outDir, { recursive: true });

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    const attempt = attemptIndex + 1;
    const attemptDir = path.join(options.outDir, `attempt-${String(attempt).padStart(3, '0')}`);
    const promptContextPath = await writeAttemptFile(
      attemptDir,
      'prompt-context.json',
      stringifyDeterministicJson(turnInput),
    );
    const rawResponse = await responseForAttempt(options, attemptIndex).complete({
      prompt: buildRestrictedAgentPrompt(turnInput),
    });
    const rawResponsePath = await writeAttemptFile(attemptDir, 'raw-response.txt', rawResponse);
    const validation = validateRestrictedAgentDryRunResponse(rawResponse, turnInput, {
      commandRegistry: registry,
    });
    const validationDiagnosticsPath = await writeAttemptFile(
      attemptDir,
      'validation-diagnostics.json',
      stringifyDeterministicJson(validation.diagnostics),
    );
    const parsedResponsePath = validation.parsedResponse
      ? await writeAttemptFile(
          attemptDir,
          'parsed-response.json',
          stringifyDeterministicJson(validation.parsedResponse),
        )
      : undefined;

    let checkResults: RestrictedAgentCheckResult[] = [];
    let checkResultsPath: string | undefined;
    if (validation.parsedResponse) {
      const requestedChecks = validation.parsedResponse.requestedChecks ?? options.initialChecks ?? [];
      checkResults = await runRestrictedAgentChecks({
        cwd: options.cwd,
        requestedChecks,
        registry,
        executor: options.executor,
      });
      checkResultsPath = await writeAttemptFile(
        attemptDir,
        'check-results.json',
        stringifyDeterministicJson(checkResults),
      );
      finalFailedChecks = summarizeRestrictedAgentFailedChecks(checkResults);
      status = finalFailedChecks.length === 0 ? 'pass' : 'blocked';
    } else {
      status = 'blocked';
      finalFailedChecks = validation.diagnostics.map((diagnostic) => ({
        commandId: 'model_response',
        summary: diagnostic.message,
      }));
    }

    attempts.push({
      attempt,
      promptContextPath,
      rawResponsePath,
      ...(parsedResponsePath ? { parsedResponsePath } : {}),
      validationDiagnosticsPath,
      ...(checkResultsPath ? { checkResultsPath } : {}),
      ...(validation.parsedResponse ? { parsedResponse: validation.parsedResponse } : {}),
      diagnostics: validation.diagnostics,
      checkResults,
    });

    if (status === 'pass') {
      break;
    }
    if (attempt === maxAttempts) {
      status = 'max_attempts';
      break;
    }
    turnInput = {
      ...turnInput,
      previousFailedChecks: finalFailedChecks,
    };
  }

  const report: RestrictedAgentRepairLoopReport = {
    schemaVersion: 1,
    phase: options.turnInput.phase,
    taskId: options.turnInput.taskId,
    status,
    maxAttempts,
    attempts,
    finalFailedChecks,
    authority: {
      canCommit: false,
      canMerge: false,
      canChangePhaseState: false,
    },
  };
  await writeFile(path.join(options.outDir, 'repair-loop-report.json'), stringifyDeterministicJson(report), 'utf8');
  return report;
};
