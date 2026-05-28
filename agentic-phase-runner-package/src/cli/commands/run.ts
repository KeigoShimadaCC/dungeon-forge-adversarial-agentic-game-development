import { loadAutopilotConfig, runAutopilotForPhase, runAutopilotUntilComplete } from '../../core/phase-autopilot.js';
import { loadRunnerContext, numberOption, optionValue, requireOption, writeJson } from './shared.js';

export type RunMode = 'manual' | 'supervised' | 'auto';
export type RunAgentSelector = 'manual' | 'shell';
export type RunPreset = 'manual' | 'codex' | 'cursor' | 'claude-code' | 'mixed-codex-cursor' | 'fake-shell-test';

export interface ResolvedRunOptions {
  mode?: RunMode;
  modeExplanation?: string;
  modeWarning?: string;
  agents?: RunAgentSelector;
  preset?: RunPreset;
  safetyFlags: {
    allowAgentExecution: boolean;
    allowPr: boolean;
    allowMerge: boolean;
    dryRun: boolean;
    continueOnBlocked: boolean;
    parallel: number;
    planApproval: 'auto' | 'manual' | 'disabled';
    plannerAgent: RunAgentSelector;
    executorAgent: RunAgentSelector;
    recheckerAgent: RunAgentSelector;
  };
}

const parseRunMode = (value: string | undefined): RunMode | undefined => {
  if (!value) return undefined;
  if (value === 'manual' || value === 'supervised' || value === 'auto') return value;
  throw new Error('--mode must be one of: manual, supervised, auto');
};

const parseAgentSelector = (
  value: string | undefined,
  optionName: string,
): RunAgentSelector | undefined => {
  if (!value) return undefined;
  if (value === 'manual' || value === 'shell') return value;
  throw new Error(`${optionName} must be one of: manual, shell`);
};

const parseRunPreset = (value: string | undefined): RunPreset | undefined => {
  if (!value) return undefined;
  if (
    value === 'manual' ||
    value === 'codex' ||
    value === 'cursor' ||
    value === 'claude-code' ||
    value === 'mixed-codex-cursor' ||
    value === 'fake-shell-test'
  ) {
    return value;
  }
  throw new Error('--preset must be one of: manual, codex, cursor, claude-code, mixed-codex-cursor, fake-shell-test');
};

const modeExplanation = (mode: RunMode | undefined): string | undefined => {
  if (mode === 'manual') return 'No agents, PRs, or merges are allowed.';
  if (mode === 'supervised') return 'Agents may run, but PR creation and merge remain disabled.';
  return undefined;
};

export const resolveRunOptions = (options: Record<string, string | boolean>): ResolvedRunOptions => {
  const mode = parseRunMode(optionValue(options, 'mode'));
  const preset = parseRunPreset(optionValue(options, 'preset'));
  const presetAgents: RunAgentSelector | undefined = preset ? (preset === 'manual' ? 'manual' : 'shell') : undefined;
  const agents = parseAgentSelector(optionValue(options, 'agents'), '--agents') ?? presetAgents;
  const modeAllowsAgentExecution = mode === 'supervised' || mode === 'auto';
  const modeAllowsPr = mode === 'auto';
  const modeAllowsMerge = mode === 'auto';
  const plannerAgent = parseAgentSelector(optionValue(options, 'planner-agent'), '--planner-agent') ?? agents ?? 'manual';
  const executorAgent = parseAgentSelector(optionValue(options, 'executor-agent'), '--executor-agent') ?? agents ?? 'manual';
  const recheckerAgent = parseAgentSelector(optionValue(options, 'rechecker-agent'), '--rechecker-agent') ?? agents ?? 'manual';
  return {
    ...(mode ? { mode } : {}),
    ...(agents ? { agents } : {}),
    ...(preset ? { preset } : {}),
    ...(modeExplanation(mode) ? { modeExplanation: modeExplanation(mode) } : {}),
    ...(mode === 'auto'
      ? {
          modeWarning:
            'auto enables agent execution, PR creation, and merge only when deterministic gates pass.',
        }
      : {}),
    safetyFlags: {
      allowAgentExecution: options['allow-agent-execution'] === true || modeAllowsAgentExecution,
      allowPr: options['allow-pr'] === true || modeAllowsPr,
      allowMerge: options['allow-merge'] === true || modeAllowsMerge,
      dryRun: options['dry-run'] === true,
      continueOnBlocked: options['continue-on-blocked'] === true,
      parallel: numberOption(options, 'parallel', 1),
      planApproval: (optionValue(options, 'plan-approval') ?? (mode === 'auto' ? 'auto' : 'manual')) as
        | 'auto'
        | 'manual'
        | 'disabled',
      plannerAgent,
      executorAgent,
      recheckerAgent,
    },
  };
};

const withModeMetadata = <T>(value: T, resolved: ResolvedRunOptions): T | (T & Record<string, unknown>) => {
  if (!resolved.mode) return value;
  const decorate = (entry: unknown): unknown =>
    entry !== null && typeof entry === 'object'
      ? {
          ...(entry as Record<string, unknown>),
          mode: resolved.mode,
          ...(resolved.agents ? { agents: resolved.agents } : {}),
          ...(resolved.preset ? { preset: resolved.preset } : {}),
          ...(resolved.modeExplanation ? { modeExplanation: resolved.modeExplanation } : {}),
          ...(resolved.modeWarning ? { modeWarning: resolved.modeWarning } : {}),
        }
      : entry;
  return (Array.isArray(value) ? value.map(decorate) : decorate(value)) as T & Record<string, unknown>;
};

export const runRunCommand = async (
  repoRoot: string,
  options: Record<string, string | boolean>,
): Promise<void> => {
  const { autopilotConfigPath, paths } = await loadRunnerContext(repoRoot);
  const autopilotConfig = await loadAutopilotConfig(repoRoot, autopilotConfigPath);
  const resolved = resolveRunOptions(options);
  const safetyFlags = resolved.safetyFlags;
  const deps = { autopilotConfig, runnerPaths: paths };

  if (options['until-complete'] === true) {
    writeJson(
      withModeMetadata(
        await runAutopilotUntilComplete(repoRoot, {
          from: optionValue(options, 'from'),
          safetyFlags,
          deps,
        }),
        resolved,
      ),
    );
    return;
  }

  const phaseId = optionValue(options, 'phase') ?? requireOption(options, 'from');
  writeJson(
    withModeMetadata(
      await runAutopilotForPhase(repoRoot, phaseId, {
        runId: optionValue(options, 'run-id'),
        safetyFlags,
        deps,
      }),
      resolved,
    ),
  );
};
