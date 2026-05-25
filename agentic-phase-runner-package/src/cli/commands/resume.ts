import { loadAutopilotConfig, resumeAutopilot } from '../../core/phase-autopilot.js';
import { loadRunnerContext, numberOption, optionValue, requireOption, writeJson } from './shared.js';

export const runResumeCommand = async (
  repoRoot: string,
  options: Record<string, string | boolean>,
): Promise<void> => {
  const { autopilotConfigPath, paths } = await loadRunnerContext(repoRoot);
  const autopilotConfig = await loadAutopilotConfig(repoRoot, autopilotConfigPath);
  writeJson(
    await resumeAutopilot(repoRoot, requireOption(options, 'phase'), requireOption(options, 'run-id'), {
      safetyFlags: {
        allowAgentExecution: options['allow-agent-execution'] === true,
        allowPr: options['allow-pr'] === true,
        allowMerge: options['allow-merge'] === true,
        dryRun: options['dry-run'] === true,
        continueOnBlocked: options['continue-on-blocked'] === true,
        parallel: numberOption(options, 'parallel', 1),
        planApproval: (optionValue(options, 'plan-approval') ?? 'manual') as 'auto' | 'manual' | 'disabled',
        plannerAgent: (optionValue(options, 'planner-agent') ?? 'manual') as 'shell' | 'manual',
        executorAgent: (optionValue(options, 'executor-agent') ?? 'manual') as 'shell' | 'manual',
        recheckerAgent: (optionValue(options, 'rechecker-agent') ?? 'manual') as 'shell' | 'manual',
      },
      deps: { autopilotConfig, runnerPaths: paths },
    }),
  );
};
