import { getRunnablePhases } from '../../core/phase-runner.js';
import { loadRunnerContext, numberOption, optionValue, writeJson } from './shared.js';

export const runNextCommand = async (
  repoRoot: string,
  options: Record<string, string | boolean>,
): Promise<void> => {
  const { config } = await loadRunnerContext(repoRoot);
  writeJson({
    runnable: getRunnablePhases(config, {
      repoRoot,
      from: optionValue(options, 'from'),
      parallel: numberOption(options, 'parallel', config.graph.defaultParallelism),
      runId: optionValue(options, 'run-id'),
    }),
  });
};
