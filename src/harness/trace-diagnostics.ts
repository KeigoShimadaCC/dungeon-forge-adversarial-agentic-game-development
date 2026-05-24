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
  TacticalDepthMetrics,
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

const round2 = (value: number): number => Number(value.toFixed(2));
const round4 = (value: number): number => Number(value.toFixed(4));

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

export const deriveTacticalDepthMetrics = (
  trace: PlaythroughTrace,
  enemyBehaviors: EnemyBehaviorMetrics = deriveEnemyBehaviorMetrics(trace),
  itemEvaluation: ItemEvaluationMetrics = deriveItemEvaluationMetrics(trace),
  trapResources?: PlaythroughScorecard['trap_resources'],
): TacticalDepthMetrics => {
  let navigationActions = 0;
  let navigationFrictionTurns = 0;
  let combatEngagements = 0;
  let tacticalItemValueEvents = 0;
  let contentInteractionEvents = 0;
  let floorTransitionCount = 0;
  const floorsObserved = new Set<number>();
  const enemyEventTypes = new Set<string>();
  const tacticalItemTypes = new Set<string>();

  let previousFloor: number | undefined;
  let previousPosition: string | undefined;

  for (const step of trace.steps) {
    floorsObserved.add(step.state_summary.floor);
    const position = positionKey(step.state_summary.playerPosition);
    if (previousFloor !== undefined && step.state_summary.floor !== previousFloor) {
      floorTransitionCount += 1;
    }
    if (
      previousPosition !== undefined &&
      position === previousPosition &&
      ['move', 'wait', 'inspect'].includes(step.chosen_action.type)
    ) {
      navigationFrictionTurns += 1;
    }
    previousFloor = step.state_summary.floor;
    previousPosition = position;

    if (step.chosen_action.type === 'move' || step.chosen_action.type === 'descend') {
      navigationActions += 1;
    }
    if (step.chosen_action.type === 'attack') {
      combatEngagements += 1;
      contentInteractionEvents += 1;
    }
    if (['pickup', 'use_item', 'talk', 'descend'].includes(step.chosen_action.type)) {
      contentInteractionEvents += 1;
    }

    for (const event of step.events) {
      if ((ENEMY_BEHAVIOR_EVENT_TYPES as readonly string[]).includes(event.type)) {
        enemyEventTypes.add(event.type);
      }
      if (event.type === 'enemy_defeated') {
        combatEngagements += 1;
      }
      if (event.type === 'use_item') {
        const itemType = event.payload?.itemType;
        if (typeof itemType === 'string' && TACTICAL_ITEM_IDS.has(itemType)) {
          tacticalItemTypes.add(itemType);
          tacticalItemValueEvents += 1;
        }
      }
      if (
        event.type === 'trap_triggered' ||
        event.type === 'resource_hunger' ||
        event.type === 'resource_torch'
      ) {
        contentInteractionEvents += 1;
      }
    }
  }

  const enemyPressureEvents =
    enemyBehaviors.enemy_attack +
    enemyBehaviors.enemy_move +
    enemyBehaviors.enemy_wait +
    enemyBehaviors.enemy_steal +
    enemyBehaviors.enemy_phase;
  const turns = Math.max(trace.turns, trace.steps.length, 1);
  const distinctFloors = Math.max(floorsObserved.size, trace.steps.length > 0 ? 1 : 0);
  const trapResourcePressureEvents = trapResources?.resource_pressure_events ?? 0;
  const trapResourceDamage =
    (trapResources?.trap_damage_taken ?? 0) + (trapResources?.hunger_damage_taken ?? 0);
  const scenarioLabelSignals =
    (trace.challenge_mode ? 1 : 0) +
    (trace.scenario_pack ? 1 : 0) +
    (trace.extension_pack ? 1 : 0);

  return {
    enemy_pressure_events: enemyPressureEvents,
    enemy_pressure_per_turn: round4(enemyPressureEvents / turns),
    combat_engagements: combatEngagements,
    navigation_actions: navigationActions,
    navigation_friction_turns: navigationFrictionTurns,
    floor_transition_count: floorTransitionCount,
    average_turns_per_floor: distinctFloors === 0 ? 0 : round2(trace.turns / distinctFloors),
    tactical_item_opportunities: itemEvaluation.use_item_turns_available,
    tactical_item_uses: itemEvaluation.tactical_items_used,
    tactical_item_use_rate:
      itemEvaluation.use_item_turns_available === 0
        ? 0
        : round4(itemEvaluation.tactical_items_used / itemEvaluation.use_item_turns_available),
    tactical_item_value_events: tacticalItemValueEvents,
    trap_resource_pressure_events: trapResourcePressureEvents,
    trap_resource_damage: trapResourceDamage,
    content_interaction_events: contentInteractionEvents,
    scenario_depth_signals:
      distinctFloors + enemyEventTypes.size + tacticalItemTypes.size + scenarioLabelSignals,
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
  scorecard: Pick<PlaythroughScorecard, 'result' | 'invalid_actions' | 'softlocks' | 'items_used'> &
    Partial<
      Pick<
        PlaythroughScorecard,
        'turns' | 'floors_reached' | 'damage_taken' | 'trace_path' | 'tactical_depth'
      >
    >,
  metadata?: TraceMetadata,
): ProblemRunDiagnostics => {
  const categories: ProblemRunCategory[] = [];
  const abortCause = findAbortCause(trace);

  if (trace.steps.length === 0 || trace.turns !== trace.steps.length) {
    categories.push({
      category: 'missing_evidence',
      code: trace.steps.length === 0 ? 'empty_trace_steps' : 'turn_step_mismatch',
      message:
        trace.steps.length === 0
          ? 'Trace has no step evidence.'
          : `Trace turns (${trace.turns}) do not match step evidence (${trace.steps.length}).`,
      detail: { turns: trace.turns, steps: trace.steps.length, trace_path: scorecard.trace_path ?? '' },
    });
  }

  if (scorecard.result === 'ABORTED') {
    categories.push({
      category: 'aborted',
      code: abortCause ?? 'aborted_unknown',
      ...(abortCause ? { message: `Run aborted: ${abortCause}.` } : {}),
      detail: { result: scorecard.result, turns: trace.turns },
    });
  }

  if (
    abortCause &&
    ['no_available_actions', 'invalid_state'].includes(abortCause)
  ) {
    categories.push({
      category: 'protocol_failure',
      code: abortCause,
      message: `Run hit a protocol or state failure: ${abortCause}.`,
      detail: { abort_cause: abortCause },
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

  if (
    scorecard.invalid_actions > 0 ||
    (abortCause && ['policy_invalid_action', 'policy_cloned_action', 'invalid_step'].includes(abortCause))
  ) {
    categories.push({
      category: 'policy_issue',
      code: abortCause ?? 'invalid_action_output',
      message: 'Player/reviewer policy produced unusable or invalid action evidence.',
      detail: { invalid_actions: scorecard.invalid_actions, abort_cause: abortCause ?? null },
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

  if (
    scorecard.result === 'LOSS' &&
    scorecard.invalid_actions === 0 &&
    scorecard.softlocks === 0 &&
    trace.steps.length > 0
  ) {
    categories.push({
      category: 'expected_hard_loss',
      code:
        (scorecard.damage_taken ?? 0) > 0
          ? 'combat_or_resource_death'
          : 'loss_without_protocol_issue',
      message: 'Run lost cleanly without protocol, policy, or softlock evidence.',
      detail: {
        damage_taken: scorecard.damage_taken ?? 0,
        floors_reached: scorecard.floors_reached ?? 0,
        turns: scorecard.turns ?? trace.turns,
      },
    });
  }

  if (
    (scorecard.result === 'ABORTED' && abortCause === 'max_steps') ||
    (scorecard.result === 'LOSS' &&
      (scorecard.floors_reached ?? 0) <= 1 &&
      (scorecard.damage_taken ?? 0) >= 15 &&
      scorecard.invalid_actions === 0)
  ) {
    categories.push({
      category: 'balance_outlier',
      code: scorecard.result === 'ABORTED' ? 'max_steps_exhausted' : 'early_high_damage_loss',
      message: 'Run may indicate a balance outlier; inspect trace before tuning.',
      detail: {
        result: scorecard.result,
        turns: scorecard.turns ?? trace.turns,
        floors_reached: scorecard.floors_reached ?? 0,
        damage_taken: scorecard.damage_taken ?? 0,
      },
    });
  }

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
        'protocol_failure',
        'expected_hard_loss',
        'balance_outlier',
        'policy_issue',
        'missing_evidence',
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
