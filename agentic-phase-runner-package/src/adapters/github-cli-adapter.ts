import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  commandEvidenceStatus,
  createSpawnCommandExecutor,
  type CommandExecutionResult,
  type CommandExecutor,
} from './command-executor.js';
import { stringifyDeterministicJson } from '../core/json.js';

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
  remoteVerified?: boolean;
  remoteState?: string;
  mergedAt?: string;
  failureReason?: string;
  commandResult: CommandExecutionResult;
}

export interface RemotePrMergeMetadata {
  merged: boolean;
  state?: string;
  mergeCommit?: string;
  mergedAt?: string;
  rawStdout: string;
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

export interface VerifyPrMergedInput {
  repoRoot: string;
  prNumber: number;
  evidenceDir: string;
}

export interface GitHubCliAdapter {
  createPullRequest(input: CreatePrInput): Promise<PrMetadata>;
  watchChecks(input: WatchChecksInput): Promise<RemoteChecksMetadata>;
  mergePullRequest(input: MergePrInput): Promise<MergeMetadata>;
  verifyPullRequestMerged(input: VerifyPrMergedInput): Promise<RemotePrMergeMetadata>;
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

export const parsePrViewMergeState = (stdout: string): {
  merged: boolean;
  state?: string;
  mergeCommit?: string;
  mergedAt?: string;
} => {
  const parsed = JSON.parse(stdout) as {
    state?: string;
    mergeCommit?: { oid?: string } | string | null;
    mergedAt?: string | null;
  };
  const mergeCommit =
    typeof parsed.mergeCommit === 'string'
      ? parsed.mergeCommit
      : parsed.mergeCommit?.oid;
  const state = parsed.state;
  return {
    merged: state === 'MERGED' || Boolean(parsed.mergedAt && mergeCommit),
    ...(state ? { state } : {}),
    ...(mergeCommit ? { mergeCommit } : {}),
    ...(parsed.mergedAt ? { mergedAt: parsed.mergedAt } : {}),
  };
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
    args: string[],
    timeoutMs?: number,
  ): Promise<CommandExecutionResult> => {
    const paths = commandPaths(evidenceDir, slug);
    return executor.run(gh, {
      cwd: repoRoot,
      args,
      ...paths,
      timeoutMs,
    });
  };

  return {
    async createPullRequest(input) {
      const pushPaths = commandPaths(input.evidenceDir, 'git-push-pr-branch');
      const pushResult = await executor.run('git', {
        cwd: input.repoRoot,
        args: ['push', '-u', 'origin', input.branch],
        ...pushPaths,
      });
      if (commandEvidenceStatus(pushResult) !== 'pass') {
        throw new Error(`git push failed with status ${pushResult.status}`);
      }

      const result = await runGh(
        input.repoRoot,
        input.evidenceDir,
        'gh-pr-create',
        ['pr', 'create', '--fill', '--base', input.base, '--head', input.branch],
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
        ['pr', 'checks', String(input.prNumber), '--watch'],
        input.timeoutMs,
      );
      const { readFile } = await import('node:fs/promises');
      const stdout = await readFile(result.stdoutPath, 'utf8');
      const stderr = await readFile(result.stderrPath, 'utf8').catch(() => '');
      const combinedOutput = [stdout, stderr].filter((value) => value.length > 0).join('\n');
      const status = parseChecksOutput(combinedOutput);
      const metadata: RemoteChecksMetadata = {
        status: commandEvidenceStatus(result) === 'pass' || status === 'none' || status === 'pending'
          ? status
          : 'fail',
        rawStdout: combinedOutput,
        commandResult: result,
      };
      await writeFile(
        path.join(input.evidenceDir, 'checks.json'),
        stringifyDeterministicJson(metadata),
      );
      return metadata;
    },

    async mergePullRequest(input) {
      const result = await runGh(
        input.repoRoot,
        input.evidenceDir,
        'gh-pr-merge',
        [
          'pr',
          'merge',
          String(input.prNumber),
          `--${input.mergeMethod}`,
          ...(input.deleteBranch ? ['--delete-branch'] : []),
        ],
      );
      const { readFile } = await import('node:fs/promises');
      const stdout = await readFile(result.stdoutPath, 'utf8');
      const mergeCommitMatch = stdout.match(/[0-9a-f]{7,40}/i);
      const metadata: MergeMetadata = {
        merged: commandEvidenceStatus(result) === 'pass',
        ...(mergeCommitMatch ? { mergeCommit: mergeCommitMatch[0] } : {}),
        ...(commandEvidenceStatus(result) === 'pass'
          ? {}
          : { failureReason: `gh pr merge failed with status ${result.status}` }),
        commandResult: result,
      };
      await writeFile(
        path.join(input.evidenceDir, 'merge.json'),
        stringifyDeterministicJson(metadata),
      );
      return metadata;
    },

    async verifyPullRequestMerged(input) {
      const result = await runGh(
        input.repoRoot,
        input.evidenceDir,
        'gh-pr-view-merge-state',
        ['pr', 'view', String(input.prNumber), '--json', 'state,mergeCommit,mergedAt'],
      );
      const { readFile } = await import('node:fs/promises');
      const stdout = await readFile(result.stdoutPath, 'utf8');
      const parsed =
        commandEvidenceStatus(result) === 'pass'
          ? parsePrViewMergeState(stdout)
          : { merged: false };
      const metadata: RemotePrMergeMetadata = {
        ...parsed,
        rawStdout: stdout,
        commandResult: result,
      };
      await writeFile(
        path.join(input.evidenceDir, 'merge-remote-verification.json'),
        stringifyDeterministicJson(metadata),
      );
      return metadata;
    },
  };
};
