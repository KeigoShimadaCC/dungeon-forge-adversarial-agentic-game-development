import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  autopilotConfigPathFromAgenticConfig,
  loadAgenticConfig,
  runnerPathsFromAgenticConfig,
} from '../config/load-config.js';
import type { AutopilotConfig } from './phase-autopilot.js';
import { stringifyDeterministicJson } from './json.js';
import type { AutomergePolicy, PhaseGraph, PhaseState, RunnerPaths } from './phase-runner.js';

export type MigrationActionKind = 'add_missing_field' | 'add_missing_phase_state' | 'set_field';

export interface MigrationAction {
  id: string;
  targetPath: string;
  action: MigrationActionKind;
  field: string;
  value: unknown;
}

export interface MigrationReport {
  schemaVersion: 1;
  status: 'planned' | 'applied' | 'noop';
  repoRoot: string;
  migrations: MigrationAction[];
  recommendedNextActions: string[];
}

export interface RunMigrationsOptions {
  apply?: boolean;
}

const defaultPreflightCommands = ['git status --short --branch'];

const readJson = async <T>(filePath: string): Promise<T | undefined> => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
};

const relativePath = (repoRoot: string, filePath: string): string =>
  path.relative(repoRoot, filePath) || path.basename(filePath);

const loadPaths = async (
  repoRoot: string,
): Promise<{ paths: RunnerPaths; autopilotConfigPath: string }> => {
  const agenticConfig = await loadAgenticConfig(repoRoot);
  return {
    paths: runnerPathsFromAgenticConfig(repoRoot, agenticConfig),
    autopilotConfigPath: autopilotConfigPathFromAgenticConfig(repoRoot, agenticConfig),
  };
};

const setField = (target: Record<string, unknown>, field: string, value: unknown): void => {
  target[field] = value;
};

export const detectMigrations = async (repoRootInput: string): Promise<MigrationAction[]> => {
  const repoRoot = path.resolve(repoRootInput);
  const { paths, autopilotConfigPath } = await loadPaths(repoRoot);
  const migrations: MigrationAction[] = [];

  const graph = await readJson<PhaseGraph>(paths.graphPath);
  const state = await readJson<PhaseState>(paths.statePath);
  const autopilotConfig = await readJson<AutopilotConfig>(autopilotConfigPath);
  const policy = await readJson<AutomergePolicy>(paths.policyPath);

  if (autopilotConfig && (!Array.isArray(autopilotConfig.preflightCommands) || autopilotConfig.preflightCommands.length === 0)) {
    migrations.push({
      id: 'autopilot-config-preflightCommands',
      targetPath: relativePath(repoRoot, autopilotConfigPath),
      action: 'add_missing_field',
      field: 'preflightCommands',
      value: defaultPreflightCommands,
    });
  }

  if (graph && state) {
    const stateIds = new Set(Object.keys(state.phases ?? {}));
    for (const phase of graph.phases ?? []) {
      if (!stateIds.has(phase.id)) {
        migrations.push({
          id: `phase-state-missing-graph-phase-${phase.id}`,
          targetPath: relativePath(repoRoot, paths.statePath),
          action: 'add_missing_phase_state',
          field: `phases.${phase.id}`,
          value: { status: 'queued' },
        });
      }
    }

    const graphIds = new Set((graph.phases ?? []).map((phase) => phase.id));
    if (!state.currentPhase || !graphIds.has(state.currentPhase)) {
      migrations.push({
        id: 'phase-state-current-phase',
        targetPath: relativePath(repoRoot, paths.statePath),
        action: 'set_field',
        field: 'currentPhase',
        value: graph.defaultStartPhase,
      });
    }
  }

  if (policy) {
    const safeDefaults: Array<[keyof AutomergePolicy, unknown]> = [
      ['enabled', false],
      ['allowNoRemoteChecksWhenLocalGatePasses', false],
      ['deleteBranchAfterMerge', false],
      ['removeCleanWorktreeAfterMerge', false],
    ];
    for (const [field, value] of safeDefaults) {
      if (policy[field] !== value) {
        migrations.push({
          id: `policy-safe-default-${String(field)}`,
          targetPath: relativePath(repoRoot, paths.policyPath),
          action: 'set_field',
          field: String(field),
          value,
        });
      }
    }
  }

  return migrations;
};

export const runMigrations = async (
  repoRootInput: string,
  options: RunMigrationsOptions = {},
): Promise<MigrationReport> => {
  const repoRoot = path.resolve(repoRootInput);
  const { paths, autopilotConfigPath } = await loadPaths(repoRoot);
  const migrations = await detectMigrations(repoRoot);
  const apply = options.apply === true;

  if (apply && migrations.length > 0) {
    const autopilotConfig = await readJson<Record<string, unknown>>(autopilotConfigPath);
    if (autopilotConfig && migrations.some((migration) => migration.targetPath === relativePath(repoRoot, autopilotConfigPath))) {
      setField(autopilotConfig, 'preflightCommands', defaultPreflightCommands);
      await mkdir(path.dirname(autopilotConfigPath), { recursive: true });
      await writeFile(autopilotConfigPath, stringifyDeterministicJson(autopilotConfig));
    }

    const graph = await readJson<PhaseGraph>(paths.graphPath);
    const state = await readJson<PhaseState>(paths.statePath);
    if (graph && state && migrations.some((migration) => migration.targetPath === relativePath(repoRoot, paths.statePath))) {
      state.phases = state.phases ?? {};
      for (const phase of graph.phases ?? []) {
        state.phases[phase.id] = state.phases[phase.id] ?? { status: 'queued' };
      }
      const graphIds = new Set((graph.phases ?? []).map((phase) => phase.id));
      if (!state.currentPhase || !graphIds.has(state.currentPhase)) {
        state.currentPhase = graph.defaultStartPhase;
      }
      state.lastUpdated = new Date().toISOString();
      await mkdir(path.dirname(paths.statePath), { recursive: true });
      await writeFile(paths.statePath, stringifyDeterministicJson(state));
    }

    const policy = await readJson<Record<string, unknown>>(paths.policyPath);
    if (policy && migrations.some((migration) => migration.targetPath === relativePath(repoRoot, paths.policyPath))) {
      policy.enabled = false;
      policy.allowNoRemoteChecksWhenLocalGatePasses = false;
      policy.deleteBranchAfterMerge = false;
      policy.removeCleanWorktreeAfterMerge = false;
      await mkdir(path.dirname(paths.policyPath), { recursive: true });
      await writeFile(paths.policyPath, stringifyDeterministicJson(policy));
    }
  }

  return {
    schemaVersion: 1,
    status: migrations.length === 0 ? 'noop' : apply ? 'applied' : 'planned',
    repoRoot,
    migrations,
    recommendedNextActions:
      migrations.length === 0
        ? ['Run agentic doctor --repo-root . to confirm repository health.']
        : apply
          ? ['Run agentic doctor --repo-root . to verify migration results.']
          : ['Review migrations, then run agentic migrate --repo-root . --apply.'],
  };
};
