import {
  REVIEWER_PERSONA_IDS,
  type ReviewerPersona,
  type ReviewerPersonaMetadata,
} from './reviewer-client.js';

export type { ReviewerPersonaMetadata };

const PERSONA_METADATA: Record<ReviewerPersona, ReviewerPersonaMetadata> = {
  careful_player: {
    id: 'careful_player',
    display_name: 'Careful Player',
    description:
      'Reads state carefully, prioritizes survivability, and judges fairness and tactical depth from trace evidence.',
    emphasis: ['fairness', 'clarity', 'tactical_depth', 'readable_renders'],
    player_policy_hint: 'baseline policy: cautious-low-hp',
  },
  naive_player: {
    id: 'naive_player',
    display_name: 'Naive Player',
    description:
      'Plays plausibly but may miss tactical detail; focuses on whether items, enemies, and actions are understandable.',
    emphasis: ['clarity', 'fun', 'action_labels', 'item_feedback'],
    player_policy_hint: 'baseline policy: random',
  },
  bug_hunter: {
    id: 'bug_hunter',
    display_name: 'Bug Hunter',
    description:
      'Probes edge cases, invalid actions, ABORTED paths, and thin renders to surface protocol and harness failures.',
    emphasis: ['invalid_actions', 'aborted_paths', 'protocol_edge_cases', 'render_completeness'],
    player_policy_hint: 'baseline policy: stairs-seeking',
  },
};

export const getReviewerPersonaMetadata = (
  persona: ReviewerPersona,
): ReviewerPersonaMetadata => PERSONA_METADATA[persona];

export const listReviewerPersonaMetadata = (): ReviewerPersonaMetadata[] =>
  REVIEWER_PERSONA_IDS.map((id) => PERSONA_METADATA[id]);
