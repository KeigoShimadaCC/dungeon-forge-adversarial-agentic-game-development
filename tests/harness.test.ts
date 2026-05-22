import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CANONICAL_REGRESSION_SEEDS } from '../src/harness/baseline-players/helpers.js';
import {
  buildScorecardRelativePath,
  buildTraceRelativePath,
} from '../src/harness/artifacts.js';
import { stringifyDeterministicJson } from '../src/harness/json.js';
import { runPlaythrough } from '../src/harness/runner.js';
import type { HarnessPlayerPolicy, PlaythroughTrace } from '../src/harness/types.js';

const TRACE_TOP_LEVEL_FIELDS = [
  'version',
  'seed',
  'persona',
  'result',
  'turns',
  'steps',
] as const;

const TRACE_STEP_FIELDS = [
  'turn',
  'state_summary',
  'render',
  'available_actions',
  'chosen_action',
  'valid',
  'events',
  'terminalStatus',
] as const;

const STATE_SUMMARY_FIELDS = [
  'turn',
  'floor',
  'hp',
  'maxHp',
  'terminalStatus',
  'playerPosition',
  'inventory',
  'enemyCount',
  'itemCount',
] as const;

const assertTraceShape = (trace: PlaythroughTrace): void => {
  for (const field of TRACE_TOP_LEVEL_FIELDS) {
    expect(trace).toHaveProperty(field);
  }

  expect(trace.steps.length).toBeGreaterThan(0);

  for (const step of trace.steps) {
    for (const field of TRACE_STEP_FIELDS) {
      expect(step).toHaveProperty(field);
    }
    for (const field of STATE_SUMMARY_FIELDS) {
      expect(step.state_summary).toHaveProperty(field);
    }
    expect(typeof step.render).toBe('string');
    expect(step.render.length).toBeGreaterThan(0);
    expect(Array.isArray(step.available_actions)).toBe(true);
    expect(step.chosen_action).toMatchObject({
      id: expect.any(String),
      type: expect.any(String),
      label: expect.any(String),
    });
    expect(Array.isArray(step.events)).toBe(true);
    for (const event of step.events) {
      expect(event).toMatchObject({
        id: expect.any(String),
        type: expect.any(String),
        message: expect.any(String),
        turn: expect.any(Number),
      });
    }
    expect(['ACTIVE', 'WIN', 'LOSS', 'ABORTED']).toContain(step.terminalStatus);
  }

  expect(['WIN', 'LOSS', 'ABORTED']).toContain(trace.result);
  expect(trace.steps.at(-1)?.terminalStatus).toBe(trace.result);
};

describe('Phase 05A harness', () => {
  it('saves trace and scorecard files for a seeded playthrough', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
    try {
      const { trace, scorecard, artifacts } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot,
      });

      const traceContents = await readFile(artifacts.tracePath, 'utf8');
      const scorecardContents = await readFile(artifacts.scorecardPath, 'utf8');

      expect(traceContents.length).toBeGreaterThan(0);
      expect(scorecardContents.length).toBeGreaterThan(0);
      expect(JSON.parse(traceContents)).toEqual(trace);
      expect(JSON.parse(scorecardContents)).toEqual(scorecard);
      assertTraceShape(trace);
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('produces reproducible trace JSON for a fixed seed and policy', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
    try {
      const first = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot: path.join(runsRoot, 'a'),
      });
      const second = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot: path.join(runsRoot, 'b'),
      });

      expect(stringifyDeterministicJson(first.trace)).toBe(
        stringifyDeterministicJson(second.trace),
      );
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('records terminal status and invalid action metrics', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
    const invalidPolicy: HarnessPlayerPolicy = () => ({
      action: {
        id: 'invalid_action',
        type: 'move',
        label: 'Invalid move',
        payload: { dx: 99, dy: 99 },
      },
    });

    try {
      const { trace, scorecard } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot,
        policy: invalidPolicy,
      });

      expect(trace.result).toBe('ABORTED');
      expect(trace.steps.at(-1)?.valid).toBe(false);
      expect(scorecard.invalid_actions).toBeGreaterThan(0);
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('stops at terminal status or configured max steps', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
    try {
      const terminalRun = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot: path.join(runsRoot, 'terminal'),
      });
      expect(['WIN', 'LOSS', 'ABORTED']).toContain(terminalRun.trace.result);

      const cappedRun = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v001-test',
        runsRoot: path.join(runsRoot, 'capped'),
        maxSteps: 1,
      });

      expect(cappedRun.trace.steps.length).toBeLessThanOrEqual(1);
      expect(cappedRun.trace.result).toBe('ABORTED');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it.each(CANONICAL_REGRESSION_SEEDS)(
    'simulates canonical seed %s with stairs-seeking',
    async (seed) => {
      const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-harness-'));
      try {
        const { trace } = await runPlaythrough({
          seed,
          policyId: 'stairs-seeking',
          version: 'v001-test',
          runsRoot,
        });

        assertTraceShape(trace);
        expect(trace.seed).toBe(seed);
        expect(trace.persona).toBe('stairs-seeking');
      } finally {
        await rm(runsRoot, { recursive: true, force: true });
      }
    },
  );

  it('uses stable relative artifact paths', () => {
    expect(buildTraceRelativePath('v001', 'seed_001', 'stairs-seeking')).toBe(
      'runs/v001/traces/seed_001__stairs-seeking.json',
    );
    expect(buildScorecardRelativePath('v001', 'seed_001', 'stairs-seeking')).toBe(
      'runs/v001/scorecards/seed_001__stairs-seeking.json',
    );
  });
});
