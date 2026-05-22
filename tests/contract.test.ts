import { describe, expect, it } from 'vitest';

import {
  gameEngine,
  getAvailableActions,
  isTerminal,
  render,
  start,
  step,
} from '../src/game/engine.js';
import { TERMINAL_STATUSES, type PlayerAction } from '../src/game/types.js';

describe('Phase 02A game contract', () => {
  it('defines the exact terminal statuses', () => {
    expect(TERMINAL_STATUSES).toEqual(['ACTIVE', 'WIN', 'LOSS', 'ABORTED']);
  });

  it('start(seed) returns a valid serializable GameState', () => {
    const state = start('seed_001');

    expect(state.seed).toBe('seed_001');
    expect(state.version).toBeTruthy();
    expect(state.turn).toBe(0);
    expect(state.floor).toBe(1);
    expect(state.terminalStatus).toBe('ACTIVE');
    expect(state.player.inventory).toEqual([]);
    expect(state.map.width).toBeGreaterThan(0);
    expect(state.map.height).toBeGreaterThan(0);
    expect(state.map.tiles).toHaveLength(state.map.height);
    expect(state.map.tiles[0]).toHaveLength(state.map.width);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('render(state) returns a non-empty text view', () => {
    const output = render(start('seed_001'));

    expect(output.trim().length).toBeGreaterThan(0);
    expect(output).toContain('seed_001');
    expect(output).toContain('@');
  });

  it('getAvailableActions(state) returns explicit structured actions', () => {
    const actions = getAvailableActions(start('seed_001'));

    expect(actions.length).toBeGreaterThan(0);

    for (const action of actions) {
      expect(action.id.length).toBeGreaterThan(0);
      expect(action.label.length).toBeGreaterThan(0);
      expect(typeof action.type).toBe('string');
      expect(JSON.parse(JSON.stringify(action))).toEqual(action);
    }
  });

  it('allows every available action to pass through step without crashing', () => {
    const state = start('seed_001');
    const actions = getAvailableActions(state);

    for (const action of actions) {
      const result = step(state, action);

      expect(result.valid).toBe(true);
      expect(result.state.turn).toBe(1);
      expect(result.events.length).toBeGreaterThan(0);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
  });

  it('returns invalid StepResult errors instead of throwing for unavailable actions', () => {
    const invalidAction: PlayerAction = {
      id: 'free_text_command',
      type: 'inspect',
      label: 'Invent a free text command',
      payload: { command: 'open-ended text' },
    };

    expect(() => step(start('seed_001'), invalidAction)).not.toThrow();

    const result = step(start('seed_001'), invalidAction);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('free_text_command');
    expect(result.events).toEqual([]);
    expect(result.state.terminalStatus).toBe('ACTIVE');
  });

  it('isTerminal(state) matches terminalStatus', () => {
    for (const terminalStatus of TERMINAL_STATUSES) {
      const state = {
        ...start('seed_001'),
        terminalStatus,
      };

      expect(isTerminal(state)).toBe(terminalStatus !== 'ACTIVE');
    }
  });

  it('can abort through the max-turn protocol while preserving serialization', () => {
    const state = start('seed_001', { maxTurns: 1 });
    const [action] = getAvailableActions(state);
    expect(action).toBeDefined();

    const result = step(state, action);

    expect(result.valid).toBe(true);
    expect(result.state.terminalStatus).toBe('ABORTED');
    expect(isTerminal(result.state)).toBe(true);
    expect(getAvailableActions(result.state)).toEqual([]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('exports a GameEngine object with the stable protocol functions', () => {
    const state = gameEngine.start('seed_001');
    const actions = gameEngine.getAvailableActions(state);
    const result = gameEngine.step(state, actions[0]);

    expect(gameEngine.render(result.state)).toContain('Status:');
    expect(gameEngine.isTerminal(result.state)).toBe(
      result.state.terminalStatus !== 'ACTIVE',
    );
  });
});
