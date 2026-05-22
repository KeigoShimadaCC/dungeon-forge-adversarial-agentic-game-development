import {
  actionsMatch,
  createRandomValidActionPolicy,
  cautiousLowHp,
  greedyItemPicker,
  stairsSeeking,
  type BaselinePlayerPolicy,
} from './baseline-players/index.js';
import type { BaselinePlayerInput } from './baseline-players/types.js';
import type {
  HarnessPlayerPolicy,
  LlmPlayerPersona,
  PolicyDecision,
} from './types.js';
import { LLM_PLAYER_PERSONA_IDS } from './types.js';
import type { PlayerAction } from '../game/types.js';

export const BASELINE_POLICY_IDS = [
  'random',
  'stairs-seeking',
  'cautious-low-hp',
  'greedy-item-picker',
] as const;

export type BaselinePolicyId = (typeof BASELINE_POLICY_IDS)[number];

export type HarnessPolicyId = BaselinePolicyId | LlmPlayerPersona;

export const isLlmPlayerPersona = (value: string): value is LlmPlayerPersona =>
  (LLM_PLAYER_PERSONA_IDS as readonly string[]).includes(value);

export { LLM_PLAYER_PERSONA_IDS };

const wrapBaselinePolicy = (policy: BaselinePlayerPolicy): HarnessPlayerPolicy => {
  return (input: BaselinePlayerInput): PolicyDecision => ({
    action: policy(input),
  });
};

const POLICY_FACTORIES: Record<BaselinePolicyId, (seed: string) => HarnessPlayerPolicy> = {
  random: (seed) => wrapBaselinePolicy(createRandomValidActionPolicy(`${seed}::random`)),
  'stairs-seeking': () => wrapBaselinePolicy(stairsSeeking),
  'cautious-low-hp': () => wrapBaselinePolicy(cautiousLowHp),
  'greedy-item-picker': () => wrapBaselinePolicy(greedyItemPicker),
};

export const isBaselinePolicyId = (value: string): value is BaselinePolicyId =>
  (BASELINE_POLICY_IDS as readonly string[]).includes(value);

export const resolveBaselinePolicy = (
  policyId: BaselinePolicyId,
  seed: string,
): HarnessPlayerPolicy => POLICY_FACTORIES[policyId](seed);

export const normalizePolicyDecision = (
  decision: PolicyDecision | PlayerAction,
): PolicyDecision => {
  if ('action' in decision && typeof decision.action === 'object') {
    return decision;
  }
  return { action: decision as PlayerAction };
};

export const awaitPolicyDecision = async (
  decision: PolicyDecision | PlayerAction | Promise<PolicyDecision | PlayerAction>,
): Promise<PolicyDecision> => normalizePolicyDecision(await decision);

export const isPolicyActionValid = (
  availableActions: readonly PlayerAction[],
  choice: PlayerAction,
): boolean => availableActions.some((action) => actionsMatch(action, choice));
