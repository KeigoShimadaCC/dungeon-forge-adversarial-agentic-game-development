import {
  handleLoopCoordinatorCliError,
  runLoopCoordinatorCli,
} from './loop-coordinator-cli.js';

runLoopCoordinatorCli().catch(handleLoopCoordinatorCliError);
