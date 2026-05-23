import { PHASE_09A_ITEM_IDS, type FloorRuleDefinition, type GameContent } from '../game/content.js';
import { getGameContentForRun, resolveGameConfigForRun } from '../game/scenario-packs.js';
import { resolveTrapSpawnCount } from '../game/traps-resources.js';
import {
  chooseEntityPositions,
  generateFloorLayout,
  type FloorLayout,
} from '../game/map.js';
import type { GameConfig } from '../game/types.js';
import type {
  EnemyBehaviorMetrics,
  ItemEvaluationMetrics,
  MapFloorGenerationRecord,
  PlacementShortfall,
  PlaythroughScorecard,
  PlaythroughTrace,
  ProblemRunCategory,
  ProblemRunDiagnostics,
  TraceMetadata,
} from './types.js';

const ENEMY_BEHAVIOR_EVENT_TYPES = [
  'enemy_attack',
  'enemy_move',
  'enemy_wait',
  'enemy_steal',
  'enemy_phase',
  'enemy_defeated',
] as const;

type EnemyBehaviorEventType = (typeof ENEMY_BEHAVIOR_EVENT_TYPES)[number];

const TACTICAL_ITEM_IDS = new Set<string>(PHASE_09A_ITEM_IDS);

const positionKey = (position: { x: number; y: number }): string =>
  `${position.x},${position.y}`;

const filterContentIds = (
  ids: readonly string[],
  allowed?: readonly string[],
): string[] => {
  if (!allowed || allowed.length === 0) {
    return [...ids];
  }
  const allowedSet = new Set(allowed);
  return ids.filter((id) => allowedSet.has(id));
};

const getFloorRule = (floor: number, content: GameContent): FloorRuleDefinition => {
  const floors = [...content.floors.floors].sort((a, b) => a.floor - b.floor);
  const rule = floors.find((candidate) => candidate.floor === floor);
  if (!rule) {
    throw new Error(`No floor rule for floor ${floor}`);
  }
  return rule;
};

export const buildMapGenerationMetadata = (
  seed: string,
  config: GameConfig = {},
): TraceMetadata['map_generation'] => {
  const content = getGameContentForRun(config.scenarioPackId);
  const totalFloors = config.totalFloors ?? content.floors.floors.length;
  const floors: MapFloorGenerationRecord[] = [];

  for (let floor = 1; floor <= totalFloors; floor += 1) {
    const rule = getFloorRule(floor, content);
    const layout = generateFloorLayout({ seed, floor, rule });
    floors.push({
      floor,
      used_fallback: layout.usedFallback,
      generation_attempt: layout.attempt,
      width: rule.width,
      height: rule.height,
    });
  }

  return { floors };
};

const countPlacement = (
  seed: string,
  floor: number,
  rule: FloorRuleDefinition,
  layout: FloorLayout,
  occupied: Set<string>,
  slot: 'enemy' | 'item' | 'npc' | 'trap',
  requested: number,
  allowedIds: readonly string[],
  config: GameConfig,
): { requested: number; placed: number } => {
  if (requested <= 0) {
    return { requested: 0, placed: 0 };
  }

  const filtered =
    slot === 'enemy'
      ? filterContentIds(rule.enemyIds, config.allowedEnemyIds ?? allowedIds)
      : slot === 'item'
        ? filterContentIds(rule.itemIds, config.allowedItemIds ?? allowedIds)
        : slot === 'trap'
          ? filterContentIds(rule.trapIds ?? [], allowedIds)
          : [];

  if (filtered.length === 0 && slot !== 'trap') {
    return { requested, placed: 0 };
  }

  const positions = chooseEntityPositions({
    seed,
    floor,
    layout,
    count: requested,
    occupied,
    slot,
    safeFromPlayer: slot === 'enemy' || slot === 'trap',
  });
  for (const position of positions) {
    occupied.add(positionKey(position));
  }

  return { requested, placed: positions.length };
};

