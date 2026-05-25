import { stat } from 'node:fs/promises';
import path from 'node:path';

import { evaluateAutomerge, type PhaseMergeEvidence } from '../../core/phase-runner.js';
import { loadRunnerContext, readJsonFile, requireOption, writeJson } from './shared.js';

const resolveEvidenceFile = async (evidencePath: string): Promise<string> => {
  const evidenceStat = await stat(evidencePath);
  return evidenceStat.isDirectory()
    ? path.join(evidencePath, 'phase-merge-evidence.json')
    : evidencePath;
};

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
  const evidence = await readJsonFile<PhaseMergeEvidence>(await resolveEvidenceFile(evidencePath));
  writeJson(evaluateAutomerge(phase, config.automergePolicy, evidence));
};
