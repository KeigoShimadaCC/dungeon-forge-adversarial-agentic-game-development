import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { start, step, getAvailableActions } from '../src/game/engine.js';
import {
  formatHumanPlayScreen,
  formatStatusPanel,
} from '../src/human-play/display.js';
import {
  buildHumanPlayChooseInput,
  runHumanPlaySession,
} from '../src/human-play/session.js';
import { HUMAN_PLAYER_PERSONA } from '../src/human-play/types.js';
import { findMatchingAvailableAction } from '../src/harness/baseline-players/helpers.js';
import { validateScorecard } from '../src/harness/scorecard.js';

describe('Phase 17A human play UI', () => {
  it('starts a seeded game through the human-play session', async () => {
    const result = await runHumanPlaySession({
      seed: 'seed_001',
      mode: 'auto',
      maxSteps: 1,
    });

    expect(result.trace.seed).toBe('seed_001');
    expect(result.trace.persona).toBe(HUMAN_PLAYER_PERSONA);
    expect(result.steps.length).toBe(1);
    expect(result.steps[0]?.available_actions.length).toBeGreaterThan(0);
  });

  it('only applies structured actions from getAvailableActions', async () => {
    const state = start('seed_001');
    const available = getAvailableActions(state);
    const invented = {
      id: 'free_text',
      type: 'inspect' as const,
      label: 'Invented',
    };

    expect(findMatchingAvailableAction(available, invented)).toBeUndefined();

    const result = await runHumanPlaySession({
      seed: 'seed_001',
      mode: 'auto',
      maxSteps: 0,
      chooseAction: async () => invented,
    });

    expect(result.aborted).toBe(true);
    expect(result.trace.result).toBe('ABORTED');
    expect(result.steps.at(-1)?.valid).toBe(false);
  });

  it('displays HP, inventory, recent log, render output, and terminal status', () => {
    const state = start('seed_001');
    state.log.push('Test log line');
    state.player.inventory.push('potion');

    const panel = formatStatusPanel(state);
    expect(panel).toContain('HP:');
    expect(panel).toContain('Inventory: potion');
    expect(panel).toContain('ACTIVE');
    expect(panel).toContain('Test log line');

    const screen = formatHumanPlayScreen(state, 'ASCII MAP');
    expect(screen).toContain('ASCII MAP');
  });

  it('reaches and records a terminal state in auto mode', async () => {
    const result = await runHumanPlaySession({
      seed: 'seed_001',
      mode: 'auto',
    });

    expect(['WIN', 'LOSS', 'ABORTED']).toContain(result.trace.result);
    expect(result.trace.result).not.toBe('ACTIVE');
    const lastStep = result.steps.at(-1);
    expect(lastStep?.terminalStatus).toBe(result.trace.result);
  });

  it('can save a harness-compatible trace and scorecard', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-human-play-'));
    try {
      const result = await runHumanPlaySession({
        seed: 'seed_002',
        version: '0.3.0-minimal-dungeon',
        mode: 'auto',
        maxSteps: 3,
        saveTrace: true,
        runsRoot,
      });

      expect(result.tracePath).toBeTruthy();
      expect(result.scorecardPath).toBeTruthy();

      const traceRaw = await readFile(result.tracePath!, 'utf8');
      const trace = JSON.parse(traceRaw) as typeof result.trace;
      expect(trace.persona).toBe(HUMAN_PLAYER_PERSONA);
      expect(trace.steps.length).toBeGreaterThan(0);

      const scorecardRaw = await readFile(result.scorecardPath!, 'utf8');
      const scorecard = JSON.parse(scorecardRaw);
      expect(() => validateScorecard(scorecard)).not.toThrow();
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('uses engine step validation rather than mutating state directly', async () => {
    const state = start('seed_001');
    const input = buildHumanPlayChooseInput(state, 'map');
    const action = input.actions[0];
    const stepped = step(state, action);
    expect(stepped.valid).toBe(true);
    expect(stepped.state.turn).toBe(state.turn + 1);
  });
});
