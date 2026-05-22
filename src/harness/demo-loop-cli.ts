import { handleCliError, writeJson } from './balance-cli-shared.js';
import { parseDemoLoopArgs, runDemoLoop } from './demo-loop.js';

export const runDemoLoopCli = async (argv: string[] = process.argv.slice(2)): Promise<void> => {
  const args = parseDemoLoopArgs(argv);
  writeJson(
    await runDemoLoop({
      runsRoot: args.runsRoot,
      ...(args.versions ? { versions: args.versions } : {}),
      ...(args.onExisting ? { onExisting: args.onExisting } : {}),
    }),
  );
};

runDemoLoopCli().catch(handleCliError);
