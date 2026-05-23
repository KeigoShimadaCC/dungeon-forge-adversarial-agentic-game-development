import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { getAvailableActions, render, start } from '../src/game/engine.js';
import { parseHarnessLlmCliArgs } from '../src/harness/cli-args.js';
import { assertRealLlmRunAllowed, createReviewerForRun } from '../src/harness/llm-run-options.js';
import {
  createLlmPlayerClientFromChat,
  createOpenAiCompatibleChatClient,
} from '../src/harness/llm-provider.js';
import {
  hasLlmProviderCredentials,
  LlmCredentialsMissingError,
  LLM_API_KEY_ENV,
  resolveLlmProviderConfig,
} from '../src/harness/llm-provider-config.js';
import { resolveLlmPlayerDecision } from '../src/harness/llm-player.js';
import { parseLlmReviewerModelOutput, resolveLlmReview } from '../src/harness/llm-reviewer.js';
import { generateDeterministicReview } from '../src/harness/reviewer-client.js';
import { deriveScorecardFromTrace } from '../src/harness/scorecard.js';
import { runPlaythrough } from '../src/harness/runner.js';
import { runVersion } from '../src/harness/version-loop.js';

describe('Phase 14B real LLM provider boundary', () => {
  it('reports missing credentials without throwing until a real run is requested', () => {
    const env = { ...process.env };
    delete env[LLM_API_KEY_ENV];
    delete env.OPENAI_API_KEY;

    expect(hasLlmProviderCredentials(env)).toBe(false);
    expect(resolveLlmProviderConfig(env).ok).toBe(false);
    expect(() => assertRealLlmRunAllowed(undefined, env)).not.toThrow();
  });

  it('throws a clear blocker when real LLM flags are set without credentials', () => {
    const env = { ...process.env };
    delete env[LLM_API_KEY_ENV];
    delete env.OPENAI_API_KEY;

    expect(() => assertRealLlmRunAllowed({ usePlayer: true }, env)).toThrow(
      LlmCredentialsMissingError,
    );
    expect(() => assertRealLlmRunAllowed({ useReviewer: true }, env)).toThrow(
      /API credentials/,
    );
  });

  it('parses LLM CLI flags for player and reviewer modes', () => {
    const args = parseHarnessLlmCliArgs([
      '--use-llm-player',
      '--use-llm-reviewer',
      '--runs-root',
      '.',
    ]);
    expect(args.useLlmPlayer).toBe(true);
    expect(args.useLlmReviewer).toBe(true);

    const combined = parseHarnessLlmCliArgs(['--use-llm']);
    expect(combined.useLlmPlayer).toBe(true);
    expect(combined.useLlmReviewer).toBe(true);
  });

  it('routes mocked chat completions through the player client with id+type validation', async () => {
    const state = start('seed_001');
    const availableActions = getAvailableActions(state);
    const move = availableActions.find((action) => action.type === 'move');
    expect(move).toBeDefined();

    const chat = {
      complete: vi.fn(async () =>
        JSON.stringify({
          action_id: move!.id,
          action_type: move!.type,
          reason: 'Mock provider pick.',
        }),
      ),
    };

    const decision = await resolveLlmPlayerDecision(
      {
        state,
        renderedState: render(state),
        availableActions,
        turn: state.turn,
      },
      {
        persona: 'careful_player',
        client: createLlmPlayerClientFromChat(chat),
      },
    );

    expect(chat.complete).toHaveBeenCalledTimes(1);
    expect(decision.action.id).toBe(move!.id);
    expect(decision.reason).toBe('Mock provider pick.');
  });

  it('falls back to deterministic review when reviewer JSON is invalid', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-llm-reviewer-'));
    try {
      const { trace } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001',
        runsRoot,
        maxSteps: 2,
      });
      const scorecard = deriveScorecardFromTrace(trace, 'runs/v001/traces/seed_001_stairs-seeking.json');
      const deterministic = generateDeterministicReview({
        trace,
        scorecard,
        persona: 'careful_player',
      });

      const review = await resolveLlmReview(
        { trace, scorecard, persona: 'careful_player' },
        {
          client: {
            complete: async () => '{"summary":"broken"',
          },
        },
      );

      expect(review.summary).toBe(deterministic.summary);
      expect(review.review_metadata).toMatchObject({
        generation: 'deterministic',
        fallback_used: true,
        fallback_reason: 'malformed_json',
      });
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('accepts structurally valid mocked reviewer JSON', () => {
    const parsed = parseLlmReviewerModelOutput(
      JSON.stringify({
        summary: 'Trace-grounded summary.',
        scores: {
          fun: 6,
          clarity: 7,
          fairness: 6,
          tactical_depth: 5,
          replay_value: 5,
        },
        top_issues: [
          {
            severity: 'minor',
            observation: 'Observed a loss.',
            diagnosis: 'Early pressure.',
            recommendation: 'Tune floor one.',
            evidence: [{ kind: 'result', detail: 'Ended in LOSS.' }],
          },
        ],
        suggested_next_changes: ['Tune floor one.'],
        evidence_quality: 'full',
      }),
    );

    expect(parsed.ok).toBe(true);
  });

  it('rejects reviewer JSON with invalid enum values instead of casting them', () => {
    const parsed = parseLlmReviewerModelOutput(
      JSON.stringify({
        summary: 'Trace-grounded summary.',
        scores: {
          fun: 6,
          clarity: 7,
          fairness: 6,
          tactical_depth: 5,
          replay_value: 5,
        },
        top_issues: [
          {
            severity: 'severe',
            observation: 'Observed a loss.',
            diagnosis: 'Early pressure.',
            recommendation: 'Tune floor one.',
            evidence: [{ kind: 'unsupported', detail: 'Ended in LOSS.' }],
          },
        ],
        suggested_next_changes: ['Tune floor one.'],
        evidence_quality: 'unknown',
      }),
    );

    expect(parsed).toEqual({ ok: false, reason: 'invalid_shape' });
  });

  it('runVersion stays credential-free by default with injected deterministic clients', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-llm-version-'));
    const state = start('seed_001');
    const move = getAvailableActions(state).find((action) => action.type === 'move');
    expect(move).toBeDefined();

    try {
      const output = await runVersion(runsRoot, 'v014', [{ seed: 'seed_001', persona: 'careful_player' }], {
        onExisting: 'overwrite',
      });
      expect(output.runs).toHaveLength(1);
      expect(output.runs[0]?.result).toBeDefined();
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('uses injected LLM player and reviewer clients without real credentials', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-llm-injected-'));
    try {
      const output = await runVersion(
        runsRoot,
        'v014',
        [{ seed: 'seed_001', persona: 'careful_player' }],
        {
          onExisting: 'overwrite',
          llm: {
            usePlayer: true,
            useReviewer: true,
            playerClient: {
              complete: async (_prompt, input) => {
                const action = input.available_actions[0];
                return {
                  action_id: action.id,
                  action_type: action.type,
                  reason: 'Injected client pick.',
                };
              },
            },
            reviewerClient: {
              complete: async () =>
                JSON.stringify({
                  summary: 'Injected reviewer summary.',
                  scores: {
                    fun: 6,
                    clarity: 7,
                    fairness: 6,
                    tactical_depth: 5,
                    replay_value: 5,
                  },
                  top_issues: [
                    {
                      severity: 'minor',
                      observation: 'Observed a bounded run.',
                      diagnosis: 'Trace is inspectable.',
                      recommendation: 'Keep evidence grounded.',
                      evidence: [{ kind: 'scorecard', detail: 'Scorecard exists.' }],
                    },
                  ],
                  suggested_next_changes: ['Keep evidence grounded.'],
                  evidence_quality: 'full',
                }),
            },
          },
        },
      );

      expect(output.runs).toHaveLength(1);
      const review = JSON.parse(
        await readFile(output.runs[0]!.reviewPath, 'utf8'),
      ) as { review_metadata?: { generation?: string } };
      expect(review.review_metadata?.generation).toBe('llm');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('createReviewerForRun uses deterministic critic when LLM reviewer is off', async () => {
    const critic = createReviewerForRun();
    const trace = {
      version: 'v001',
      seed: 'seed_001',
      persona: 'careful_player',
      result: 'LOSS' as const,
      turns: 1,
      steps: [],
    };
    const scorecard = deriveScorecardFromTrace(trace, 'runs/v001/traces/seed_001_careful_player.json');
    const review = await critic.generateReview({ trace, scorecard, persona: 'careful_player' });
    expect(review.summary.length).toBeGreaterThan(0);
    expect('review_metadata' in review).toBe(false);
  });

  it('extracts JSON from fenced provider content in OpenAI-compatible client', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n{"action_id":"wait","action_type":"wait"}\n```' } }],
      }),
    })) as unknown as typeof fetch;

    const client = createOpenAiCompatibleChatClient(
      { apiKey: 'test-key', baseUrl: 'https://example.test/v1', model: 'test-model' },
      fetchImpl,
    );
    const raw = await client.complete({ prompt: 'pick an action' });
    expect(raw).toContain('"action_id":"wait"');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
