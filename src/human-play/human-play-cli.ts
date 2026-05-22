import { HUMAN_PLAY_CLI_USAGE, parseHumanPlayCliArgs } from './cli-args.js';
import { runHumanPlaySession } from './session.js';
import { runTerminalHumanPlay } from './terminal.js';

const isMainModule = (): boolean => {
  const entry = process.argv[1];
  return entry !== undefined && entry.endsWith('human-play-cli.js');
};

export const runHumanPlayCli = async (argv: string[] = process.argv.slice(2)): Promise<void> => {
  const args = parseHumanPlayCliArgs(argv);
  if (args.help) {
    process.stdout.write(`${HUMAN_PLAY_CLI_USAGE}\n`);
    return;
  }

  const sessionOptions = {
    seed: args.seed,
    version: args.version,
    mode: args.mode,
    runsRoot: args.runsRoot,
    saveTrace: args.saveTrace,
    ...(args.challengeMode ? { challengeMode: args.challengeMode } : {}),
    ...(args.scenarioPack ? { scenarioPack: args.scenarioPack } : {}),
    ...(args.scriptIndices ? { scriptIndices: args.scriptIndices } : {}),
    ...(args.maxSteps !== undefined ? { maxSteps: args.maxSteps } : {}),
  };

  const result =
    args.mode === 'terminal'
      ? await runTerminalHumanPlay(sessionOptions)
      : await runHumanPlaySession(sessionOptions);

  const lines = [
    `Result: ${result.trace.result} (${result.trace.turns} turns, ${result.steps.length} steps)`,
    `Terminal status: ${result.trace.result}`,
  ];
  if (result.tracePath) {
    lines.push(`Saved trace: ${result.tracePath}`);
  }
  if (result.scorecardPath) {
    lines.push(`Saved scorecard: ${result.scorecardPath}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
};

if (isMainModule()) {
  runHumanPlayCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
