import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from './json.js';
import type { PlaythroughReview } from './reviewer-client.js';
import {
  assembleStructuredPatchProposal,
  buildPatchProposalChangesFromReview,
  collectPatchProposalDiagnostics,
  formatPatchProposalValidationMessage,
  getPatchProposalOutputPath,
  PatchProposalValidationError,
  validatePatchProposalReviewContext,
  type PatchProposalAssemblyInput,
  type StructuredPatchProposal,
} from './structured-patch-proposal.js';
import type { PlaythroughScorecard } from './types.js';
import { getVersionPaths } from './version-loop.js';

export const PATCH_PROPOSAL_CLI_USAGE = `Usage:
  pnpm run patch-proposal -- --review <path> --scorecard <path> --base-version <v00X> --target-version <v00Y> --scope <text> --allowed-path <path> [--allowed-path <path> ...] [options]

Required:
  --review <path>            Base-version review JSON (relative to --runs-root when possible)
  --scorecard <path>         Base-version scorecard JSON
  --base-version <id>        Source evidence version (v001-style)
  --target-version <id>      Target implementation version
  --scope <text>             Bounded target scope summary
  --allowed-path <prefix>    At least one allowed path prefix (repeat flag)

Optional:
  --trace <path>             Trace JSON path (default: review.trace_path or inferred from review/scorecard)
  --acceptance <path>        Optional acceptance.md path for linkage only
  --runs-root <path>         Runs root directory (default: current working directory)
  --risk <text>              Risk note (repeat flag)
  --test-command <cmd>       Validation command (repeat flag; defaults to standard repo gates)
  --write                    Write runs/<target>/patch_proposal.json (non-mutating planning artifact)
  --validate-only            Validate and print diagnostics without writing JSON
  --help, -h                 Show this help text

Notes:
  Proposals are planning artifacts only. They do not edit source files or apply patches automatically.
  Use developer-task with the proposal evidence paths after a human owner accepts the proposal scope.
`;

interface ParsedArgs {
  reviewPath?: string;
  scorecardPath?: string;
  tracePath?: string;
  acceptancePath?: string;
  baseVersion?: string;
  targetVersion?: string;
  targetScope?: string;
  allowedPaths: string[];
  risks: string[];
  testCommands: string[];
  runsRoot: string;
  write: boolean;
  validateOnly: boolean;
  help: boolean;
}

