import { inspectRepo } from '../../core/inspect.js';
import { optionValue, writeJson } from './shared.js';

export const runInspectCommand = async (
  repoRoot: string,
  options: Record<string, string | boolean>,
): Promise<void> => {
  writeJson(
    await inspectRepo(repoRoot, {
      phase: optionValue(options, 'phase'),
      runId: optionValue(options, 'run-id'),
      latest: options.latest === true,
    }),
  );
};

