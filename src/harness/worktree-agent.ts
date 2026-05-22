import { handleWorktreeAgentCliError, runWorktreeAgentCli } from './worktree-agent-cli.js';

runWorktreeAgentCli().catch(handleWorktreeAgentCliError);
