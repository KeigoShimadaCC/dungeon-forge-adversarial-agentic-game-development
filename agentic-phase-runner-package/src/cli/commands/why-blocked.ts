import { analyzeWhyBlocked } from '../../core/blocker-analysis.js';
import { optionValue, writeJson } from './shared.js';

export const runWhyBlockedCommand = async (
  repoRoot: string,
  options: Record<string, string | boolean>,
): Promise<void> => {
  writeJson(
    await analyzeWhyBlocked(repoRoot, {
      phase: optionValue(options, 'phase'),
      runId: optionValue(options, 'run-id'),
      latest: options.latest === true,
    }),
  );
};