export const buildPlacementShortfalls = (
  seed: string,
  config: GameConfig = {},
): PlacementShortfall[] => {
  const content = getGameContentForRun(config.scenarioPackId);
  const totalFloors = config.totalFloors ?? content.floors.floors.length;
  const shortfalls: PlacementShortfall[] = [];

  for (let floor = 1; floor <= totalFloors; floor += 1) {
    const rule = getFloorRule(floor, content);
    const layout = generateFloorLayout({ seed, floor, rule });
    const occupied = new Set<string>([
      positionKey(layout.playerSpawn),
      positionKey(layout.stairs),
    ]);

    const enemyPlacement = countPlacement(
      seed,
      floor,
      rule,
      layout,
      occupied,
      'enemy',
      rule.enemySpawnCount,
      rule.enemyIds,
      config,
    );
    if (enemyPlacement.placed < enemyPlacement.requested) {
      shortfalls.push({
        floor,
        slot: 'enemy',
        requested: enemyPlacement.requested,
        placed: enemyPlacement.placed,
      });
    }

    const itemPlacement = countPlacement(
      seed,
      floor,
      rule,
      layout,
      occupied,
      'item',
      rule.itemSpawnCount,
      rule.itemIds,
      config,
    );
    if (itemPlacement.placed < itemPlacement.requested) {
      shortfalls.push({
        floor,
        slot: 'item',
        requested: itemPlacement.requested,
        placed: itemPlacement.placed,
      });
    }

    const trapRequested = resolveTrapSpawnCount(seed, rule);
    if (trapRequested > 0) {
      const trapPlacement = countPlacement(
        seed,
        floor,
        rule,
        layout,
        occupied,
        'trap',
        trapRequested,
        rule.trapIds ?? [],
        config,
      );
      if (trapPlacement.placed < trapPlacement.requested) {
        shortfalls.push({
          floor,
          slot: 'trap',
          requested: trapPlacement.requested,
          placed: trapPlacement.placed,
        });
      }
    }
  }

  return shortfalls;
};

const deriveTrapResourceProblemCategories = (
  scorecard: Pick<PlaythroughScorecard, 'trap_resources'>,
): ProblemRunCategory[] => {
  const metrics = scorecard.trap_resources;
  if (!metrics) {
    return [];
  }

  const categories: ProblemRunCategory[] = [];
  if (metrics.traps_triggered > 0 || metrics.trap_damage_taken > 0) {
    categories.push({
      category: 'trap_pressure',
      code:
        metrics.trap_damage_taken >= 6 ? 'high_trap_damage' : 'trap_encountered',
      message: `Trap pressure recorded (${metrics.traps_triggered} triggers, ${metrics.trap_damage_taken} damage).`,
      detail: { ...metrics },
    });
  }
  if (metrics.hunger_damage_taken > 0) {
    categories.push({
      category: 'resource_pressure',
      code: 'starvation_damage',
      message: `Hunger pressure dealt ${metrics.hunger_damage_taken} damage.`,
      detail: { ...metrics },
    });
  }
  return categories;
};

export const buildTraceMetadata = (
  seed: string,
  version: string,
  challengeMode?: string,
  scenarioPack?: string,
): TraceMetadata => {
  const config = resolveGameConfigForRun(version, challengeMode, scenarioPack);
  const placementShortfalls = buildPlacementShortfalls(seed, config);

  return {
    map_generation: buildMapGenerationMetadata(seed, config),
    ...(placementShortfalls.length > 0
      ? { placement: { shortfalls: placementShortfalls } }
      : {}),
  };
};

export const deriveEnemyBehaviorMetrics = (trace: PlaythroughTrace): EnemyBehaviorMetrics => {
  const metrics: EnemyBehaviorMetrics = {
    enemy_attack: 0,
    enemy_move: 0,
    enemy_wait: 0,
    enemy_steal: 0,
    enemy_phase: 0,
    enemy_defeated: 0,
  };

  for (const step of trace.steps) {
    for (const event of step.events) {
      if ((ENEMY_BEHAVIOR_EVENT_TYPES as readonly string[]).includes(event.type)) {
        metrics[event.type as EnemyBehaviorEventType] += 1;
      }
    }
  }

  return metrics;
};

