import { handlePatchProposalCliError, runPatchProposalCli } from './patch-proposal-cli.js';

runPatchProposalCli().catch(handlePatchProposalCliError);
