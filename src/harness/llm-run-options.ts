import { createLlmPlayerClientFromConfig, createOpenAiCompatibleChatClient } from './llm-provider.js';
import {
  hasLlmProviderCredentials,
  LlmCredentialsMissingError,
  requireLlmProviderConfig,
  type LlmProviderConfig,
} from './llm-provider-config.js';
import { createLlmPlayerPolicy, type LlmPlayerClient } from './llm-player.js';
import { createLlmReviewerProvider } from './llm-reviewer.js';
import type { LlmChatCompletionClient } from './llm-provider.js';
import { createReviewerCritic, type ReviewerCritic } from './reviewer-client.js';
import type { HarnessPlayerPolicy, LlmPlayerPersona } from './types.js';
import { awaitPolicyDecision, resolveBaselinePolicy } from './policy-registry.js';

export interface RunVersionLlmOptions {
  usePlayer?: boolean;
  useReviewer?: boolean;
  playerClient?: LlmPlayerClient;
  reviewerClient?: LlmChatCompletionClient;
  playerTimeoutMs?: number;
  reviewerTimeoutMs?: number;
  providerConfig?: LlmProviderConfig;
}

export const isRealLlmRunRequested = (llm?: RunVersionLlmOptions): boolean =>
  llm?.usePlayer === true || llm?.useReviewer === true;

export const assertRealLlmRunAllowed = (
  llm?: RunVersionLlmOptions,
  env: NodeJS.ProcessEnv = process.env,
): void => {
  if (!isRealLlmRunRequested(llm)) {
    return;
  }

  const needsProviderConfig =
    (llm?.usePlayer === true && !llm.playerClient) ||
    (llm?.useReviewer === true && !llm.reviewerClient);

  if (needsProviderConfig && !hasLlmProviderCredentials(env)) {
    throw new LlmCredentialsMissingError(
      'Real LLM run requested but no API credentials are configured. Set DUNGEON_FORGE_LLM_API_KEY or OPENAI_API_KEY, or omit --use-llm-player / --use-llm-reviewer for credential-free local runs.',
    );
  }
};

const resolveProviderConfig = (llm?: RunVersionLlmOptions): LlmProviderConfig =>
  llm?.providerConfig ?? requireLlmProviderConfig();

export const createPersonaPolicyForRun = (
  persona: LlmPlayerPersona,
  seed: string,
  personaBaseline: Record<LlmPlayerPersona, 'cautious-low-hp' | 'random' | 'stairs-seeking'>,
  llm?: RunVersionLlmOptions,
): HarnessPlayerPolicy => {
  if (llm?.usePlayer === true) {
    const client =
      llm.playerClient ?? createLlmPlayerClientFromConfig(resolveProviderConfig(llm));
    return createLlmPlayerPolicy({
      persona,
      client,
      timeoutMs: llm.playerTimeoutMs,
    });
  }

  const baselinePolicy = resolveBaselinePolicy(personaBaseline[persona], seed);
  return async (input) => {
    const decision = await awaitPolicyDecision(baselinePolicy(input));
    return {
      ...decision,
      reason: decision.reason ?? `${persona} deterministic local policy.`,
      decision_metadata: {
        ...decision.decision_metadata,
        persona,
        fallback_used: false,
      },
    };
  };
};

export const createReviewerForRun = (llm?: RunVersionLlmOptions): ReviewerCritic => {
  if (llm?.useReviewer !== true) {
    return createReviewerCritic();
  }

  const client =
    llm.reviewerClient ?? createOpenAiCompatibleChatClient(resolveProviderConfig(llm));
  return createReviewerCritic(
    createLlmReviewerProvider({
      client,
      timeoutMs: llm.reviewerTimeoutMs,
    }),
  );
};

export { createOpenAiCompatibleChatClient };
