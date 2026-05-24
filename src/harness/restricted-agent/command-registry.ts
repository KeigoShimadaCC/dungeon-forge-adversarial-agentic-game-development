import type { RestrictedAgentValidationDiagnostic } from './schemas.js';

export interface RestrictedAgentCommandDefinition {
  id: string;
  label: string;
  description: string;
  command: readonly string[];
}

export type RestrictedAgentCommandRegistry = Record<string, RestrictedAgentCommandDefinition>;

export const DEFAULT_RESTRICTED_AGENT_COMMAND_REGISTRY: RestrictedAgentCommandRegistry = {
  focused_tests: {
    id: 'focused_tests',
    label: 'Focused restricted-agent tests',
    description: 'Runs the focused tests for the restricted API coding agent.',
    command: ['pnpm', 'test', 'tests/restricted-agent-schemas.test.ts'],
  },
  all_tests: {
    id: 'all_tests',
    label: 'All tests',
    description: 'Runs the full Vitest suite.',
    command: ['pnpm', 'test'],
  },
  typecheck: {
    id: 'typecheck',
    label: 'TypeScript typecheck',
    description: 'Runs the repository TypeScript typecheck.',
    command: ['pnpm', 'run', 'typecheck'],
  },
  lint: {
    id: 'lint',
    label: 'ESLint',
    description: 'Runs repository lint checks.',
    command: ['pnpm', 'run', 'lint'],
  },
  build: {
    id: 'build',
    label: 'Build',
    description: 'Builds the TypeScript project.',
    command: ['pnpm', 'run', 'build'],
  },
  repo_check: {
    id: 'repo_check',
    label: 'Repository check',
    description: 'Runs the repository aggregate check script.',
    command: ['pnpm', 'run', 'check'],
  },
  diff_check: {
    id: 'diff_check',
    label: 'Git diff whitespace check',
    description: 'Runs the deterministic local diff whitespace check.',
    command: ['git', 'diff', '--check'],
  },
};

const RAW_COMMAND_PATTERN = /[\s;&|<>$`\\]/;

export const looksLikeRawShellCommand = (value: string): boolean =>
  RAW_COMMAND_PATTERN.test(value) ||
  /^(pnpm|npm|yarn|node|npx|git|gh|bash|sh|zsh|curl|python|python3)\b/.test(value);

export const validateRestrictedAgentRequestedChecks = (
  requestedChecks: readonly string[] | undefined,
  registry: RestrictedAgentCommandRegistry = DEFAULT_RESTRICTED_AGENT_COMMAND_REGISTRY,
): RestrictedAgentValidationDiagnostic[] => {
  const diagnostics: RestrictedAgentValidationDiagnostic[] = [];
  if (!requestedChecks) {
    return diagnostics;
  }

  for (const commandId of requestedChecks) {
    if (looksLikeRawShellCommand(commandId)) {
      diagnostics.push({
        category: 'command',
        field: 'requestedChecks',
        entry: commandId,
        message: 'Requested checks must be command IDs, not raw shell command strings.',
      });
      continue;
    }

    const command = registry[commandId];
    if (!command || command.id !== commandId) {
      diagnostics.push({
        category: 'command',
        field: 'requestedChecks',
        entry: commandId,
        message: `Unknown restricted-agent command ID: ${commandId}`,
      });
    }
  }

  return diagnostics;
};
