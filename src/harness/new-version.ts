import { handleCliError, runCli } from './version-loop-cli.js';

runCli('new-version').catch(handleCliError);
