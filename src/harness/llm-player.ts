import {
  buildLlmPlayerModelInput,
  buildLlmPlayerPrompt,
  type LlmPlayerModelInput,
} from '../agents/prompts/llm-player.js';
import type { PlayerAction } from '../game/types.js';
import {
  deterministicFallback,
  findMatchingAvailableAction,
  sortActionsById,
} from './baseline-players/helpers.js';
import type { BaselinePlayerInput } from './baseline-players/types.js';
import { buildStateSummary } from './state-summary.js';
import type {
  HarnessPlayerPolicy,
  LlmFallbackReason,
  LlmPlayerPersona,
  PolicyDecision,
  TraceDecisionMetadata,
} from './types.js';

export type { LlmPlayerPersona } from './types.js';
export { LLM_PLAYER_PERSONA_IDS } from './types.js';

export interface LlmPlayerModelOutput {
  action_id: string;
  action_type?: string;
  reason?: string;
}

export type LlmPlayerClientResponse = string | LlmPlayerModelOutput | Record<string, unknown>;

export interface LlmPlayerClient {
  complete(prompt: string, input: LlmPlayerModelInput): Promise<LlmPlayerClientResponse>;
}

export interface CreateLlmPlayerPolicyOptions {
  client: LlmPlayerClient;
  persona: LlmPlayerPersona;
  timeoutMs?: number;
  recentLogLimit?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RECENT_LOG_LIMIT = 8;

export const findAvailableActionById = (
  availableActions: readonly PlayerAction[],
  actionId: string,
): PlayerAction | undefined => {
  const matches = availableActions.filter((action) => action.id === actionId);
  if (matches.length === 0) {
    return undefined;
  }
  return sortActionsById(matches)[0];
};

export type ResolveAvailableActionResult =
  | { ok: true; action: PlayerAction }
  | {
      ok: false;
      reason: 'invalid_action_id' | 'invalid_action_type' | 'missing_action_type';
      invalidActionId?: string;
      invalidActionType?: string;
    };

export const resolveAvailableActionFromModel = (
  availableActions: readonly PlayerAction[],
  actionId: string,
  actionType?: string,
): ResolveAvailableActionResult => {
  const matched = findAvailableActionById(availableActions, actionId);
  if (!matched) {
    return {
      ok: false,
      reason: 'invalid_action_id',
      invalidActionId: actionId,
    };
  }

  if (actionType === undefined || actionType.length === 0) {
    return { ok: false, reason: 'missing_action_type', invalidActionId: actionId };
  }

  if (matched.type !== actionType) {
    return {
      ok: false,
      reason: 'invalid_action_type',
      invalidActionId: actionId,
      invalidActionType: actionType,
    };
  }

  return { ok: true, action: matched };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseLlmPlayerModelOutput = (
  response: LlmPlayerClientResponse,
): { ok: true; output: LlmPlayerModelOutput } | { ok: false; reason: LlmFallbackReason } => {
  let raw: unknown = response;

  if (typeof response === 'string') {
    try {
      raw = JSON.parse(response);
    } catch {
      return { ok: false, reason: 'malformed_json' };
    }
  } else if (isRecord(response) && typeof response.action_id === 'string') {
    raw = response;
  } else if (isRecord(response)) {
    raw = response;
  }

  if (!isRecord(raw)) {
    return { ok: false, reason: 'malformed_json' };
  }

  const actionId = raw.action_id;
  if (typeof actionId !== 'string' || actionId.length === 0) {
    return { ok: false, reason: 'missing_action_id' };
  }

  const actionType = raw.action_type;
  if (actionType !== undefined && typeof actionType !== 'string') {
    return { ok: false, reason: 'malformed_json' };
  }

  const reason = raw.reason;
  if (reason !== undefined && typeof reason !== 'string') {
    return { ok: false, reason: 'malformed_json' };
  }

  return {
    ok: true,
    output: {
      action_id: actionId,
      ...(typeof actionType === 'string' ? { action_type: actionType } : {}),
      ...(typeof reason === 'string' ? { reason } : {}),
    },
  };
};

const buildFallbackDecision = (
  availableActions: readonly PlayerAction[],
  persona: LlmPlayerPersona,
  fallbackReason: LlmFallbackReason,
  extras: Partial<TraceDecisionMetadata> = {},
): PolicyDecision => {
  const metadata: TraceDecisionMetadata = {
    persona,
    fallback_used: true,
    fallback_reason: fallbackReason,
    error_category: fallbackReason,
    ...extras,
  };

  return {
    action: deterministicFallback(availableActions),
    reason: `Deterministic fallback after ${fallbackReason}.`,
    decision_metadata: metadata,
  };
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<{ ok: true; value: T } | { ok: false; reason: 'timeout' }> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve({ ok: true, value });
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });

export const resolveLlmPlayerDecision = async (
  input: BaselinePlayerInput,
  options: CreateLlmPlayerPolicyOptions,
): Promise<PolicyDecision> => {
  const { persona, client } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const recentLogLimit = options.recentLogLimit ?? DEFAULT_RECENT_LOG_LIMIT;
  const { availableActions, renderedState, state } = input;

  if (availableActions.length === 0) {
    throw new Error('LLM player policy invoked with no available actions.');
  }

  const modelInput = buildLlmPlayerModelInput({
    render: renderedState,
    availableActions,
    recentLog: state.log.slice(-recentLogLimit),
    persona,
    stateSummary: buildStateSummary(state),
  });
  const prompt = buildLlmPlayerPrompt(modelInput);

  let response: LlmPlayerClientResponse;
  try {
    const clientResult = await withTimeout(client.complete(prompt, modelInput), timeoutMs);
    if (!clientResult.ok) {
      return buildFallbackDecision(availableActions, persona, 'timeout');
    }
    response = clientResult.value;
  } catch {
    return buildFallbackDecision(availableActions, persona, 'client_error');
  }

  const parsed = parseLlmPlayerModelOutput(response);
  if (!parsed.ok) {
    return buildFallbackDecision(availableActions, persona, parsed.reason);
  }

  const modelReason = parsed.output.reason;
  const resolved = resolveAvailableActionFromModel(
    availableActions,
    parsed.output.action_id,
    parsed.output.action_type,
  );

  if (!resolved.ok) {
    const fallbackReason: LlmFallbackReason =
      resolved.reason === 'missing_action_type'
        ? 'missing_action_type'
        : resolved.reason;
    return buildFallbackDecision(availableActions, persona, fallbackReason, {
      ...(resolved.invalidActionId ? { invalid_action_id: resolved.invalidActionId } : {}),
      ...(resolved.invalidActionType ? { invalid_action_type: resolved.invalidActionType } : {}),
      ...(modelReason ? { model_reason: modelReason } : {}),
    });
  }

  const canonical =
    findMatchingAvailableAction(availableActions, resolved.action) ?? resolved.action;
  const metadata: TraceDecisionMetadata = { persona };

  return {
    action: canonical,
    ...(modelReason ? { reason: modelReason } : {}),
    decision_metadata: metadata,
  };
};

export const createLlmPlayerPolicy = (
  options: CreateLlmPlayerPolicyOptions,
): HarnessPlayerPolicy => {
  return (input) => resolveLlmPlayerDecision(input, options);
};
