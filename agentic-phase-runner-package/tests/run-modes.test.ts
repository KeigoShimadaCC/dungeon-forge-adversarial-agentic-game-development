import { describe, expect, it } from 'vitest';

import { resolveRunOptions } from '../src/cli/commands/run.js';

describe('run mode aliases', () => {
  it('maps manual mode to no agent, PR, or merge permissions', () => {
    const resolved = resolveRunOptions({ mode: 'manual' });
    expect(resolved.safetyFlags.allowAgentExecution).toBe(false);
    expect(resolved.safetyFlags.allowPr).toBe(false);
    expect(resolved.safetyFlags.allowMerge).toBe(false);
    expect(resolved.safetyFlags.planApproval).toBe('manual');
  });

  it('maps supervised mode to agent execution without PR or merge permissions', () => {
    const resolved = resolveRunOptions({ mode: 'supervised' });
    expect(resolved.safetyFlags.allowAgentExecution).toBe(true);
    expect(resolved.safetyFlags.allowPr).toBe(false);
    expect(resolved.safetyFlags.allowMerge).toBe(false);
    expect(resolved.safetyFlags.planApproval).toBe('manual');
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
});
