import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  commandEvidenceStatus,
  createSpawnCommandExecutor,
  type CommandExecutionResult,
  type CommandExecutor,
} from './command-executor.js';
import { stringifyDeterministicJson } from './json.js';

export interface PrMetadata {
  number: number;
  url: string;
  branch: string;
  base: string;
  rawStdout: string;
}

export interface RemoteChecksMetadata {
  status: 'pass' | 'fail' | 'pending' | 'none';
  rawStdout: string;
  commandResult: CommandExecutionResult;
}

export interface MergeMetadata {
  merged: boolean;
  mergeCommit?: string;
  commandResult: CommandExecutionResult;
}

export interface CreatePrInput {
  repoRoot: string;
  branch: string;
  base: string;
  evidenceDir: string;
}

export interface WatchChecksInput {
  repoRoot: string;
  prNumber: number;
  evidenceDir: string;
  timeoutMs?: number;
}

export interface MergePrInput {
  repoRoot: string;
  prNumber: number;
  mergeMethod: 'merge' | 'squash' | 'rebase';
  deleteBranch: boolean;
  evidenceDir: string;
}

export interface GitHubCliAdapter {
  createPullRequest(input: CreatePrInput): Promise<PrMetadata>;
  watchChecks(input: WatchChecksInput): Promise<RemoteChecksMetadata>;
  mergePullRequest(input: MergePrInput): Promise<MergeMetadata>;
}

export interface GitHubCliAdapterOptions {
  ghCommand?: string;
  executor?: CommandExecutor;
}

const commandPaths = (evidenceDir: string, slug: string) => {
  const dir = path.join(evidenceDir, 'command-results');
  return {
    stdoutPath: path.join(dir, `${slug}.stdout.log`),
    stderrPath: path.join(dir, `${slug}.stderr.log`),
  };
};

export const parsePrCreateOutput = (stdout: string): { number: number; url: string } => {
  const urlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+\/pull\/(\d+)/);
  if (urlMatch?.[1] && urlMatch[0]) {
    return { number: Number.parseInt(urlMatch[1], 10), url: urlMatch[0] };
  }
  const numberMatch = stdout.match(/pull\/(\d+)/);
  if (numberMatch?.[1]) {
    return {
      number: Number.parseInt(numberMatch[1], 10),
      url: `https://github.com/example/example/pull/${numberMatch[1]}`,
    };
  }
  throw new Error(`Unable to parse PR metadata from gh output: ${stdout}`);
};

export const parseChecksOutput = (stdout: string): RemoteChecksMetadata['status'] => {
  const normalized = stdout.toLowerCase();
  if (normalized.includes('no checks') || normalized.includes('no checks reported')) {
    return 'none';
  }
  if (normalized.includes('fail')) {
    return 'fail';
  }
  if (normalized.includes('pass')) {
    return 'pass';
  }
  if (normalized.includes('pending')) {
    return 'pending';
  }
  return 'none';
};

export const createGitHubCliAdapter = (
  options: GitHubCliAdapterOptions = {},
): GitHubCliAdapter => {
  const gh = options.ghCommand ?? 'gh';
  const executor = options.executor ?? createSpawnCommandExecutor();

  const runGh = async (
    repoRoot: string,
    evidenceDir: string,
    slug: string,
    args: string,
    timeoutMs?: number,
  ): Promise<CommandExecutionResult> => {
    const paths = commandPaths(evidenceDir, slug);
    return executor.run(`${gh} ${args}`, {
      cwd: repoRoot,
      ...paths,
      timeoutMs,
    });
  };

  return {
    async createPullRequest(input) {
      const result = await runGh(
        input.repoRoot,
        input.evidenceDir,
        'gh-pr-create',
        `pr create --fill --base ${quoteShell(input.base)} --head ${quoteShell(input.branch)}`,
      );
      const { readFile } = await import('node:fs/promises');
      const stdout = await readFile(result.stdoutPath, 'utf8');
      const parsed = parsePrCreateOutput(stdout);
      const metadata: PrMetadata = {
        ...parsed,
        branch: input.branch,
        base: input.base,
        rawStdout: stdout,
      };
      await mkdir(input.evidenceDir, { recursive: true });
      await writeFile(path.join(input.evidenceDir, 'pr.json'), stringifyDeterministicJson(metadata));
      if (commandEvidenceStatus(result) !== 'pass') {
        throw new Error(`gh pr create failed with status ${result.status}`);
      }
      return metadata;
    },

    async watchChecks(input) {
      const result = await runGh(
        input.repoRoot,
        input.evidenceDir,
        'gh-pr-checks',
        `pr checks ${input.prNumber}`,
        input.timeoutMs,
      );
      const { readFile } = await import('node:fs/promises');
      const stdout = await readFile(result.stdoutPath, 'utf8');
      const status = parseChecksOutput(stdout);
      const metadata: RemoteChecksMetadata = {
        status: commandEvidenceStatus(result) === 'pass' ? status : 'fail',
        rawStdout: stdout,
        commandResult: result,
      };
      await writeFile(
        path.join(input.evidenceDir, 'checks.json'),
        stringifyDeterministicJson(metadata),
      );
      return metadata;
    },

    async mergePullRequest(input) {
      const deleteFlag = input.deleteBranch ? ' --delete-branch' : '';
      const result = await runGh(
        input.repoRoot,
        input.evidenceDir,
        'gh-pr-merge',
        `pr merge ${input.prNumber} --${input.mergeMethod}${deleteFlag}`,
      );
      const { readFile } = await import('node:fs/promises');
      const stdout = await readFile(result.stdoutPath, 'utf8');
      const mergeCommitMatch = stdout.match(/[0-9a-f]{7,40}/i);
      const metadata: MergeMetadata = {
        merged: commandEvidenceStatus(result) === 'pass',
        ...(mergeCommitMatch ? { mergeCommit: mergeCommitMatch[0] } : {}),
        commandResult: result,
      };
      await writeFile(
        path.join(input.evidenceDir, 'merge.json'),
        stringifyDeterministicJson(metadata),
      );
      return metadata;
    },
  };
};

const quoteShell = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;
