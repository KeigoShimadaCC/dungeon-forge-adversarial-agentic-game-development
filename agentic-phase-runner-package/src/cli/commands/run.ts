import { loadAutopilotConfig, runAutopilotForPhase, runAutopilotUntilComplete } from '../../core/phase-autopilot.js';
import { loadRunnerContext, numberOption, optionValue, requireOption, writeJson } from './shared.js';

const safetyFlagsFromOptions = (options: Record<string, string | boolean>) => ({
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
});

export const runRunCommand = async (
  repoRoot: string,
  options: Record<string, string | boolean>,
): Promise<void> => {
  const { autopilotConfigPath } = await loadRunnerContext(repoRoot);
  const autopilotConfig = await loadAutopilotConfig(repoRoot, autopilotConfigPath);
  const safetyFlags = safetyFlagsFromOptions(options);
  const deps = { autopilotConfig };

  if (options['until-complete'] === true) {
    writeJson(
      await runAutopilotUntilComplete(repoRoot, {
        from: optionValue(options, 'from'),
        safetyFlags,
        deps,
      }),
    );
    return;
  }

  const phaseId = optionValue(options, 'phase') ?? requireOption(options, 'from');
  writeJson(
    await runAutopilotForPhase(repoRoot, phaseId, {
      runId: optionValue(options, 'run-id'),
      safetyFlags,
      deps,
    }),
  );
};