const parseArgs = (argv: string[]): ParsedArgs => {
  const args: ParsedArgs = {
    allowedPaths: [],
    risks: [],
    testCommands: [],
    runsRoot: process.cwd(),
    write: false,
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
    } else if (arg === '--trace' && next) {
      args.tracePath = next;
      index += 1;
    } else if (arg === '--acceptance' && next) {
      args.acceptancePath = next;
      index += 1;
    } else if (arg === '--base-version' && next) {
      args.baseVersion = next;
      index += 1;
    } else if (arg === '--target-version' && next) {
      args.targetVersion = next;
      index += 1;
    } else if ((arg === '--scope' || arg === '--target-scope') && next) {
      args.targetScope = next;
      index += 1;
    } else if (arg === '--allowed-path' && next) {
      args.allowedPaths.push(next);
      index += 1;
    } else if (arg === '--risk' && next) {
      args.risks.push(next);
      index += 1;
    } else if (arg === '--test-command' && next) {
      args.testCommands.push(next);
      index += 1;
    } else if (arg === '--runs-root' && next) {
      args.runsRoot = next;
      index += 1;
    } else if (arg === '--write') {
      args.write = true;
    } else if (arg === '--validate-only') {
      args.validateOnly = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}\n${PATCH_PROPOSAL_CLI_USAGE}`);
    }
  }

  return args;
};

const requireArg = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`Missing required argument: --${name}\n${PATCH_PROPOSAL_CLI_USAGE}`);
  }
  return value;
};

const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
};

const toRunsRelativePath = (runsRoot: string, absoluteOrRelative: string): string => {
  const resolved = path.isAbsolute(absoluteOrRelative)
    ? absoluteOrRelative
    : path.resolve(runsRoot, absoluteOrRelative);
  return path.relative(runsRoot, resolved).split(path.sep).join('/');
};

const inferTracePath = (
  review: PlaythroughReview,
  scorecard: PlaythroughScorecard,
  explicit?: string,
): string => {
  if (explicit?.trim()) {
    return explicit.trim();
  }
  if (review.trace_path?.trim()) {
    return review.trace_path.trim();
  }
  if (scorecard.trace_path?.trim()) {
    return scorecard.trace_path.trim();
  }
  return path.join(
    'runs',
    review.version,
    'traces',
    `${review.seed}_${review.persona}.json`,
  );
};

export const buildPatchProposalAssemblyInput = (
  runsRoot: string,
  review: PlaythroughReview,
  scorecard: PlaythroughScorecard,
  options: {
    baseVersion: string;
    targetVersion: string;
    targetScope: string;
    reviewPath: string;
    scorecardPath: string;
    tracePath?: string;
    acceptancePath?: string;
    allowedPaths: string[];
    risks?: string[];
    testCommands?: string[];
  },
): PatchProposalAssemblyInput => {
  const contextDiagnostics = validatePatchProposalReviewContext(review, scorecard);
  if (contextDiagnostics.some((entry) => entry.category === 'blocker')) {
    throw new PatchProposalValidationError(
      contextDiagnostics.map((entry) => entry.message).join('\n'),
      contextDiagnostics,
    );
  }

  return {
    review,
    scorecard,
    baseVersion: options.baseVersion,
    targetVersion: options.targetVersion,
    targetScope: options.targetScope,
    tracePath: inferTracePath(review, scorecard, options.tracePath),
    reviewPath: options.reviewPath,
    scorecardPath: options.scorecardPath,
    acceptancePath: options.acceptancePath,
    allowedPaths: options.allowedPaths,
    changes: buildPatchProposalChangesFromReview(review),
    risks: options.risks,
    validationCommands: options.testCommands,
    runsRoot,
  };
};

export const runPatchProposalCli = async (
  argv: string[] = process.argv.slice(2),
): Promise<{
  outputPath?: string;
  proposal?: StructuredPatchProposal;
  validation?: Awaited<ReturnType<typeof collectPatchProposalDiagnostics>>;
}> => {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(PATCH_PROPOSAL_CLI_USAGE);
    return {};
  }

  const runsRoot = path.resolve(args.runsRoot);
  const reviewPath = path.resolve(runsRoot, requireArg(args.reviewPath, 'review'));
  const scorecardPath = path.resolve(runsRoot, requireArg(args.scorecardPath, 'scorecard'));
  const baseVersion = requireArg(args.baseVersion, 'base-version');
  const targetVersion = requireArg(args.targetVersion, 'target-version');
  const targetScope = requireArg(args.targetScope, 'scope');

  if (args.allowedPaths.length === 0) {
    throw new Error(
      `Missing required argument: at least one --allowed-path entry\n${PATCH_PROPOSAL_CLI_USAGE}`,
    );
  }

  const review = await readJsonFile<PlaythroughReview>(reviewPath);
  const scorecard = await readJsonFile<PlaythroughScorecard>(scorecardPath);

  const assemblyInput = buildPatchProposalAssemblyInput(runsRoot, review, scorecard, {
    baseVersion,
    targetVersion,
    targetScope,
    reviewPath: toRunsRelativePath(runsRoot, reviewPath),
    scorecardPath: toRunsRelativePath(runsRoot, scorecardPath),
    tracePath: args.tracePath
      ? toRunsRelativePath(runsRoot, path.resolve(runsRoot, args.tracePath))
      : undefined,
    acceptancePath: args.acceptancePath
      ? toRunsRelativePath(runsRoot, path.resolve(runsRoot, args.acceptancePath))
      : path.relative(runsRoot, getVersionPaths(runsRoot, baseVersion).acceptancePath).split(path.sep).join('/'),
    allowedPaths: args.allowedPaths,
    risks: args.risks,
    testCommands: args.testCommands.length > 0 ? args.testCommands : undefined,
  });

  const proposal = assembleStructuredPatchProposal(assemblyInput);
  const validation = await collectPatchProposalDiagnostics(proposal, {
    runsRoot,
    verifyEvidenceFiles: true,
  });

  if (args.validateOnly) {
    process.stdout.write(`${formatPatchProposalValidationMessage(validation)}\n`);
    if (!validation.ok) {
      process.exitCode = 1;
    }
    return { proposal, validation };
  }

  if (!validation.ok) {
    throw new PatchProposalValidationError(
      formatPatchProposalValidationMessage(validation),
      validation.diagnostics,
    );
  }

  if (args.write) {
    const outputPath = getPatchProposalOutputPath(runsRoot, targetVersion);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, stringifyDeterministicJson(proposal), 'utf8');
    process.stdout.write(`Wrote patch proposal to ${outputPath}\n`);
    return { outputPath, proposal, validation };
  }

  process.stdout.write(`${stringifyDeterministicJson(proposal)}\n`);
  return { proposal, validation };
};

export const handlePatchProposalCliError = (error: unknown): void => {
  if (error instanceof PatchProposalValidationError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
};
