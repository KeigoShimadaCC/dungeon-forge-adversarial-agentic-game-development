import { loadAutopilotConfig, runAutopilotForPhase, runAutopilotUntilComplete } from '../../core/phase-autopilot.js';
import { loadRunnerContext, numberOption, optionValue, requireOption, writeJson } from './shared.js';

export type RunMode = 'manual' | 'supervised' | 'auto';

export interface ResolvedRunOptions {
  mode?: RunMode;
  modeWarning?: string;
  safetyFlags: {
    allowAgentExecution: boolean;
    allowPr: boolean;
    allowMerge: boolean;
    dryRun: boolean;
    continueOnBlocked: boolean;
    parallel: number;
    planApproval: 'auto' | 'manual' | 'disabled';
    plannerAgent: 'shell' | 'manual';
    executorAgent: 'shell' | 'manual';
    recheckerAgent: 'shell' | 'manual';
  };
}

const parseRunMode = (value: string | undefined): RunMode | undefined => {
  if (!value) return undefined;
  if (value === 'manual' || value === 'supervised' || value === 'auto') return value;
  throw new Error('--mode must be one of: manual, supervised, auto');
};

export const resolveRunOptions = (options: Record<string, string | boolean>): ResolvedRunOptions => {
  const mode = parseRunMode(optionValue(options, 'mode'));
  const modeAllowsAgentExecution = mode === 'supervised' || mode === 'auto';
  const modeAllowsPr = mode === 'auto';
  const modeAllowsMerge = mode === 'auto';
  return {
    ...(mode ? { mode } : {}),
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
      plannerAgent: (optionValue(options, 'planner-agent') ?? 'manual') as 'shell' | 'manual',
      executorAgent: (optionValue(options, 'executor-agent') ?? 'manual') as 'shell' | 'manual',
      recheckerAgent: (optionValue(options, 'rechecker-agent') ?? 'manual') as 'shell' | 'manual',
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
