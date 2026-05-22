import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { PlaythroughReview } from './reviewer-client.js';
import {
  collectDeveloperTaskDiagnostics,
  DeveloperTaskValidationError,
  formatDeveloperTaskValidationMessage,
  generateDeveloperTask,
  getDeveloperTaskOutputPath,
  renderChangelogTemplate,
  renderDeveloperTaskMarkdown,
  renderPatchPlanTemplate,
} from './developer-workflow.js';
import type { PlaythroughScorecard } from './types.js';
import { getVersionPaths } from './version-loop.js';

export const DEVELOPER_TASK_CLI_USAGE = `Usage:
  pnpm run developer-task -- --review <path> --scorecard <path> --target-version <v00X> --scope <text> --allowed <change> [--allowed <change> ...] --proposed <change> [--proposed <change> ...] [options]

Required:
  --review <path>           Previous review JSON (repo-relative to --runs-root when possible)
  --scorecard <path>        Previous scorecard JSON (repo-relative to --runs-root when possible)
  --target-version <id>     Target version id (v001-style)
  --scope <text>            Bounded target scope for the coding agent
  --allowed <change>        At least one allowed change (repeat flag for multiple entries)
  --proposed <change>       At least one proposed scoped change (repeat flag; at most 3 total)

Optional:
  --runs-root <path>        Runs root directory (default: current working directory)
  --forbidden <change>      Additional forbidden change (repeat flag)
  --test-command <cmd>      Required test command (repeat flag; defaults to standard repo gates)
  --expected-summary <text> Override expected implementation summary
  --write                   Write runs/<version>/developer_task.md
  --write-templates         Also write patch_plan.md and changelog.md templates for the target version
  --repo-root <path>        Repository root for repo-relative handoff paths (default: current working directory)
  --validate-only           Validate inputs and print diagnostics without generating markdown
  --help, -h                Show this help text

Notes:
  Human-governed handoff only. Validation reports all blocker diagnostics at once.
  Global forbidden rules are always listed so they are visible before implementation.
`;

interface ParsedArgs {
  reviewPath?: string;
  scorecardPath?: string;
  targetVersion?: string;
  targetScope?: string;
  allowed: string[];
  forbidden: string[];
  proposed: string[];
  testCommands: string[];
  expectedSummary?: string;
  runsRoot: string;
  repoRoot?: string;
  write: boolean;
  writeTemplates: boolean;
  validateOnly: boolean;
  help: boolean;
}

