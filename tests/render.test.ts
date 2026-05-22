import { describe, expect, it } from 'vitest';

import { POTION_ITEM_ID } from '../src/game/content.js';
import { render, start } from '../src/game/engine.js';
import { render as renderFromModule } from '../src/game/render.js';
import { TERMINAL_STATUSES, type GameState } from '../src/game/types.js';

const cloneState = (state: GameState): GameState =>
  JSON.parse(JSON.stringify(state)) as GameState;

describe('Phase 04A ASCII renderer', () => {
  it('returns non-empty output with player, floor/turn, HP, and objective', () => {
    const state = start('render-hud-seed');
    const output = render(state);

    expect(output.trim().length).toBeGreaterThan(0);
    expect(output).toContain('@');
    expect(output).toContain(`Floor: ${state.floor}/${state.meta.totalFloors}`);
    expect(output).toContain(`Turn: ${state.turn}/${state.meta.maxTurns}`);
    expect(output).toContain(`HP: ${state.player.hp}/${state.player.maxHp}`);
    expect(output).toContain(state.meta.objective);
  });

  it('shows empty inventory and potion inventory labels', () => {
    const empty = start('render-inventory-empty');
    expect(render(empty)).toContain('Inventory: (empty)');

    const withPotion = cloneState(empty);
    withPotion.player.inventory = [POTION_ITEM_ID];
    expect(render(withPotion)).toContain('Inventory: Healing Potion');
  });

  it('includes legend entries for all current map symbols', () => {
    const output = render(start('render-legend-seed'));

    expect(output).toContain('Legend:');
    expect(output).toContain('@ You');
    expect(output).toContain('s Slime');
    expect(output).toContain('! Potion');
    expect(output).toContain('> Stairs');
    expect(output).toContain('# Wall');
    expect(output).toContain('. Floor');
  });

  it('includes recent log entries', () => {
    const state = cloneState(start('render-log-seed'));
    state.log = ['First entry.', 'Second entry.', 'Third entry.', 'Fourth entry.'];

    const output = render(state);

    expect(output).toContain('Log:');
    expect(output).toContain('- Second entry.');
    expect(output).toContain('- Third entry.');
    expect(output).toContain('- Fourth entry.');
    expect(output).not.toContain('- First entry.');
  });

  it('renders map symbols for wall, floor, stairs, enemy, and item', () => {
    const state = cloneState(start('render-map-symbols'));
    state.enemies = [
      {
        id: 'slime-map',
        type: 'slime',
        label: 'Green Slime',
        hp: 6,
        maxHp: 6,
        attack: 2,
        defense: 0,
        behavior: 'chase',
        glyph: 's',
        x: 3,
        y: 2,
      },
    ];
    state.items = [
      {
        id: 'potion-map',
        type: POTION_ITEM_ID,
        label: 'Healing Potion',
        glyph: '!',
        x: 4,
        y: 2,
      },
    ];

    const output = render(state);

    expect(output).toContain('#');
    expect(output).toContain('.');
    expect(output).toContain('>');
    expect(output).toContain('s');
    expect(output).toContain('!');
    expect(output).toContain('@');
  });

  it('renders Phase 09B enemy glyphs and legend entries', () => {
    const state = cloneState(start('render-enemy-variety'));
    state.enemies = [
      {
        id: 'slime-map',
        type: 'slime',
        label: 'Green Slime',
        hp: 6,
        maxHp: 6,
        attack: 2,
        defense: 0,
        behavior: 'chase',
        glyph: 's',
        x: 2,
        y: 2,
      },
      {
        id: 'bat-map',
        type: 'bat',
        label: 'Cave Bat',
        hp: 4,
        maxHp: 4,
        attack: 1,
        defense: 0,
        behavior: 'bat',
        glyph: 'b',
        x: 3,
        y: 2,
      },
      {
        id: 'shell-map',
        type: 'shell',
        label: 'Stone Shell',
        hp: 8,
        maxHp: 8,
        attack: 2,
        defense: 2,
        behavior: 'shell',
        glyph: 'S',
        x: 4,
        y: 2,
      },
      {
        id: 'thief-map',
        type: 'thief',
        label: 'Dungeon Thief',
        hp: 5,
        maxHp: 5,
        attack: 1,
        defense: 0,
        behavior: 'thief',
        glyph: 't',
        x: 2,
        y: 3,
      },
      {
        id: 'ghost-map',
        type: 'ghost',
        label: 'Wandering Ghost',
        hp: 5,
        maxHp: 5,
        attack: 2,
        defense: 0,
        behavior: 'ghost',
        glyph: 'g',
        x: 3,
        y: 3,
      },
    ];

    const output = render(state);

    expect(output).toContain('s');
    expect(output).toContain('b');
    expect(output).toContain('S');
    expect(output).toContain('t');
    expect(output).toContain('g');
    expect(output).toContain('s Slime');
    expect(output).toContain('b Bat');
    expect(output).toContain('S Shell');
    expect(output).toContain('t Thief');
    expect(output).toContain('g Ghost');
  });

  it('is deterministic for the same state', () => {
    const state = start('render-determinism-seed');
    const first = render(state);
    const second = render(state);

    expect(first).toBe(second);
    expect(renderFromModule(state)).toBe(first);
  });

  it('does not mutate the input state', () => {
    const state = start('render-purity-seed');
    const before = JSON.stringify(state);

    render(state);

    expect(JSON.stringify(state)).toBe(before);
  });

  it.each(TERMINAL_STATUSES)('renders terminal status %s clearly', (terminalStatus) => {
    const state = cloneState(start('render-terminal-seed'));
    state.terminalStatus = terminalStatus;

    const output = render(state);

    expect(output).toContain(`Status: ${terminalStatus}`);
    expect(output).toContain(`Outcome: ${terminalStatus}`);
  });
});
