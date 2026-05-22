import type { PlaythroughScorecard, PlaythroughTrace } from '../../harness/types.js';
import type { ReviewerPersona } from '../../harness/reviewer-client.js';

export interface LlmReviewerModelInput {
  persona: ReviewerPersona;
  trace: PlaythroughTrace;
  scorecard: PlaythroughScorecard;
  key_rendered_states: string[];
}

export const buildLlmReviewerModelInput = (params: {
  trace: PlaythroughTrace;
  scorecard: PlaythroughScorecard;
  persona: ReviewerPersona;
  keyRenderedStates?: string[];
}): LlmReviewerModelInput => ({
  persona: params.persona,
  trace: params.trace,
  scorecard: params.scorecard,
  key_rendered_states:
    params.keyRenderedStates && params.keyRenderedStates.length > 0
      ? params.keyRenderedStates
      : params.trace.steps
          .map((step) => step.render)
          .filter((render) => render.trim().length > 0)
          .slice(0, 6),
});

export const buildLlmReviewerPrompt = (input: LlmReviewerModelInput): string => {
  return [
    'You are a trace-grounded game reviewer for a finite turn-based ASCII dungeon.',
    'Critique ONLY from the supplied trace and scorecard evidence. Do not invent play that is not in the trace.',
    `Reviewer persona: ${input.persona}`,
    'Return a single JSON object with this shape:',
    JSON.stringify({
      summary: 'string',
      scores: {
        fun: 1,
        clarity: 1,
        fairness: 1,
        tactical_depth: 1,
        replay_value: 1,
      },
      top_issues: [
        {
          severity: 'minor|moderate|major|critical',
          observation: 'string',
          diagnosis: 'string',
          recommendation: 'string',
          evidence: [{ kind: 'turn|result|invalid|event|render|scorecard', detail: 'string' }],
        },
      ],
      suggested_next_changes: ['string'],
      evidence_quality: 'full|partial|minimal',
    }),
    'Rules:',
    '- Scores must be integers from 1 to 10.',
    '- Every issue must cite trace/scorecard evidence with turn numbers when available.',
    '- Recommendations must stay within finite, structured-action, text/ASCII gameplay.',
    '- Do not propose engine rewrites, free-text commands, or external-service gameplay.',
    'Evidence JSON:',
    JSON.stringify(input),
  ].join('\n');
};
