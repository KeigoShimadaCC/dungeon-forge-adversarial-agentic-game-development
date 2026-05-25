import { runBoom } from '../../core/boom.js';
import { optionValue, requireOption, writeJson } from './shared.js';

export const runBoomCommand = async (
  repoRoot: string,
  options: Record<string, string | boolean>,
): Promise<void> => {
  const idea = requireOption(options, 'idea');
  writeJson(
    await runBoom(repoRoot, {
      idea,
      apply: options.apply === true,
      dryRun: options['dry-run'] === true,
      force: options.force === true,
      output: optionValue(options, 'output'),
    }),
  );
};

