import { DEFAULT_RESTRICTED_AGENT_COMMAND_REGISTRY } from './command-registry.js';
import {
  buildDefaultFakeResponse,
  runRestrictedAgentDryRun,
  type RestrictedAgentDryRunProviderMode,
} from './api-loop.js';
import { RESTRICTED_AGENT_SCHEMA_VERSION, type RestrictedAgentTurnInput } from './schemas.js';

export const RESTRICTED_AGENT_DRY_RUN_USAGE = [
  'Usage: pnpm run restricted-agent-dry-run -- --provider <fake|real> --phase <id> --task <id> --out <dir> [--fake-response malformed|valid]',
  '',
  'Fake provider mode is credential-free and deterministic.',
  'Real provider mode is explicit and blocks without configured LLM credentials.',
].join('\n');

interface RestrictedAgentDryRunCliArgs {
  provider: RestrictedAgentDryRunProviderMode;
  phase: string;
  taskId: string;
  outDir: string;
  fakeResponse: 'valid' | 'malformed';
  help: boolean;
}

const parseArgs = (argv: string[]): RestrictedAgentDryRunCliArgs => {
  const args: RestrictedAgentDryRunCliArgs = {
    provider: 'fake',
    phase: 'PHASE-29C',
    taskId: 'task-001',
    outDir: 'runs/restricted-agent/PHASE-29C/dry-run',
    fakeResponse: 'valid',
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    const next = argv[index + 1];
    if (entry === '--help' || entry === '-h') {
      args.help = true;
      continue;
    }
    if (entry === '--') {
      continue;
    }
    if (entry === '--provider' && (next === 'fake' || next === 'real')) {
      args.provider = next;
      index += 1;
      continue;
    }
    if (entry === '--phase' && next) {
      args.phase = next;
      index += 1;
      continue;
    }
    if (entry === '--task' && next) {
      args.taskId = next;
      index += 1;
      continue;
    }
    if (entry === '--out' && next) {
      args.outDir = next;
      index += 1;
      continue;
    }
    if (entry === '--fake-response' && (next === 'valid' || next === 'malformed')) {
      args.fakeResponse = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${entry}`);
  }

  return args;
};

const buildCliTurnInput = (phase: string, taskId: string): RestrictedAgentTurnInput => ({
  schemaVersion: RESTRICTED_AGENT_SCHEMA_VERSION,
  phase,
  taskId,
  objective: 'PHASE-29C dry-run smoke for restricted-agent API loop.',
  allowedPaths: ['src/harness/restricted-agent/**'],
  forbiddenPaths: ['.env', 'runs/**', 'private/**'],
  relevantSnippets: [],
  previousFailedChecks: [],
  patchBudget: { maxFiles: 2, maxBytes: 4000 },
  availableCommands: Object.values(DEFAULT_RESTRICTED_AGENT_COMMAND_REGISTRY).map(
    ({ id, label, description }) => ({ id, label, description }),
  ),
});

export const runRestrictedAgentDryRunCli = async (
  argv: string[] = process.argv.slice(2),
  io: { stdout: Pick<NodeJS.WriteStream, 'write'>; stderr: Pick<NodeJS.WriteStream, 'write'> } = {
    stdout: process.stdout,
    stderr: process.stderr,
  },
): Promise<number> => {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      io.stdout.write(`${RESTRICTED_AGENT_DRY_RUN_USAGE}\n`);
      return 0;
    }

    const turnInput = buildCliTurnInput(args.phase, args.taskId);
    const fakeResponse =
      args.fakeResponse === 'malformed' ? '```json\n{}\n```' : buildDefaultFakeResponse(turnInput);
    const result = await runRestrictedAgentDryRun({
      turnInput,
      outDir: args.outDir,
      providerMode: args.provider,
      fakeResponse,
    });
    io.stdout.write(`${JSON.stringify(result.decision, null, 2)}\n`);
    return result.decision.status === 'accepted' ? 0 : 2;
  } catch (error) {
    io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const exitCode = await runRestrictedAgentDryRunCli();
  process.exitCode = exitCode;
}
