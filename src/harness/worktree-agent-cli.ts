import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from './json.js';
import {
  buildEmptyWorktreeResultSummary,
  buildWorktreeTaskBundleFromPhase,
  collectWorktreeTaskDiagnostics,
  formatWorktreeTaskValidationMessage,
  getWorktreeResultSummaryOutputPath,
  getWorktreeTaskBundleOutputPath,
  normalizeWorktreeResultSummary,
  validateWorktreeResultSummary,
  WorktreeTaskValidationError,
  type WorktreeResultSummary,
  type WorktreeTaskBundle,
  type WorktreeTaskKind,
} from './worktree-agent-orchestration.js';

export const WORKTREE_AGENT_CLI_USAGE = `Usage:
  pnpm run worktree-task -- --phase <PHASE-15B> [--kind implementation|read_only_audit] [options]
  pnpm run worktree-task -- --validate-result <path>

Options:
  --phase <id>               Phase id from automation/phase-graph.json (required for bundle generation)
  --kind <kind>              implementation (default) or read_only_audit
  --repo-root <path>         Repository root (default: current working directory)
  --runs-root <path>         Runs root for output artifacts (default: repo-root)
  --patch-proposal <path>    Optional patch_proposal.json to link as evidence
  --target-version <id>      Optional target version for implementation bundles
  --target-scope <text>      Optional scope override
  --developer-task <path>    Optional developer_task.md path for linkage
  --review-target <path>     Repeatable audit review target (auditor tasks only)
  --write                    Write bundle JSON under runs/worktree-tasks/<phase>/
  --write-result-template    Also write an empty result_summary.json template for orchestrator fill-in
  --validate-only            Validate bundle without writing JSON
  --validate-result <path>   Validate a result summary JSON file
  --help, -h                 Show this help text

Notes:
  Bundles package bounded coding-agent work for isolated worktrees. They do not merge, push, or open PRs.
  Orchestrator-owned local gates (pnpm run check, etc.) remain authoritative over agent reports.
`;

interface ParsedArgs {
  phaseId?: string;
  taskKind: WorktreeTaskKind;
  repoRoot: string;
  runsRoot?: string;
  patchProposalPath?: string;
  targetVersion?: string;
  targetScope?: string;
  developerTaskPath?: string;
  reviewTargets: string[];
  write: boolean;
  writeResultTemplate: boolean;
  validateOnly: boolean;
  validateResultPath?: string;
  help: boolean;
}

const parseArgs = (argv: string[]): ParsedArgs => {
  const args: ParsedArgs = {
    taskKind: 'implementation',
    repoRoot: process.cwd(),
    reviewTargets: [],
    write: false,
    writeResultTemplate: false,
    validateOnly: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--') {
      continue;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--phase' && next) {
      args.phaseId = next;
      index += 1;
    } else if (arg === '--kind' && next) {
      if (next !== 'implementation' && next !== 'read_only_audit') {
        throw new Error(`Invalid --kind value: ${next}\n${WORKTREE_AGENT_CLI_USAGE}`);
      }
      args.taskKind = next;
      index += 1;
    } else if (arg === '--repo-root' && next) {
      args.repoRoot = next;
      index += 1;
    } else if (arg === '--runs-root' && next) {
      args.runsRoot = next;
      index += 1;
    } else if (arg === '--patch-proposal' && next) {
      args.patchProposalPath = next;
      index += 1;
    } else if (arg === '--target-version' && next) {
      args.targetVersion = next;
      index += 1;
    } else if ((arg === '--target-scope' || arg === '--scope') && next) {
      args.targetScope = next;
      index += 1;
    } else if (arg === '--developer-task' && next) {
      args.developerTaskPath = next;
      index += 1;
    } else if (arg === '--review-target' && next) {
      args.reviewTargets.push(next);
      index += 1;
    } else if (arg === '--write') {
      args.write = true;
    } else if (arg === '--write-result-template') {
      args.writeResultTemplate = true;
    } else if (arg === '--validate-only') {
      args.validateOnly = true;
    } else if (arg === '--validate-result' && next) {
      args.validateResultPath = next;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}\n${WORKTREE_AGENT_CLI_USAGE}`);
    }
  }

  return args;
};

const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
};

export const runWorktreeAgentCli = async (
  argv: string[] = process.argv.slice(2),
): Promise<{
  bundlePath?: string;
  resultPath?: string;
  bundle?: WorktreeTaskBundle;
  result?: WorktreeResultSummary;
}> => {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(WORKTREE_AGENT_CLI_USAGE);
    return {};
  }

  if (args.validateResultPath) {
    const resultPath = path.resolve(args.validateResultPath);
    const summary = normalizeWorktreeResultSummary(
      await readJsonFile<WorktreeResultSummary>(resultPath),
    );
    const validation = validateWorktreeResultSummary(summary);
    process.stdout.write(`${formatWorktreeTaskValidationMessage({
      ok: validation.ok,
      diagnostics: validation.diagnostics,
      blockers: validation.diagnostics.filter((entry) => entry.category === 'blocker'),
      warnings: validation.diagnostics.filter((entry) => entry.category === 'warning'),
    })}\n`);
    process.stdout.write(`overall_status: ${summary.overall_status}\n`);
    if (!validation.ok) {
      process.exitCode = 1;
    }
    return { result: summary };
  }

  if (!args.phaseId) {
    throw new Error(`Missing required argument: --phase\n${WORKTREE_AGENT_CLI_USAGE}`);
  }

  const repoRoot = path.resolve(args.repoRoot);
  const runsRoot = path.resolve(args.runsRoot ?? repoRoot);

  const bundle = await buildWorktreeTaskBundleFromPhase(repoRoot, args.phaseId, {
    taskKind: args.taskKind,
    runsRoot,
    patchProposalPath: args.patchProposalPath,
    targetVersion: args.targetVersion,
    targetScope: args.targetScope,
    developerTaskPath: args.developerTaskPath,
    reviewTargets: args.reviewTargets.length > 0 ? args.reviewTargets : undefined,
  });

  const validation = await collectWorktreeTaskDiagnostics(bundle, {
    verifyEvidenceFiles: true,
  });

  if (args.validateOnly) {
    process.stdout.write(`${formatWorktreeTaskValidationMessage(validation)}\n`);
    if (!validation.ok) {
      process.exitCode = 1;
    }
    return { bundle, ...{ validation } };
  }

  if (!validation.ok) {
    throw new WorktreeTaskValidationError(
      formatWorktreeTaskValidationMessage(validation),
      validation.diagnostics,
    );
  }

  if (args.write || args.writeResultTemplate) {
    const bundlePath = getWorktreeTaskBundleOutputPath(runsRoot, args.phaseId, args.taskKind);
    await mkdir(path.dirname(bundlePath), { recursive: true });
    await writeFile(bundlePath, stringifyDeterministicJson(bundle), 'utf8');
    process.stdout.write(`Wrote worktree task bundle to ${bundlePath}\n`);

    let resultPath: string | undefined;
    if (args.writeResultTemplate) {
      resultPath = getWorktreeResultSummaryOutputPath(runsRoot, args.phaseId);
      const template = buildEmptyWorktreeResultSummary(bundle);
      await writeFile(resultPath, stringifyDeterministicJson(template), 'utf8');
      process.stdout.write(`Wrote result summary template to ${resultPath}\n`);
    }

    return { bundlePath, resultPath, bundle };
  }

  process.stdout.write(`${stringifyDeterministicJson(bundle)}\n`);
  return { bundle };
};

export const handleWorktreeAgentCliError = (error: unknown): void => {
  if (error instanceof WorktreeTaskValidationError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
};
