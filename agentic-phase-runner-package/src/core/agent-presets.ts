import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { autopilotConfigPathFromAgenticConfig, loadAgenticConfig } from '../config/load-config.js';
import type { AgentTemplateConfig } from '../adapters/agent-adapters.js';
import type { AutopilotConfig } from './phase-autopilot.js';
import { classifyCommandSafety, type CommandSafetyReport } from './command-safety.js';
import { stringifyDeterministicJson } from './json.js';

export type AgentPresetId =
  | 'manual'
  | 'codex'
  | 'cursor'
  | 'claude-code'
  | 'mixed-codex-cursor'
  | 'fake-shell-test';

export interface AgentPresetDefinition {
  id: AgentPresetId;
  description: string;
  changedAgentRoles: Array<keyof AutopilotConfig['agents']>;
  notes: string[];
}

export interface ConfigureAgentResult {
  schemaVersion: 1;
  status: 'planned' | 'applied';
  preset: AgentPresetId;
  targetPath: string;
  changedAgentRoles: string[];
  commandSafety: CommandSafetyReport[];
  warnings: string[];
  recommendedNextActions: string[];
  preview?: Pick<AutopilotConfig, 'agents'>;
}

const defaultShellFields = {
  timeoutMs: 1800000,
  inactivityTimeoutMs: 300000,
  maxRetries: 0,
};

const defaultManualCommand = "codex exec \"$(cat '{{PROMPT_PATH}}')\"";
const codexTemplate = "codex exec \"$(cat '{{PROMPT_PATH}}')\"";
const cursorTemplate = "agent --print --trust --workspace '{{WORKSPACE}}' \"$(cat '{{PROMPT_PATH}}')\"";
const claudeTemplate = "claude --print \"$(cat '{{PROMPT_PATH}}')\"";

const findPackageRoot = async (): Promise<string> => {
  let current = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(current, 'package.json');
    try {
      await readFile(candidate, 'utf8');
      return current;
    } catch {
      current = path.dirname(current);
    }
  }
  throw new Error('Unable to locate package root.');
};

export const listAgentPresets = (): AgentPresetDefinition[] => [
  {
    id: 'manual',
    description: 'Set all agent providers to manual.',
    changedAgentRoles: ['planner', 'executor', 'rechecker', 'cursorSubtask'],
    notes: ['Safe default. No shell agent commands run.'],
  },
  {
    id: 'codex',
    description: 'Use Codex shell commands for planner, executor, and rechecker.',
    changedAgentRoles: ['planner', 'executor', 'rechecker'],
    notes: ['Review the Codex command locally before enabling supervised execution.'],
  },
  {
    id: 'cursor',
    description: 'Use Cursor Agent shell command for delegated cursorSubtask only.',
    changedAgentRoles: ['cursorSubtask'],
    notes: ['Planner, executor, and rechecker remain manual unless separately configured.'],
  },
  {
    id: 'claude-code',
    description: 'Use a conservative Claude Code placeholder template for planner, executor, and rechecker.',
    changedAgentRoles: ['planner', 'executor', 'rechecker'],
    notes: ['Placeholder only. Review and edit the command before use in a target repo.'],
  },
  {
    id: 'mixed-codex-cursor',
    description: 'Use Codex for planner/executor/rechecker and Cursor for delegated subtasks.',
    changedAgentRoles: ['planner', 'executor', 'rechecker', 'cursorSubtask'],
    notes: ['Review both shell command templates before supervised execution.'],
  },
  {
    id: 'fake-shell-test',
    description: 'Use package-local fake shell agents for tests only.',
    changedAgentRoles: ['planner', 'executor', 'rechecker'],
    notes: ['Test-only preset. Do not use for real implementation work.'],
  },
];

const requirePreset = (preset: string): AgentPresetId => {
  if (
    preset === 'manual' ||
    preset === 'codex' ||
    preset === 'cursor' ||
    preset === 'claude-code' ||
    preset === 'mixed-codex-cursor' ||
    preset === 'fake-shell-test'
  ) {
    return preset;
  }
  throw new Error(`Unknown preset: ${preset}`);
};

const withManualProvider = (agent: AgentTemplateConfig | undefined): AgentTemplateConfig => ({
  ...(agent ?? { commandTemplate: defaultManualCommand }),
  commandTemplate: agent?.commandTemplate ?? defaultManualCommand,
  provider: 'manual',
});

const shellAgent = (commandTemplate: string, fallback?: AgentTemplateConfig): AgentTemplateConfig => ({
  ...defaultShellFields,
  ...(fallback ?? {}),
  provider: 'shell',
  commandTemplate,
});

