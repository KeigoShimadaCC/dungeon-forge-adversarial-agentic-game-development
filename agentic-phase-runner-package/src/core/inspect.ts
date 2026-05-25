import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { loadAgenticConfig, runnerPathsFromAgenticConfig } from '../config/load-config.js';
import {
  getRunnablePhases,
  loadPhaseRunnerConfig,
  type AutomergeDecision,
  type PhaseMergeEvidence,
  type PhaseRunnerConfig,
  type PhaseStatus,
} from './phase-runner.js';
import type { PhaseRunState } from './run-state.js';

export interface RunEvidenceLocation {
  phase: string;
  runId: string;
  evidenceDir: string;
}

export interface InspectOptions {
  phase?: string;
  runId?: string;
  latest?: boolean;
}

export interface InspectLatestRun {
  phase: string;
  runId: string;
  evidenceDir: string;
  status?: PhaseRunState['status'];
  currentStage?: PhaseRunState['currentStage'];
  finalDecision?: Partial<AutomergeDecision> | Record<string, unknown>;
  phaseMergeEvidence?: PhaseMergeEvidence;
}

export interface InspectReport {
  schemaVersion: 1;
  repoRoot: string;
  currentPhase?: string;
  phaseCounts: Record<string, number>;
  nextRunnable: string[];
  latestRun?: InspectLatestRun;
  blockedReasons: string[];
  recommendedNextActions: string[];
  message?: string;
}

const readJsonIfExists = async <T>(filePath: string): Promise<T | undefined> => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
};

const directoryExists = async (filePath: string): Promise<boolean> =>
  stat(filePath)
    .then((entry) => entry.isDirectory())
    .catch(() => false);

const listDirectories = async (dirPath: string): Promise<string[]> => {
  const entries = await readdir(dirPath, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
};

const latestRunForPhase = async (
  runsRoot: string,
  phase: string,
): Promise<RunEvidenceLocation | undefined> => {
  const phaseRoot = path.join(runsRoot, phase);
  const runIds = await listDirectories(phaseRoot);
  const runId = runIds.at(-1);
  if (!runId) return undefined;
  return { phase, runId, evidenceDir: path.join(phaseRoot, runId) };
};

export const discoverRunEvidence = async (
  repoRootInput: string,
  options: InspectOptions = {},
): Promise<RunEvidenceLocation | undefined> => {
  const repoRoot = path.resolve(repoRootInput);
  const runsRoot = path.join(repoRoot, 'runs', 'phase-runner');
  if (!(await directoryExists(runsRoot))) return undefined;

  if (options.phase && options.runId) {
    const evidenceDir = path.join(runsRoot, options.phase, options.runId);
    return (await directoryExists(evidenceDir))
      ? { phase: options.phase, runId: options.runId, evidenceDir }
      : undefined;
  }

  if (options.runId) {
    const phases = await listDirectories(runsRoot);
    for (const phase of phases) {
      const evidenceDir = path.join(runsRoot, phase, options.runId);
      if (await directoryExists(evidenceDir)) {
        return { phase, runId: options.runId, evidenceDir };
      }
    }
    return undefined;
  }

  if (options.phase) {
    return latestRunForPhase(runsRoot, options.phase);
  }

  const phases = await listDirectories(runsRoot);
  const candidates = (
    await Promise.all(phases.map((phase) => latestRunForPhase(runsRoot, phase)))
  ).filter((entry): entry is RunEvidenceLocation => Boolean(entry));
  return candidates.sort((left, right) => left.runId.localeCompare(right.runId)).at(-1);
};

const loadRunnerConfigIfAvailable = async (
  repoRoot: string,
): Promise<PhaseRunnerConfig | undefined> => {
  try {
    const agenticConfig = await loadAgenticConfig(repoRoot);
    const paths = runnerPathsFromAgenticConfig(repoRoot, agenticConfig);
    return await loadPhaseRunnerConfig(repoRoot, paths);
  } catch {
    return undefined;
  }
};

const countPhaseStatuses = (config: PhaseRunnerConfig | undefined): Record<string, number> => {
  const counts: Record<string, number> = {
    blocked: 0,
    complete: 0,
    failed: 0,
    queued: 0,
  };
  for (const entry of Object.values(config?.state.phases ?? {})) {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
  }
  return counts;
};

const blockedReasons = (config: PhaseRunnerConfig | undefined): string[] =>
  Object.entries(config?.state.phases ?? {})
    .filter(([, entry]) => entry.status === 'blocked' || entry.status === 'failed')
    .map(([phase, entry]) => `${phase}: ${entry.reason ?? entry.status}`);

const readLatestRun = async (
  location: RunEvidenceLocation | undefined,
): Promise<InspectLatestRun | undefined> => {
  if (!location) return undefined;
  const runState = await readJsonIfExists<PhaseRunState>(path.join(location.evidenceDir, 'run-state.json'));
  const finalDecision = await readJsonIfExists<Partial<AutomergeDecision> | Record<string, unknown>>(
    path.join(location.evidenceDir, 'final-decision.json'),
  );
  const phaseMergeEvidence = await readJsonIfExists<PhaseMergeEvidence>(
    path.join(location.evidenceDir, 'phase-merge-evidence.json'),
  );
  return {
    phase: location.phase,
    runId: location.runId,
    evidenceDir: location.evidenceDir,
    ...(runState?.status ? { status: runState.status } : {}),
    ...(runState?.currentStage ? { currentStage: runState.currentStage } : {}),
    ...(finalDecision ? { finalDecision } : {}),
    ...(phaseMergeEvidence ? { phaseMergeEvidence } : {}),
  };
};

export const inspectRepo = async (
  repoRootInput: string,
  options: InspectOptions = {},
): Promise<InspectReport> => {
  const repoRoot = path.resolve(repoRootInput);
  const config = await loadRunnerConfigIfAvailable(repoRoot);
  const nextRunnable = config
    ? getRunnablePhases(config, {
        repoRoot,
        from: options.phase ?? config.state.currentPhase,
        parallel: config.graph.defaultParallelism,
      }).map((entry) => entry.phase.id)
    : [];
  const location = await discoverRunEvidence(repoRoot, {
    phase: options.phase,
    runId: options.runId,
    latest: options.latest,
  });
  const latestRun = await readLatestRun(location);
  const recommendations: string[] = [];

  if (!config) {
    recommendations.push('Run agentic init --repo-root . if workflow files are missing.');
  } else if (latestRun?.finalDecision && 'decision' in latestRun.finalDecision) {
    recommendations.push(`Run agentic why-blocked --repo-root . --phase ${latestRun.phase} --latest.`);
  } else if (nextRunnable[0]) {
    recommendations.push(`Run agentic run --repo-root . --phase ${nextRunnable[0]} --mode manual --dry-run.`);
  } else {
    recommendations.push('Run agentic status --repo-root . to review phase state.');
  }

  return {
    schemaVersion: 1,
    repoRoot,
    ...(config?.state.currentPhase ? { currentPhase: config.state.currentPhase } : {}),
    phaseCounts: countPhaseStatuses(config),
    nextRunnable,
    ...(latestRun ? { latestRun } : {}),
    blockedReasons: blockedReasons(config),
    recommendedNextActions: recommendations,
    ...(!latestRun ? { message: 'No run evidence found under runs/phase-runner.' } : {}),
  };
};