export const deriveItemEvaluationMetrics = (trace: PlaythroughTrace): ItemEvaluationMetrics => {
  let useItemTurnsAvailable = 0;
  let itemPickupActions = 0;
  let tacticalItemsUsed = 0;

  for (const step of trace.steps) {
    if (step.available_actions.some((action) => action.type === 'use_item')) {
      useItemTurnsAvailable += 1;
    }
    if (step.chosen_action.type === 'pickup') {
      itemPickupActions += 1;
    }
    for (const event of step.events) {
      if (event.type !== 'use_item') {
        continue;
      }
      const itemType = event.payload?.itemType;
      if (typeof itemType === 'string' && TACTICAL_ITEM_IDS.has(itemType)) {
        tacticalItemsUsed += 1;
      }
    }
  }

  let itemsUsed = 0;
  for (const step of trace.steps) {
    for (const event of step.events) {
      if (event.type === 'use_item') {
        itemsUsed += 1;
      }
    }
  }

  return {
    use_item_turns_available: useItemTurnsAvailable,
    items_used: itemsUsed,
    tactical_items_used: tacticalItemsUsed,
    item_pickup_actions: itemPickupActions,
  };
};

const findAbortCause = (trace: PlaythroughTrace): string | undefined => {
  if (trace.result !== 'ABORTED') {
    return undefined;
  }

  for (const step of [...trace.steps].reverse()) {
    for (const event of [...step.events].reverse()) {
      if (event.type === 'harness_no_actions') {
        return 'no_available_actions';
      }
      if (event.type === 'harness_invalid_action') {
        return 'policy_invalid_action';
      }
      if (event.type === 'harness_cloned_action') {
        return 'policy_cloned_action';
      }
      if (event.type === 'harness_max_steps') {
        return 'max_steps';
      }
      if (event.type === 'invalid_state') {
        return 'invalid_state';
      }
      if (event.type === 'aborted') {
        return 'max_turns';
      }
    }
    if (!step.valid) {
      return 'invalid_step';
    }
  }

  return 'aborted_unknown';
};

export const deriveProblemRunDiagnostics = (
  trace: PlaythroughTrace,
  scorecard: Pick<
    PlaythroughScorecard,
    'result' | 'invalid_actions' | 'softlocks' | 'items_used'
  >,
  metadata?: TraceMetadata,
): ProblemRunDiagnostics => {
  const categories: ProblemRunCategory[] = [];

  if (scorecard.result === 'ABORTED') {
    const abort_cause = findAbortCause(trace);
    categories.push({
      category: 'aborted',
      code: abort_cause ?? 'aborted_unknown',
      ...(abort_cause ? { message: `Run aborted: ${abort_cause}.` } : {}),
      detail: { result: scorecard.result, turns: trace.turns },
    });
  }

  if (scorecard.softlocks > 0) {
    categories.push({
      category: 'softlock',
      code: 'repeated_state',
      message: `Detected ${scorecard.softlocks} softlock heuristic hit(s).`,
      detail: { softlocks: scorecard.softlocks },
    });
  }

  if (scorecard.invalid_actions > 0) {
    categories.push({
      category: 'invalid_actions',
      code: 'invalid_policy_or_step',
      message: `Recorded ${scorecard.invalid_actions} invalid action(s).`,
      detail: { invalid_actions: scorecard.invalid_actions },
    });
  }

  const shortfalls = metadata?.placement?.shortfalls ?? [];
  if (shortfalls.length > 0) {
    categories.push({
      category: 'impossible_placement',
      code: 'spawn_shortfall',
      message: `Placement shortfall on ${shortfalls.length} floor slot(s).`,
      detail: {
        shortfalls: shortfalls.map((entry) => ({
          floor: entry.floor,
          slot: entry.slot,
          requested: entry.requested,
          placed: entry.placed,
        })),
      },
    });
  }

  categories.push(
    ...deriveTrapResourceProblemCategories(
      scorecard as Pick<PlaythroughScorecard, 'trap_resources'>,
    ),
  );

  const abortCause = findAbortCause(trace);

  return {
    categories,
    primary_category: categories[0]?.category ?? 'none',
    ...(abortCause ? { abort_cause: abortCause } : {}),
  };
};

