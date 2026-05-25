import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { defaultRunnerPaths, type RunnerPaths } from '../core/phase-runner.js';
import { DEFAULT_AGENTIC_CONFIG, resolveRepoPath } from './default-config.js';
import type { AgenticConfig } from './schema.js';

const exists = async (filePath: string): Promise<boolean> =>
  access(filePath)
    .then(() => true)
    .catch(() => false);

const parseScalar = (value: string): string | number | boolean => {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  return trimmed.replace(/^['"]|['"]$/g, '');
};

const parseSimpleYaml = (contents: string): AgenticConfig => {
  const result: Record<string, unknown> = {};
  let section: string | undefined;
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.replace(/\s+#.*$/, '');
    if (!line.trim()) continue;
    const sectionMatch = line.match(/^([A-Za-z0-9_-]+):\s*$/);
    if (sectionMatch?.[1]) {
      section = sectionMatch[1];
      result[section] = {};
      continue;
    }
    const pairMatch = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*(.+)$/) ?? line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
    if (!pairMatch?.[1] || pairMatch[2] === undefined) continue;
    if (rawLine.startsWith('  ') && section && typeof result[section] === 'object') {
      (result[section] as Record<string, unknown>)[pairMatch[1]] = parseScalar(pairMatch[2]);
    } else {
      result[pairMatch[1]] = parseScalar(pairMatch[2]);
    }
  }
  return result as AgenticConfig;
};

export const loadAgenticConfig = async (repoRoot = process.cwd()): Promise<AgenticConfig> => {
  const jsonPath = path.join(repoRoot, 'agentic.config.json');
  const yamlPath = path.join(repoRoot, 'agentic.config.yaml');
  const ymlPath = path.join(repoRoot, 'agentic.config.yml');
  let loaded: AgenticConfig = {};
  if (await exists(jsonPath)) {
    loaded = JSON.parse(await readFile(jsonPath, 'utf8')) as AgenticConfig;
  } else if (await exists(yamlPath)) {
    loaded = parseSimpleYaml(await readFile(yamlPath, 'utf8'));
  } else if (await exists(ymlPath)) {
    loaded = parseSimpleYaml(await readFile(ymlPath, 'utf8'));
  }
  return {
    ...DEFAULT_AGENTIC_CONFIG,
    ...loaded,
    paths: {
      ...DEFAULT_AGENTIC_CONFIG.paths,
      ...loaded.paths,
    },
    git: {
      ...DEFAULT_AGENTIC_CONFIG.git,
      ...loaded.git,
    },
  };
};

export const runnerPathsFromAgenticConfig = (
  repoRoot: string,
  config: AgenticConfig,
): RunnerPaths => {
  const defaults = defaultRunnerPaths(repoRoot);
  return {
    graphPath: resolveRepoPath(repoRoot, config.paths?.graphPath ?? defaults.graphPath),
    statePath: resolveRepoPath(repoRoot, config.paths?.statePath ?? defaults.statePath),
    policyPath: resolveRepoPath(repoRoot, config.paths?.policyPath ?? defaults.policyPath),
    promptsDir: resolveRepoPath(repoRoot, config.paths?.promptsDir ?? defaults.promptsDir),
  };
};

export const autopilotConfigPathFromAgenticConfig = (
  repoRoot: string,
  config: AgenticConfig,
): string => resolveRepoPath(repoRoot, config.paths?.autopilotConfigPath ?? 'automation/autopilot-config.json');
