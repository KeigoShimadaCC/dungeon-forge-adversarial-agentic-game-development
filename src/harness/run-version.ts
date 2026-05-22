import { handleCliError, runCli } from './version-loop-cli.js';

runCli('run-version').catch(handleCliError);
