import path from 'node:path';

import type { AgenticConfig } from './schema.js';

export const DEFAULT_AGENTIC_CONFIG: AgenticConfig = {
  schemaVersion: 1,
  projectName: '<PROJECT_NAME>',
  paths: {
    graphPath: 'automation/phase-graph.json',
    statePath: 'automation/phase-state.json',
    policyPath: 'automation/policies/automerge-policy.json',
    promptsDir: 'automation/prompts',
    autopilotConfigPath: 'automation/autopilot-config.json',
  },
  git: {
    baseBranch: '<BASE_BRANCH>',
    baseRef: '<BASE_BRANCH>',
    worktreeRoot: '<WORKTREE_ROOT>',
  },
};

export const resolveRepoPath = (repoRoot: string, configuredPath: string): string =>
  path.isAbsolute(configuredPath) ? configuredPath : path.join(repoRoot, configuredPath);
