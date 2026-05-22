import { handleCliError, runCli } from './version-loop-cli.js';

runCli('summarize-version').catch(handleCliError);
