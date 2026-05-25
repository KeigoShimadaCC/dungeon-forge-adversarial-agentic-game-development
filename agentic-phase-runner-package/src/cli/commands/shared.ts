import { readFile } from 'node:fs/promises';

import { stringifyDeterministicJson } from '../../core/json.js';
import {
  loadPhaseRunnerConfig,
  validatePhaseGraph,
  type PhaseRunnerConfig,
  type RunnerPaths,
} from '../../core/phase-runner.js';
import {
  autopilotConfigPathFromAgenticConfig,
  loadAgenticConfig,
  runnerPathsFromAgenticConfig,
} from '../../config/load-config.js';

export interface ParsedCli {
  command: string;
  repoRoot: string;
  options: Record<string, string | boolean>;
}

export interface RunnerContext {
  config: PhaseRunnerConfig;
  paths: RunnerPaths;
  autopilotConfigPath: string;
}

export const optionValue = (
  options: Record<string, string | boolean>,
  name: string,
): string | undefined => {
  const value = options[name];
  return typeof value === 'string' ? value : undefined;
};

export const requireOption = (
  options: Record<string, string | boolean>,
  name: string,
): string => {
  const value = optionValue(options, name);
  if (!value) {
    throw new Error(`Missing required option: --${name}`);
  }
  return value;
};

export const numberOption = (
  options: Record<string, string | boolean>,
  name: string,
  fallback: number,
): number => {
  const value = optionValue(options, name);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
};

export const writeJson = (value: unknown): void => {
  process.stdout.write(stringifyDeterministicJson(value));
};

export const loadRunnerContext = async (repoRoot: string): Promise<RunnerContext> => {
  const agenticConfig = await loadAgenticConfig(repoRoot);
  const paths = runnerPathsFromAgenticConfig(repoRoot, agenticConfig);
  const config = await loadPhaseRunnerConfig(repoRoot, paths);
  const graphErrors = validatePhaseGraph(config.graph);
  if (graphErrors.length > 0) {
    throw new Error(`Invalid phase graph:\n${graphErrors.map((entry) => `- ${entry}`).join('\n')}`);
  }
  return {
    config,
    paths,
    autopilotConfigPath: autopilotConfigPathFromAgenticConfig(repoRoot, agenticConfig),
  };
};

export const readJsonFile = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, 'utf8')) as T;
