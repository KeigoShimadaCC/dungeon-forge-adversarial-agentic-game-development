import { summarizePhaseRunner } from '../../core/phase-runner.js';
import { loadRunnerContext, writeJson } from './shared.js';

export const runStatusCommand = async (repoRoot: string): Promise<void> => {
  const { config } = await loadRunnerContext(repoRoot);
  writeJson(summarizePhaseRunner(config, repoRoot));
};
