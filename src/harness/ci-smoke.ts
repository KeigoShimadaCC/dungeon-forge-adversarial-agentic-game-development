import { CANONICAL_REGRESSION_SEEDS } from './baseline-players/helpers.js';
import type { PlaythroughScorecard } from './types.js';
import { BASELINE_POLICY_IDS } from './policy-registry.js';
import { runPlaythrough } from './runner.js';
import type { BaselinePolicyId } from './policy-registry.js';

export const DEFAULT_CI_SMOKE_VERSION = 'v001';

/** Protocol failures only; gameplay ABORTED/LOSS and balance softlock heuristics are out of scope for CI smoke. */
export const collectCiSmokeProblemReasons = (scorecard: PlaythroughScorecard): string[] => {
  const reasons: string[] = [];
  if (scorecard.result === 'ACTIVE') {
    reasons.push('active_terminal');
  }
  if (scorecard.invalid_actions > 0) {
    reasons.push('invalid_actions');
  }
  return reasons;
};

export interface CiSmokeRunSpec {
  seed: string;
  policy: BaselinePolicyId;
}

export interface CiSmokeFailedRun {
  seed: string;
  policy: BaselinePolicyId;
  result: string;
  problem_reasons: string[];
}

export interface CiSmokeResult {
  version: string;
  total_runs: number;
  failed_runs: CiSmokeFailedRun[];
  ok: boolean;
}

export const buildCiSmokeSpecs = (
  seeds: readonly string[] = CANONICAL_REGRESSION_SEEDS,
  policies: readonly BaselinePolicyId[] = BASELINE_POLICY_IDS,
): CiSmokeRunSpec[] =>
  seeds.flatMap((seed) => policies.map((policy) => ({ seed, policy })));

export const runCiSmoke = async (options: {
  version?: string;
} = {}): Promise<CiSmokeResult> => {
  const version = options.version ?? DEFAULT_CI_SMOKE_VERSION;
  const specs = buildCiSmokeSpecs();
  const failed_runs: CiSmokeFailedRun[] = [];

  for (const spec of specs) {
    const { scorecard } = await runPlaythrough({
      seed: spec.seed,
      policyId: spec.policy,
      version,
      dryRun: true,
    });

    const problem_reasons = collectCiSmokeProblemReasons(scorecard);
    if (problem_reasons.length > 0) {
      failed_runs.push({
        seed: spec.seed,
        policy: spec.policy,
        result: scorecard.result,
        problem_reasons,
      });
    }
  }

  return {
    version,
    total_runs: specs.length,
    failed_runs,
    ok: failed_runs.length === 0,
  };
};
