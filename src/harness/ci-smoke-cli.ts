import { handleCliError, writeJson } from './balance-cli-shared.js';
import { runCiSmoke } from './ci-smoke.js';

const parseArgs = (
  argv: string[],
): {
  version?: string;
} => {
  const args: { version?: string } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--') {
      continue;
    } else if (arg === '--version' && next) {
      args.version = next;
      index += 1;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
};

export const runCiSmokeCli = async (argv: string[] = process.argv.slice(2)): Promise<void> => {
  const args = parseArgs(argv);
  const result = await runCiSmoke({ version: args.version });
  writeJson(result);
  if (!result.ok) {
    process.exitCode = 1;
    const sample = result.failed_runs
      .slice(0, 5)
      .map(
        (run) =>
          `${run.seed}/${run.policy} (${run.result}: ${run.problem_reasons.join(', ')})`,
      )
      .join('; ');
    process.stderr.write(
      `CI smoke failed: ${result.failed_runs.length}/${result.total_runs} runs had protocol problems. Sample: ${sample}\n`,
    );
  }
};

const isMainModule = (): boolean => {
  const entry = process.argv[1];
  return entry !== undefined && entry.endsWith('ci-smoke-cli.js');
};

if (isMainModule()) {
  runCiSmokeCli().catch(handleCliError);
}
