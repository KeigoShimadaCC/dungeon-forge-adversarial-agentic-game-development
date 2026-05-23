/**
 * Credential and endpoint configuration for optional real LLM harness runs.
 * Gameplay, tests, and CI remain credential-free unless callers opt in explicitly.
 */

export const LLM_API_KEY_ENV = 'DUNGEON_FORGE_LLM_API_KEY';
export const LLM_API_KEY_ALT_ENV = 'OPENAI_API_KEY';
export const LLM_BASE_URL_ENV = 'DUNGEON_FORGE_LLM_BASE_URL';
export const LLM_MODEL_ENV = 'DUNGEON_FORGE_LLM_MODEL';

export const DEFAULT_LLM_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_LLM_MODEL = 'gpt-4o-mini';

export interface LlmProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export type LlmCredentialResolution =
  | { ok: true; config: LlmProviderConfig }
  | { ok: false; message: string };

export class LlmCredentialsMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmCredentialsMissingError';
  }
}

const LOCAL_LLM_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const normalizeBaseUrl = (value: string): string => {
  const trimmed = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${LLM_BASE_URL_ENV} must be a valid http(s) URL.`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${LLM_BASE_URL_ENV} must use http or https.`);
  }
  if (parsed.protocol === 'http:' && !LOCAL_LLM_HOSTS.has(parsed.hostname)) {
    throw new Error(`${LLM_BASE_URL_ENV} may use http only for localhost or loopback endpoints.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${LLM_BASE_URL_ENV} must not include credentials.`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`${LLM_BASE_URL_ENV} must not include query strings or fragments.`);
  }
  return parsed.toString().replace(/\/+$/, '');
};

export const resolveLlmProviderConfig = (
  env: NodeJS.ProcessEnv = process.env,
): LlmCredentialResolution => {
  const apiKey = env[LLM_API_KEY_ENV]?.trim() || env[LLM_API_KEY_ALT_ENV]?.trim();
  if (!apiKey) {
    return {
      ok: false,
      message: `Missing LLM API key. Set ${LLM_API_KEY_ENV} or ${LLM_API_KEY_ALT_ENV} to run real provider-backed harness commands.`,
    };
  }

  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(env[LLM_BASE_URL_ENV]?.trim() || DEFAULT_LLM_BASE_URL);
  } catch (error: unknown) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  const model = env[LLM_MODEL_ENV]?.trim() || DEFAULT_LLM_MODEL;

  return {
    ok: true,
    config: { apiKey, baseUrl, model },
  };
};

export const requireLlmProviderConfig = (
  env: NodeJS.ProcessEnv = process.env,
): LlmProviderConfig => {
  const resolved = resolveLlmProviderConfig(env);
  if (!resolved.ok) {
    throw new LlmCredentialsMissingError(resolved.message);
  }
  return resolved.config;
};

export const hasLlmProviderCredentials = (env: NodeJS.ProcessEnv = process.env): boolean =>
  resolveLlmProviderConfig(env).ok;
