import { DEFAULT_RESTRICTED_AGENT_COMMAND_REGISTRY } from './command-registry.js';
import { runRestrictedAgentRepairLoop } from './repair-loop.js';
import type { RestrictedAgentTurnInput } from './schemas.js';

export const RESTRICTED_AGENT_REPAIR_LOOP_USAGE =
  'Usage: restricted-agent-repair-loop --provider fake --phase <phase> --task <task> --max-attempts <n> --checks <ids> --out <dir>';

const parseArgs = (args: string[]): Record<string, string> => {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const entry = args[index];
    if (!entry?.startsWith('--')) {
      continue;
    }
    const key = entry.slice(2);
    const value = args[index + 1];
    if (value && !value.startsWith('--')) {
      parsed[key] = value;
      index += 1;
    } else {
      parsed[key] = 'true';
    }
  }
  return parsed;
};

export const buildRepairLoopTurnInput = (options: {
  phase: string;
  taskId: string;
  checks: string[];
}): RestrictedAgentTurnInput => ({
  schemaVersion: 1,
  phase: options.phase,
  taskId: options.taskId,
  objective: 'Run restricted-agent whitelisted checks and bounded repair loop smoke.',
  allowedPaths: ['src/harness/restricted-agent/**', 'tests/restricted-agent-check-runner.test.ts'],
  forbiddenPaths: ['.env', 'runs/**', 'private/**'],
  relevantSnippets: [],
  previousFailedChecks: [],
  patchBudget: { maxFiles: 1, maxBytes: 2000 },
  availableCommands: options.checks.map((id) => {
    const command = DEFAULT_RESTRICTED_AGENT_COMMAND_REGISTRY[id];
    return {
      id,
      label: command?.label ?? id,
      description: command?.description ?? 'Requested check command ID.',
    };
  }),
});

export const runRestrictedAgentRepairLoopCli = async (args = process.argv.slice(2)): Promise<number> => {
  const parsed = parseArgs(args);
  if (parsed.provider !== 'fake') {
    console.error('Only --provider fake is supported by the PHASE-30C smoke CLI.');
    console.error(RESTRICTED_AGENT_REPAIR_LOOP_USAGE);
    return 2;
  }
  if (!parsed.phase || !parsed.task || !parsed.out) {
    console.error(RESTRICTED_AGENT_REPAIR_LOOP_USAGE);
    return 2;
  }
  const checks = (parsed.checks ?? 'focused_tests').split(',').filter(Boolean);
  const maxAttempts = Number.parseInt(parsed['max-attempts'] ?? '1', 10);
  const turnInput = buildRepairLoopTurnInput({
    phase: parsed.phase,
    taskId: parsed.task,
    checks,
  });
  const report = await runRestrictedAgentRepairLoop({
    turnInput,
    cwd: process.cwd(),
    outDir: parsed.out,
    maxAttempts,
    fakeResponses: [
      JSON.stringify({
        schemaVersion: 1,
        phase: parsed.phase,
        taskId: parsed.task,
        action: 'request_check',
        rationale: 'Fake repair-loop smoke requests whitelisted checks only.',
        requestedChecks: checks,
      }),
    ],
    registry: {
      ...DEFAULT_RESTRICTED_AGENT_COMMAND_REGISTRY,
      focused_tests: {
        id: 'focused_tests',
        label: 'PHASE-30C focused tests',
        description: 'Runs the restricted-agent check-runner focused tests.',
        command: ['pnpm', 'test', 'tests/restricted-agent-check-runner.test.ts'],
      },
    },
  });
  console.log(JSON.stringify({
    status: report.status,
    attempts: report.attempts.length,
    reportPath: `${parsed.out}/repair-loop-report.json`,
  }));
  return report.status === 'pass' ? 0 : 2;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runRestrictedAgentRepairLoopCli().then((code) => {
    process.exitCode = code;
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