export const collectBalanceProblemCategories = (
  scorecard: PlaythroughScorecard,
): ProblemRunCategory[] => {
  if (scorecard.diagnostics?.categories && scorecard.diagnostics.categories.length > 0) {
    return scorecard.diagnostics.categories.filter((entry) =>
      [
        'aborted',
        'softlock',
        'invalid_actions',
        'impossible_placement',
        'trap_pressure',
        'resource_pressure',
      ].includes(entry.category),
    );
  }

  const categories: ProblemRunCategory[] = [];
  if (scorecard.result === 'ABORTED') {
    categories.push({
      category: 'aborted',
      code: scorecard.diagnostics?.abort_cause ?? 'aborted',
      message: scorecard.diagnostics?.abort_cause
        ? `Run aborted: ${scorecard.diagnostics.abort_cause}.`
        : 'Run ended in ABORTED.',
    });
  }
  if (scorecard.invalid_actions > 0) {
    categories.push({
      category: 'invalid_actions',
      code: 'invalid_policy_or_step',
      detail: { invalid_actions: scorecard.invalid_actions },
    });
  }
  if (scorecard.softlocks > 0) {
    categories.push({
      category: 'softlock',
      code: 'repeated_state',
      detail: { softlocks: scorecard.softlocks },
    });
  }
  return categories;
};

export const collectBalanceProblemReasons = (scorecard: PlaythroughScorecard): string[] => {
  const categories = collectBalanceProblemCategories(scorecard);
  if (categories.length > 0) {
    return categories.map((entry) =>
      entry.category === 'aborted' && entry.code !== 'aborted'
        ? `${entry.category}:${entry.code}`
        : entry.category,
    );
  }

  const reasons: string[] = [];
  if (scorecard.result === 'ABORTED') {
    reasons.push('aborted');
  }
  if (scorecard.invalid_actions > 0) {
    reasons.push('invalid_actions');
  }
  if (scorecard.softlocks > 0) {
    reasons.push('softlock');
  }
  return reasons;
};

export const isBalanceProblemRun = (scorecard: PlaythroughScorecard): boolean =>
  collectBalanceProblemReasons(scorecard).length > 0;

export const summarizeProblemCategoryCounts = (
  runs: readonly { problem_categories: readonly ProblemRunCategory[] }[],
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const run of runs) {
    for (const entry of run.problem_categories) {
      const key = `${entry.category}:${entry.code}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
};

export const findRepeatedProblemSeeds = (
  failedRuns: readonly { seed: string; policy: string }[],
): string[] => {
  const seedCounts = new Map<string, number>();
  for (const run of failedRuns) {
    seedCounts.set(run.seed, (seedCounts.get(run.seed) ?? 0) + 1);
  }
  return [...seedCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([seed]) => seed)
    .sort();
};

export const attachRepeatedFailureCategories = <
  T extends { seed: string; policy: string; problem_categories: ProblemRunCategory[] },
>(
  summary: {
    failed_runs: T[];
    runs: T[];
  },
  repeatedSeeds: readonly string[],
): void => {
  if (repeatedSeeds.length === 0) {
    return;
  }

  const repeatedSet = new Set(repeatedSeeds);
  for (const run of summary.failed_runs) {
    if (!repeatedSet.has(run.seed)) {
      continue;
    }
    const already = run.problem_categories.some(
      (entry) => entry.category === 'repeated_failure',
    );
    if (!already) {
      run.problem_categories.push({
        category: 'repeated_failure',
        code: 'seed_multi_policy',
        message: `Seed ${run.seed} failed across multiple baseline policies.`,
        detail: { seed: run.seed },
      });
    }
  }

  for (const run of summary.runs) {
    if (!repeatedSet.has(run.seed)) {
      continue;
    }
    const already = run.problem_categories.some(
      (entry) => entry.category === 'repeated_failure',
    );
    if (!already && run.problem_categories.length > 0) {
      run.problem_categories.push({
        category: 'repeated_failure',
        code: 'seed_multi_policy',
        detail: { seed: run.seed },
      });
    }
  }
};

export const finalizeTraceMetadata = (
  trace: PlaythroughTrace,
  scorecard: PlaythroughScorecard,
  baseMetadata: TraceMetadata,
): TraceMetadata => ({
  ...baseMetadata,
  problem_run: deriveProblemRunDiagnostics(trace, scorecard, baseMetadata),
});
