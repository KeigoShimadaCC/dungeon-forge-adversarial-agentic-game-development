import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from './json.js';

export type AutopilotRunStatus = 'not_started' | 'running' | 'blocked' | 'failed' | 'complete';

export type AutopilotStage =
  | 'bundle'
  | 'preflight'
  | 'setup'
  | 'bootstrap'
  | 'planning'
  | 'plan-acceptance'
  | 'execution'
  | 'cursor-subtasks'
  | 'restricted-agent-delegate'
  | 'recheck'
  | 'local-validation'
  | 'changed-path-scan'
  | 'secret-scan'
  | 'local-evidence'
  | 'local-gate'
  | 'commit'
  | 'pr'
  | 'checks'
  | 'remote-evidence'
  | 'final-gate'
  | 'merge'
  | 'cleanup'
  | 'complete';

export interface PhaseRunState {
  schemaVersion: number;
  phase: string;
  runId: string;
  status: AutopilotRunStatus;
  currentStage: AutopilotStage;
  completedStages: AutopilotStage[];
  dryRun: boolean;
  lastError?: string;
  startedAt: string;
  updatedAt: string;
  safetyFlags: {
    allowAgentExecution: boolean;
    allowPr: boolean;
    allowMerge: boolean;
  };
}

export const createRunId = (now = new Date()): string =>
  now.toISOString().replace(/\.\d{3}Z$/, 'Z');

export const runStatePath = (evidenceDir: string): string => path.join(evidenceDir, 'run-state.json');

export const loadRunState = async (evidenceDir: string): Promise<PhaseRunState | undefined> => {
  try {
    return JSON.parse(await readFile(runStatePath(evidenceDir), 'utf8')) as PhaseRunState;
  } catch {
    return undefined;
  }
};

export const writeRunState = async (evidenceDir: string, state: PhaseRunState): Promise<void> => {
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(runStatePath(evidenceDir), stringifyDeterministicJson(state));
};

export const initialRunState = (input: {
  phase: string;
  runId: string;
  dryRun: boolean;
  safetyFlags: PhaseRunState['safetyFlags'];
  now?: Date;
}): PhaseRunState => {
  const timestamp = (input.now ?? new Date()).toISOString();
  return {
    schemaVersion: 1,
    phase: input.phase,
    runId: input.runId,
    status: 'running',
    currentStage: 'bundle',
    completedStages: [],
    dryRun: input.dryRun,
    startedAt: timestamp,
    updatedAt: timestamp,
    safetyFlags: input.safetyFlags,
  };
};

export const advanceRunState = (
  state: PhaseRunState,
  update: Partial<Pick<PhaseRunState, 'status' | 'currentStage' | 'lastError'>> & {
    completedStage?: AutopilotStage;
  },
  now = new Date(),
): PhaseRunState => ({
  ...state,
  ...update,
  completedStages: update.completedStage
    ? [...state.completedStages, update.completedStage]
    : state.completedStages,
  updatedAt: now.toISOString(),
});
