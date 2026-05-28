import { describe, expect, it } from 'vitest';

import { resolveRunOptions } from '../src/cli/commands/run.js';

describe('run mode aliases', () => {
  it('maps manual mode to no agent, PR, or merge permissions', () => {
    const resolved = resolveRunOptions({ mode: 'manual' });
    expect(resolved.safetyFlags.allowAgentExecution).toBe(false);
    expect(resolved.safetyFlags.allowPr).toBe(false);
    expect(resolved.safetyFlags.allowMerge).toBe(false);
    expect(resolved.safetyFlags.planApproval).toBe('manual');
    expect(resolved.modeExplanation).toContain('No agents');
  });

  it('maps supervised mode to agent execution without PR or merge permissions', () => {
    const resolved = resolveRunOptions({ mode: 'supervised' });
    expect(resolved.safetyFlags.allowAgentExecution).toBe(true);
    expect(resolved.safetyFlags.allowPr).toBe(false);
    expect(resolved.safetyFlags.allowMerge).toBe(false);
    expect(resolved.safetyFlags.planApproval).toBe('manual');
    expect(resolved.modeExplanation).toContain('PR creation and merge remain disabled');
  });

  it('maps auto mode to agent, PR, and merge permissions while retaining gate warning', () => {
    const resolved = resolveRunOptions({ mode: 'auto' });
    expect(resolved.safetyFlags.allowAgentExecution).toBe(true);
    expect(resolved.safetyFlags.allowPr).toBe(true);
    expect(resolved.safetyFlags.allowMerge).toBe(true);
    expect(resolved.safetyFlags.planApproval).toBe('auto');
    expect(resolved.modeWarning).toContain('deterministic gates pass');
  });

  it('keeps existing explicit flag behavior', () => {
    const resolved = resolveRunOptions({ 'allow-agent-execution': true, 'planner-agent': 'shell' });
    expect(resolved.mode).toBeUndefined();
    expect(resolved.safetyFlags.allowAgentExecution).toBe(true);
    expect(resolved.safetyFlags.allowPr).toBe(false);
    expect(resolved.safetyFlags.allowMerge).toBe(false);
    expect(resolved.safetyFlags.plannerAgent).toBe('shell');
  });

  it('maps --agents shell to all agent selectors', () => {
    const resolved = resolveRunOptions({ mode: 'supervised', agents: 'shell' });
    expect(resolved.agents).toBe('shell');
    expect(resolved.safetyFlags.plannerAgent).toBe('shell');
    expect(resolved.safetyFlags.executorAgent).toBe('shell');
    expect(resolved.safetyFlags.recheckerAgent).toBe('shell');
  });

  it('lets explicit role flags override --agents', () => {
    const resolved = resolveRunOptions({
      mode: 'supervised',
      agents: 'shell',
      'planner-agent': 'manual',
      'rechecker-agent': 'manual',
    });
    expect(resolved.safetyFlags.plannerAgent).toBe('manual');
    expect(resolved.safetyFlags.executorAgent).toBe('shell');
    expect(resolved.safetyFlags.recheckerAgent).toBe('manual');
  });

  it('maps --preset codex to shell agents when --agents is omitted', () => {
    const resolved = resolveRunOptions({ mode: 'supervised', preset: 'codex' });
    expect(resolved.preset).toBe('codex');
    expect(resolved.agents).toBe('shell');
    expect(resolved.safetyFlags.plannerAgent).toBe('shell');
    expect(resolved.safetyFlags.executorAgent).toBe('shell');
    expect(resolved.safetyFlags.recheckerAgent).toBe('shell');
  });

  it('lets explicit role flags override --preset', () => {
    const resolved = resolveRunOptions({
      mode: 'supervised',
      preset: 'codex',
      'executor-agent': 'manual',
    });
    expect(resolved.safetyFlags.plannerAgent).toBe('shell');
    expect(resolved.safetyFlags.executorAgent).toBe('manual');
    expect(resolved.safetyFlags.recheckerAgent).toBe('shell');
  });
});
