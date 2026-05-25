import { evaluateAutomerge, type PhaseMergeEvidence } from '../../core/phase-runner.js';
import { loadRunnerContext, readJsonFile, requireOption, writeJson } from './shared.js';

export const runGateCommand = async (
  repoRoot: string,
  options: Record<string, string | boolean>,
): Promise<void> => {
  const { config } = await loadRunnerContext(repoRoot);
  const phaseId = requireOption(options, 'phase');
  const evidencePath = requireOption(options, 'evidence');
  const phase = config.graph.phases.find((entry) => entry.id === phaseId);
  if (!phase) {
    throw new Error(`Unknown phase: ${phaseId}`);
  }
  const evidence = await readJsonFile<PhaseMergeEvidence>(evidencePath);
  writeJson(evaluateAutomerge(phase, config.automergePolicy, evidence));
};