const parseArgs = (argv: string[]): ParsedArgs => {
  const args: ParsedArgs = {
    allowed: [],
    forbidden: [],
    proposed: [],
    testCommands: [],
    runsRoot: process.cwd(),
    write: false,
    writeTemplates: false,
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
    } else if (arg === '--review' && next) {
      args.reviewPath = next;
      index += 1;
    } else if (arg === '--scorecard' && next) {
      args.scorecardPath = next;
      index += 1;
    } else if (arg === '--target-version' && next) {
      args.targetVersion = next;
      index += 1;
    } else if ((arg === '--scope' || arg === '--target-scope') && next) {
      args.targetScope = next;
      index += 1;
    } else if (arg === '--allowed' && next) {
      args.allowed.push(next);
      index += 1;
    } else if (arg === '--forbidden' && next) {
      args.forbidden.push(next);
      index += 1;
    } else if ((arg === '--proposed' || arg === '--proposed-change') && next) {
      args.proposed.push(next);
      index += 1;
    } else if (arg === '--test-command' && next) {
      args.testCommands.push(next);
      index += 1;
    } else if (arg === '--expected-summary' && next) {
      args.expectedSummary = next;
      index += 1;
    } else if (arg === '--runs-root' && next) {
      args.runsRoot = next;
      index += 1;
    } else if (arg === '--repo-root' && next) {
      args.repoRoot = next;
      index += 1;
    } else if (arg === '--write') {
      args.write = true;
    } else if (arg === '--write-templates') {
      args.writeTemplates = true;
    } else if (arg === '--validate-only') {
      args.validateOnly = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}\n${DEVELOPER_TASK_CLI_USAGE}`);
    }
  }

  return args;
};

const requireArg = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`Missing required argument: --${name}\n${DEVELOPER_TASK_CLI_USAGE}`);
  }
  return value;
};

const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
};

const toRepoRelativePath = (runsRoot: string, absoluteOrRelative: string): string => {
  const resolved = path.isAbsolute(absoluteOrRelative)
    ? absoluteOrRelative
    : path.resolve(runsRoot, absoluteOrRelative);
  return path.relative(runsRoot, resolved).split(path.sep).join('/');
};

export const runDeveloperTaskCli = async (
  argv: string[] = process.argv.slice(2),
): Promise<{
  outputPath?: string;
  patchPlanPath?: string;
  changelogPath?: string;
  markdown?: string;
  validation?: ReturnType<typeof collectDeveloperTaskDiagnostics>;
}> => {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(DEVELOPER_TASK_CLI_USAGE);
    return {};
  }

  const runsRoot = path.resolve(args.runsRoot);
  const repoRoot = path.resolve(args.repoRoot ?? process.cwd());
  const reviewPath = path.resolve(runsRoot, requireArg(args.reviewPath, 'review'));
  const scorecardPath = path.resolve(runsRoot, requireArg(args.scorecardPath, 'scorecard'));
  const targetVersion = requireArg(args.targetVersion, 'target-version');
  const targetScope = requireArg(args.targetScope, 'scope');

  if (args.allowed.length === 0) {
    throw new Error(`Missing required argument: at least one --allowed entry\n${DEVELOPER_TASK_CLI_USAGE}`);
  }
  if (args.proposed.length === 0) {
    throw new Error(`Missing required argument: at least one --proposed entry\n${DEVELOPER_TASK_CLI_USAGE}`);
  }

  const review = await readJsonFile<PlaythroughReview>(reviewPath);
  const scorecard = await readJsonFile<PlaythroughScorecard>(scorecardPath);

  const taskInput = {
    review,
    scorecard,
    previousReviewPath: toRepoRelativePath(runsRoot, reviewPath),
    previousScorecardPath: toRepoRelativePath(runsRoot, scorecardPath),
    targetVersion,
    targetScope,
    allowedChanges: args.allowed,
    forbiddenChanges: args.forbidden,
    proposedChanges: args.proposed,
    requiredTestCommands: args.testCommands.length > 0 ? args.testCommands : undefined,
    expectedImplementationSummary: args.expectedSummary,
    runsRoot,
  };

  const validation = collectDeveloperTaskDiagnostics(taskInput);
  if (args.validateOnly) {
    process.stdout.write(`${formatDeveloperTaskValidationMessage(validation)}\n`);
    if (!validation.ok) {
      process.exitCode = 1;
    }
    return { validation };
  }

  if (!validation.ok) {
    throw new DeveloperTaskValidationError(
      formatDeveloperTaskValidationMessage(validation),
      validation.diagnostics,
    );
  }

  const task = generateDeveloperTask(taskInput, { repoRoot });
  const markdown = renderDeveloperTaskMarkdown(task);

  let outputPath: string | undefined;
  let patchPlanPath: string | undefined;
  let changelogPath: string | undefined;

  if (args.write || args.writeTemplates) {
    const versionDir = path.dirname(getDeveloperTaskOutputPath(runsRoot, targetVersion));
    await mkdir(versionDir, { recursive: true });
  }

  if (args.write) {
    outputPath = getDeveloperTaskOutputPath(runsRoot, targetVersion);
    await writeFile(outputPath, markdown, 'utf8');
  } else if (!args.writeTemplates) {
    process.stdout.write(`${markdown}\n`);
  }

  if (args.writeTemplates) {
    const paths = getVersionPaths(runsRoot, targetVersion);
    patchPlanPath = paths.patchPlanPath;
    changelogPath = paths.changelogPath;
    await writeFile(patchPlanPath, renderPatchPlanTemplate(task, review), 'utf8');
    await writeFile(changelogPath, renderChangelogTemplate(task), 'utf8');
  }

  return {
    outputPath,
    patchPlanPath,
    changelogPath,
    markdown: args.write || args.writeTemplates ? markdown : undefined,
  };
};

export const handleDeveloperTaskCliError = (error: unknown): void => {
  if (error instanceof DeveloperTaskValidationError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
};
