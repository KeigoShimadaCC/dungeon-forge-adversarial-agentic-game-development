import type { PlaythroughScorecard, PlaythroughTrace } from './types.js';

const numberPayload = (
  payload: PlaythroughTrace['steps'][number]['events'][number]['payload'],
  key: string,
): number | undefined => {
  const value = payload?.[key];
  return typeof value === 'number' ? value : undefined;
};

const STATE_SUMMARY_KEY = (summary: PlaythroughTrace['steps'][number]['state_summary']): string =>
  JSON.stringify({
    turn: summary.turn,
    floor: summary.floor,
    hp: summary.hp,
    playerPosition: summary.playerPosition,
    inventory: summary.inventory,
    enemyCount: summary.enemyCount,
    itemCount: summary.itemCount,
  });

export const deriveScorecardFromTrace = (
  trace: PlaythroughTrace,
  tracePath: string,
): PlaythroughScorecard => {
  let floorsReached = 0;
  let damageTaken = 0;
  let itemsUsed = 0;
  let enemiesDefeated = 0;
  let invalidActions = 0;
  let softlocks = 0;

  let repeatCount = 0;
  let previousSummaryKey: string | undefined;

  for (const step of trace.steps) {
    floorsReached = Math.max(floorsReached, step.state_summary.floor);

    if (!step.valid) {
      invalidActions += 1;
    }

    for (const event of step.events) {
      if (event.type === 'enemy_attack') {
        damageTaken += numberPayload(event.payload, 'damage') ?? 0;
      }

      if (event.type === 'enemy_defeated') {
        enemiesDefeated += 1;
      }

      if (event.type === 'use_item') {
        itemsUsed += 1;
      }
    }

    if (step.valid) {
      const summaryKey = STATE_SUMMARY_KEY(step.state_summary);
      if (summaryKey === previousSummaryKey) {
        repeatCount += 1;
      } else {
        repeatCount = 0;
        previousSummaryKey = summaryKey;
      }

      if (repeatCount >= 2) {
        softlocks += 1;
      }
    }
  }

  if (
    trace.result === 'ABORTED' &&
    trace.steps.some((step) =>
      step.events.some((event) => event.type === 'aborted'),
    )
  ) {
    softlocks = Math.max(softlocks, 1);
  }

  return {
    version: trace.version,
    seed: trace.seed,
    persona: trace.persona,
    result: trace.result,
    turns: trace.turns,
    floors_reached: floorsReached,
    damage_taken: damageTaken,
    items_used: itemsUsed,
    enemies_defeated: enemiesDefeated,
    invalid_actions: invalidActions,
    softlocks,
    trace_path: tracePath,
  };
};
