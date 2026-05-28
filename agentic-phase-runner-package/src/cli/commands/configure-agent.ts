import { configureAgentPreset } from '../../core/agent-presets.js';
import { requireOption, writeJson } from './shared.js';

export const runConfigureAgentCommand = async (
  repoRoot: string,
  options: Record<string, string | boolean>,
): Promise<void> => {
  if (options.apply === true && options['dry-run'] === true) {
    throw new Error('Choose either --dry-run or --apply, not both.');
  }
  writeJson(
    await configureAgentPreset(repoRoot, {
      preset: requireOption(options, 'preset'),
      apply: options.apply === true,
    }),
  );
};
