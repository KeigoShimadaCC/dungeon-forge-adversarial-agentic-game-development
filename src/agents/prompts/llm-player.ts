import type { PlayerAction } from '../../game/types.js';
import type { LlmPlayerPersona, StateSummary } from '../../harness/types.js';

export interface LlmPlayerModelInput {
  render: string;
  available_actions: PlayerAction[];
  recent_log: string[];
  persona: LlmPlayerPersona;
  state_summary: StateSummary;
}

const PERSONA_GUIDANCE: Record<LlmPlayerPersona, string> = {
  careful_player:
    'Play cautiously: prefer safer moves, healing, and avoiding unnecessary risk when HP is low.',
  naive_player:
    'Play simply: explore and take straightforward actions without deep planning.',
  bug_hunter:
    'Probe edge cases: try unusual but still legal actions from the available list to surface bugs.',
};

export const buildLlmPlayerModelInput = (params: {
  render: string;
  availableActions: readonly PlayerAction[];
  recentLog: readonly string[];
  persona: LlmPlayerPersona;
  stateSummary: StateSummary;
}): LlmPlayerModelInput => ({
  render: params.render,
  available_actions: params.availableActions.map((action) => ({
    id: action.id,
    type: action.type,
    label: action.label,
    ...(action.payload ? { payload: action.payload } : {}),
  })),
  recent_log: [...params.recentLog],
  persona: params.persona,
  state_summary: params.stateSummary,
});

export const buildLlmPlayerPrompt = (input: LlmPlayerModelInput): string => {
  const personaLine = PERSONA_GUIDANCE[input.persona];
  return [
    'You are a turn-based dungeon player agent.',
    'Choose exactly one action from available_actions by returning JSON only.',
    `Persona (${input.persona}): ${personaLine}`,
    'Rules:',
    '- Output must be a single JSON object with string fields action_id and reason.',
    '- action_id MUST match one of the provided available_actions[].id values.',
    '- Do not invent actions, file edits, or free-form commands.',
    '- reason should briefly justify the choice from observable game state.',
    'Required output shape:',
    '{"action_id":"<id from available_actions>","reason":"<short explanation>"}',
    'Game input JSON:',
    JSON.stringify(input),
  ].join('\n');
};
