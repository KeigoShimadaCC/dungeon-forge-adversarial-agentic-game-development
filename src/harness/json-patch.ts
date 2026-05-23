import { handleJsonPatchCliError, runJsonPatchCli } from './json-patch-cli.js';

runJsonPatchCli().catch(handleJsonPatchCliError);
