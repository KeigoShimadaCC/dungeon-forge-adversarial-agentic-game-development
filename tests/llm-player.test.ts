import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildLlmPlayerPrompt } from '../src/agents/prompts/llm-player.js';
import { getAvailableActions, render, start } from '../src/game/engine.js';
import { actionsMatch, deterministicFallback } from '../src/harness/baseline-players/helpers.js';
import {
  createLlmPlayerPolicy,
  parseLlmPlayerModelOutput,
  resolveLlmPlayerDecision,
  type LlmPlayerClient,
} from '../src/harness/llm-player.js';
import { awaitPolicyDecision } from '../src/harness/policy-registry.js';
import { runPlaythrough } from '../src/harness/runner.js';
import { buildStateSummary } from '../src/harness/state-summary.js';

const policyInputFromSeed = (seed: string) => {
  const state = start(seed);
  const availableActions = getAvailableActions(state);
  return {
    state,
    renderedState: render(state),
    availableActions,
    turn: state.turn,
  };
};

const mockClient = (
  response: Awaited<ReturnType<LlmPlayerClient['complete']>>,
  delayMs = 0,
): LlmPlayerClient => ({
  complete: async () => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return response;
  },
});

describe('Phase 06A LLM player', () => {
  it('selects a valid mocked action by action_id', async () => {
    const input = policyInputFromSeed('seed_001');
    const target = input.availableActions.find((action) => action.type === 'move');
    expect(target).toBeDefined();

    const decision = await resolveLlmPlayerDecision(input, {
      persona: 'careful_player',
      client: mockClient(
        JSON.stringify({
          action_id: target!.id,
          reason: 'East corridor looks safer.',
        }),
      ),
    });

    expect(actionsMatch(decision.action, target!)).toBe(true);
    expect(decision.action).toBe(target);
    expect(decision.reason).toBe('East corridor looks safer.');
    expect(decision.decision_metadata?.persona).toBe('careful_player');
    expect(decision.decision_metadata?.fallback_used).toBeUndefined();
  });

  it('rejects invalid action_id and uses deterministic fallback', async () => {
    const input = policyInputFromSeed('seed_001');
    const decision = await resolveLlmPlayerDecision(input, {
      persona: 'bug_hunter',
      client: mockClient(
        JSON.stringify({
          action_id: 'not_a_real_action',
          reason: 'Trying a bogus move.',
        }),
      ),
    });

    expect(input.availableActions.some((action) => action.id === decision.action.id)).toBe(
      true,
    );
    expect(decision.action).toBe(deterministicFallback(input.availableActions));
    expect(decision.decision_metadata).toMatchObject({
      persona: 'bug_hunter',
      fallback_used: true,
      fallback_reason: 'invalid_action_id',
      error_category: 'invalid_action_id',
      invalid_action_id: 'not_a_real_action',
    });
  });

  it('handles malformed JSON with deterministic fallback', async () => {
    const input = policyInputFromSeed('seed_002');
    const decision = await resolveLlmPlayerDecision(input, {
      persona: 'naive_player',
      client: mockClient('{"action_id":'),
    });

    expect(input.availableActions.some((action) => action.id === decision.action.id)).toBe(
      true,
    );
    expect(decision.decision_metadata?.fallback_reason).toBe('malformed_json');
    expect(decision.decision_metadata?.fallback_used).toBe(true);
  });

  it('handles missing action_id with deterministic fallback', async () => {
    const input = policyInputFromSeed('seed_002');
    const decision = await resolveLlmPlayerDecision(input, {
      persona: 'careful_player',
      client: mockClient(JSON.stringify({ reason: 'no id provided' })),
    });

    expect(decision.decision_metadata?.fallback_reason).toBe('missing_action_id');
    expect(decision.decision_metadata?.fallback_used).toBe(true);
  });

  it('handles timeout with deterministic fallback', async () => {
    const input = policyInputFromSeed('seed_003');
    const decision = await resolveLlmPlayerDecision(input, {
      persona: 'careful_player',
      timeoutMs: 5,
      client: mockClient(
        JSON.stringify({ action_id: input.availableActions[0].id, reason: 'too late' }),
        50,
      ),
    });

    expect(decision.decision_metadata?.fallback_reason).toBe('timeout');
    expect(decision.decision_metadata?.error_category).toBe('timeout');
  });

  it('handles client errors with deterministic fallback', async () => {
    const input = policyInputFromSeed('seed_003');
    const decision = await resolveLlmPlayerDecision(input, {
      persona: 'naive_player',
      client: {
        complete: async () => {
          throw new Error('network down');
        },
      },
    });

    expect(decision.decision_metadata?.fallback_reason).toBe('client_error');
    expect(decision.decision_metadata?.fallback_used).toBe(true);
  });

  it('parses object responses from the client', () => {
    const parsed = parseLlmPlayerModelOutput({
      action_id: 'wait',
      reason: 'hold position',
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.output.action_id).toBe('wait');
    }
  });

  it('includes persona guidance in the prompt without bypassing validation', () => {
    const state = start('seed_001');
    const input = {
      render: render(state),
      available_actions: getAvailableActions(state),
      recent_log: state.log,
      persona: 'bug_hunter' as const,
      state_summary: buildStateSummary(state),
    };
    const prompt = buildLlmPlayerPrompt(input);
    expect(prompt).toContain('bug_hunter');
    expect(prompt).toContain('action_id');
    expect(prompt).toContain('available_actions');
  });

  it('records LLM reason, persona, and fallback metadata in trace steps', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-llm-harness-'));
    const policy = createLlmPlayerPolicy({
      persona: 'careful_player',
      client: mockClient(
        JSON.stringify({
          action_id: 'definitely_invalid',
          reason: 'bad pick',
        }),
      ),
    });

    try {
      const { trace } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'careful_player',
        version: 'v001-llm-test',
        runsRoot,
        maxSteps: 1,
        policy,
      });

      const step = trace.steps[0];
      expect(trace.persona).toBe('careful_player');
      expect(step?.reason).toContain('fallback');
      expect(step?.decision_metadata).toMatchObject({
        persona: 'careful_player',
        fallback_used: true,
        fallback_reason: 'invalid_action_id',
        invalid_action_id: 'definitely_invalid',
      });
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('records valid LLM reason and persona metadata in trace steps', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-llm-harness-'));
    const initialInput = policyInputFromSeed('seed_001');
    const move = initialInput.availableActions.find((action) => action.type === 'move');
    expect(move).toBeDefined();
    const policy = createLlmPlayerPolicy({
      persona: 'bug_hunter',
      client: mockClient({
        action_id: move!.id,
        reason: 'Probe the legal movement action.',
      }),
    });

    try {
      const { trace } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'bug_hunter',
        version: 'v001-llm-test',
        runsRoot,
        maxSteps: 1,
        policy,
      });

      const step = trace.steps[0];
      expect(trace.persona).toBe('bug_hunter');
      expect(step?.chosen_action.id).toBe(move!.id);
      expect(step?.reason).toBe('Probe the legal movement action.');
      expect(step?.decision_metadata).toMatchObject({
        persona: 'bug_hunter',
      });
      expect(step?.decision_metadata?.fallback_used).toBeUndefined();
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('createLlmPlayerPolicy returns an async harness policy', async () => {
    const input = policyInputFromSeed('seed_004');
    const move = input.availableActions.find((action) => action.type === 'move');
    expect(move).toBeDefined();

    const policy = createLlmPlayerPolicy({
      persona: 'naive_player',
      client: mockClient({ action_id: move!.id, reason: 'go' }),
    });

    const decision = await awaitPolicyDecision(policy(input));

    expect(actionsMatch(decision.action, move!)).toBe(true);
    expect(decision.reason).toBe('go');
  });
});
