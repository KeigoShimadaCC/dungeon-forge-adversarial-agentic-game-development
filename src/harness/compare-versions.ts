import { handleCliError, runCli } from './version-loop-cli.js';

runCli('compare-versions').catch(handleCliError);
