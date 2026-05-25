import type {
  AutomergePolicy,
  PhaseDefinition,
  PhaseGraph,
  PhaseRunnerConfig,
  PhaseState,
  PhaseStateEntry,
  PhaseStatus,
  RunnerPaths,
} from '../core/phase-runner.js';
import type { AutopilotConfig } from '../core/phase-autopilot.js';

export type {
  AutomergePolicy,
  AutopilotConfig,
  PhaseDefinition,
  PhaseGraph,
  PhaseRunnerConfig,
  PhaseState,
  PhaseStateEntry,
  PhaseStatus,
  RunnerPaths,
};

export interface AgenticPathConfig {
  graphPath?: string;
  statePath?: string;
  policyPath?: string;
  promptsDir?: string;
  autopilotConfigPath?: string;
}

export interface AgenticConfig {
  schemaVersion?: number;
  projectName?: string;
  paths?: AgenticPathConfig;
  git?: {
    baseBranch?: string;
    baseRef?: string;
    worktreeRoot?: string;
  };
}
