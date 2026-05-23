import type { LlmPlayerClient, LlmPlayerClientResponse } from './llm-player.js';
import type { LlmProviderConfig } from './llm-provider-config.js';

export interface LlmChatCompletionRequest {
  prompt: string;
  system?: string;
  temperature?: number;
}

export interface LlmChatCompletionClient {
  complete(request: LlmChatCompletionRequest): Promise<string>;
}

const extractJsonObject = (content: string): string => {
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
};

export const createOpenAiCompatibleChatClient = (
  config: LlmProviderConfig,
  fetchImpl: typeof fetch = fetch,
): LlmChatCompletionClient => ({
  async complete(request) {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: request.temperature ?? 0,
        messages: [
          ...(request.system
            ? [{ role: 'system', content: request.system }]
            : []),
          { role: 'user', content: request.prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `LLM provider request failed (${response.status}): ${body.slice(0, 400)}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('LLM provider returned empty completion content.');
    }

    return extractJsonObject(content);
  },
});

export const createLlmPlayerClientFromChat = (
  chat: LlmChatCompletionClient,
): LlmPlayerClient => ({
  async complete(prompt) {
    const raw = await chat.complete({ prompt });
    try {
      return JSON.parse(raw) as LlmPlayerClientResponse;
    } catch {
      return raw;
    }
  },
});

export const createLlmPlayerClientFromConfig = (
  config: LlmProviderConfig,
  fetchImpl?: typeof fetch,
): LlmPlayerClient => createLlmPlayerClientFromChat(createOpenAiCompatibleChatClient(config, fetchImpl));
