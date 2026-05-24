import { listReviewerPersonaMetadata } from '../../harness/reviewer-personas.js';
import type { ReviewerPersona } from '../../harness/reviewer-client.js';
import type { ControlRoomPersonaChoice } from './types.js';

/**
 * Projects canonical harness reviewer personas into control-room selection metadata.
 * Does not copy runtime prompt text or resolve provider configuration.
 */
export const listControlRoomReviewerPersonas = (): ControlRoomPersonaChoice[] =>
  listReviewerPersonaMetadata().map((persona) => ({
    id: persona.id,
    displayName: persona.display_name,
    description: persona.description,
    emphasis: [...persona.emphasis],
    playerPolicyHint: persona.player_policy_hint,
    selectable: true,
  }));

export const getControlRoomReviewerPersona = (
  personaId: ReviewerPersona,
): ControlRoomPersonaChoice | undefined =>
  listControlRoomReviewerPersonas().find((persona) => persona.id === personaId);