const fakeAgentCommand = async (role: 'planner' | 'executor' | 'rechecker'): Promise<string> => {
  const packageRoot = await findPackageRoot();
  return `node ${JSON.stringify(path.join(packageRoot, 'tests', 'fixtures', 'fake-agents', `fake-${role}.mjs`))} --prompt '{{PROMPT_PATH}}' --output '{{OUTPUT_PATH}}' --workspace '{{WORKSPACE}}' --phase '{{PHASE_ID}}'`;
};

const applyPresetToAgents = async (
  preset: AgentPresetId,
  agents: AutopilotConfig['agents'],
): Promise<AutopilotConfig['agents']> => {
  const next = {
    planner: agents.planner,
    executor: agents.executor,
    rechecker: agents.rechecker,
    ...(agents.cursorSubtask ? { cursorSubtask: agents.cursorSubtask } : {}),
  };
  if (preset === 'manual') {
    return {
      planner: withManualProvider(next.planner),
      executor: withManualProvider(next.executor),
      rechecker: withManualProvider(next.rechecker),
      cursorSubtask: withManualProvider(next.cursorSubtask),
    };
  }
  if (preset === 'codex') {
    return {
      ...next,
      planner: shellAgent(codexTemplate, next.planner),
      executor: shellAgent(codexTemplate, next.executor),
      rechecker: shellAgent(codexTemplate, next.rechecker),
    };
  }
  if (preset === 'cursor') {
    return {
      ...next,
      cursorSubtask: shellAgent(cursorTemplate, next.cursorSubtask),
    };
  }
  if (preset === 'claude-code') {
    return {
      ...next,
      planner: shellAgent(claudeTemplate, next.planner),
      executor: shellAgent(claudeTemplate, next.executor),
      rechecker: shellAgent(claudeTemplate, next.rechecker),
    };
  }
  if (preset === 'mixed-codex-cursor') {
    return {
      planner: shellAgent(codexTemplate, next.planner),
      executor: shellAgent(codexTemplate, next.executor),
      rechecker: shellAgent(codexTemplate, next.rechecker),
      cursorSubtask: shellAgent(cursorTemplate, next.cursorSubtask),
    };
  }
  return {
    ...next,
    planner: shellAgent(await fakeAgentCommand('planner'), next.planner),
    executor: shellAgent(await fakeAgentCommand('executor'), next.executor),
    rechecker: shellAgent(await fakeAgentCommand('rechecker'), next.rechecker),
  };
};

const changedRolesForPreset = (preset: AgentPresetId): string[] =>
  listAgentPresets().find((entry) => entry.id === preset)?.changedAgentRoles.map(String) ?? [];

const safetyReportsForAgents = (agents: AutopilotConfig['agents']): CommandSafetyReport[] =>
  Object.values(agents)
    .filter((agent): agent is AgentTemplateConfig => Boolean(agent) && agent.provider === 'shell')
    .map((agent) => classifyCommandSafety(agent.commandTemplate))
    .filter((report) => report.status !== 'safe');

export const configureAgentPreset = async (
  repoRootInput: string,
  options: { preset: string; apply?: boolean },
): Promise<ConfigureAgentResult> => {
  const repoRoot = path.resolve(repoRootInput);
  const preset = requirePreset(options.preset);
  const agenticConfig = await loadAgenticConfig(repoRoot);
  const targetPath = autopilotConfigPathFromAgenticConfig(repoRoot, agenticConfig);
  const config = JSON.parse(await readFile(targetPath, 'utf8')) as AutopilotConfig;
  const agents = await applyPresetToAgents(preset, config.agents);
  const nextConfig: AutopilotConfig = { ...config, agents };
  const commandSafety = safetyReportsForAgents(agents);
  const warnings = [
    ...listAgentPresets().find((entry) => entry.id === preset)!.notes,
    ...commandSafety.map((report) => `${report.status}: ${report.command}`),
  ];

  if (options.apply === true) {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, stringifyDeterministicJson(nextConfig));
  }

  return {
    schemaVersion: 1,
    status: options.apply === true ? 'applied' : 'planned',
    preset,
    targetPath,
    changedAgentRoles: changedRolesForPreset(preset),
    commandSafety,
    warnings,
    recommendedNextActions: [
      'Run agentic doctor --repo-root .',
      'Run agentic run --repo-root . --phase PHASE-01A --mode supervised --agents shell --dry-run',
    ],
    ...(options.apply === true ? {} : { preview: { agents } }),
  };
};

