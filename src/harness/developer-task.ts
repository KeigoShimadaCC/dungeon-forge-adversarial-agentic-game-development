import { handleDeveloperTaskCliError, runDeveloperTaskCli } from './developer-workflow-cli.js';

runDeveloperTaskCli().catch(handleDeveloperTaskCliError);
