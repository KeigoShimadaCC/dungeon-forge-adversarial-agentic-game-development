import { parseSimulateSeedArgs, runPlaythrough } from './runner.js';

const isMainModule = (): boolean => {
  const entry = process.argv[1];
  return entry !== undefined && entry.endsWith('run-playthrough.js');
};

export const main = async (argv: string[] = process.argv.slice(2)): Promise<void> => {
  const args = parseSimulateSeedArgs(argv);
  const result = await runPlaythrough(args);

  process.stdout.write(
    `Saved trace: ${result.artifacts.tracePath}\nSaved scorecard: ${result.artifacts.scorecardPath}\nResult: ${result.trace.result} (${result.trace.turns} turns, ${result.trace.steps.length} steps)\n`,
  );
};

if (isMainModule()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
