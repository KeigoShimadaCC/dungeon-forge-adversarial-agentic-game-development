import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { PlaythroughReview } from './reviewer-client.js';
import {
  generateDeveloperTask,
  getDeveloperTaskOutputPath,
  renderDeveloperTaskMarkdown,
} from './developer-workflow.js';
import type { PlaythroughScorecard } from './types.js';

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
  write: boolean;
}

const parseArgs = (argv: string[]): ParsedArgs => {
  const args: ParsedArgs = {
    allowed: [],
    forbidden: [],
    proposed: [],
    testCommands: [],
    runsRoot: process.cwd(),
    write: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--') {
      continue;
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
    } else if (arg === '--write') {
      args.write = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  return args;
};

const requireArg = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`Missing required argument: --${name}`);
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
): Promise<{ outputPath?: string; markdown: string }> => {
  const args = parseArgs(argv);
  const runsRoot = path.resolve(args.runsRoot);
  const reviewPath = path.resolve(runsRoot, requireArg(args.reviewPath, 'review'));
  const scorecardPath = path.resolve(runsRoot, requireArg(args.scorecardPath, 'scorecard'));
  const targetVersion = requireArg(args.targetVersion, 'target-version');
  const targetScope = requireArg(args.targetScope, 'scope');

  if (args.allowed.length === 0) {
    throw new Error('Missing required argument: at least one --allowed entry');
  }
  if (args.proposed.length === 0) {
    throw new Error('Missing required argument: at least one --proposed entry');
  }

  const review = await readJsonFile<PlaythroughReview>(reviewPath);
  const scorecard = await readJsonFile<PlaythroughScorecard>(scorecardPath);

  const task = generateDeveloperTask({
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
  });

  const markdown = renderDeveloperTaskMarkdown(task);

  if (args.write) {
    const outputPath = getDeveloperTaskOutputPath(runsRoot, targetVersion);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, markdown, 'utf8');
    return { outputPath, markdown };
  }

  process.stdout.write(`${markdown}\n`);
  return { markdown };
};

export const handleDeveloperTaskCliError = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
};
