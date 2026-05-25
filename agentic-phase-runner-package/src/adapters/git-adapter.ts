import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  commandEvidenceStatus,
  createSpawnCommandExecutor,
  type CommandExecutionResult,
  type CommandExecutor,
} from './command-executor.js';
import { stringifyDeterministicJson } from '../core/json.js';

export interface GitStatus {
  branch: string;
  clean: boolean;
  porcelain: string;
  raw: string;
}

export interface CreateWorktreeInput {
  repoRoot: string;
  branch: string;
  worktreePath: string;
  baseRef: string;
  evidenceDir: string;
}

export interface CommitInput {
  worktreePath: string;
  phaseId: string;
  evidenceDir: string;
  message?: string;
}

export interface CommitResult {
  committed: boolean;
  commitSha?: string;
  commandResult?: CommandExecutionResult;
}

export interface RemoveWorktreeInput {
  repoRoot: string;
  worktreePath: string;
  evidenceDir: string;
  allowDirty: boolean;
}

export interface GitAdapter {
  fetchOrigin(repoRoot: string, evidenceDir: string): Promise<CommandExecutionResult>;
  createWorktree(input: CreateWorktreeInput): Promise<CommandExecutionResult>;
  changedPaths(worktreePath: string, baseRef: string, evidenceDir: string): Promise<string[]>;
  diffText(worktreePath: string, baseRef: string, evidenceDir: string): Promise<string>;
  status(worktreePath: string, evidenceDir?: string): Promise<GitStatus>;
  commitIfNeeded(input: CommitInput): Promise<CommitResult>;
  removeWorktree(input: RemoveWorktreeInput): Promise<CommandExecutionResult>;
}

const commandPaths = (evidenceDir: string, slug: string) => {
  const dir = path.join(evidenceDir, 'command-results');
  return {
    stdoutPath: path.join(dir, `${slug}.stdout.log`),
    stderrPath: path.join(dir, `${slug}.stderr.log`),
  };
};

const runGit = async (
  executor: CommandExecutor,
  repoRoot: string,
  evidenceDir: string,
  slug: string,
  args: string[],
  timeoutMs?: number,
): Promise<CommandExecutionResult> => {
  const paths = commandPaths(evidenceDir, slug);
  return executor.run('git', {
    cwd: repoRoot,
    args,
    ...paths,
    timeoutMs,
  });
};

const parsePorcelainStatus = (raw: string): GitStatus => {
  const lines = raw.split('\n').filter((line) => line.length > 0);
  const branchLine = lines[0] ?? '';
  const branchMatch = branchLine.match(/^## ([^\s]+)/);
  const branch = branchMatch?.[1] ?? 'unknown';
  const porcelain = lines.slice(1).join('\n');
  const clean = porcelain.trim().length === 0;
  return { branch, clean, porcelain, raw };
};

const parsePathList = (stdout: string): string[] =>
  stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const uniqueSortedPaths = (paths: string[]): string[] =>
  [...new Set(paths.filter((changedPath) => changedPath.length > 0))].sort((a, b) =>
    a.localeCompare(b),
  );

const readUntrackedContentForDiff = async (
  worktreePath: string,
  changedPath: string,
): Promise<string> => {
  const fullPath = path.join(worktreePath, changedPath);
  const fileStat = await stat(fullPath).catch(() => undefined);
  if (!fileStat?.isFile()) {
    return `\n--- untracked file skipped: ${changedPath} (not a regular file)\n`;
  }
  if (fileStat.size > 1024 * 1024) {
    return `\n--- untracked file skipped: ${changedPath} (larger than 1 MiB)\n`;
  }
  const buffer = await readFile(fullPath).catch(() => undefined);
  if (!buffer) {
    return `\n--- untracked file skipped: ${changedPath} (unreadable)\n`;
  }
  if (buffer.includes(0)) {
    return `\n--- untracked file skipped: ${changedPath} (binary content)\n`;
  }
  return [
    '',
    `--- untracked file: ${changedPath}`,
    `+++ untracked file: ${changedPath}`,
    buffer.toString('utf8'),
  ].join('\n');
};

export const createGitAdapter = (executor: CommandExecutor = createSpawnCommandExecutor()): GitAdapter => ({
  async fetchOrigin(repoRoot, evidenceDir) {
    return runGit(executor, repoRoot, evidenceDir, 'git-fetch-origin', ['fetch', 'origin']);
  },

  async createWorktree(input) {
    const exists = await access(input.worktreePath)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      const status = await this.status(input.worktreePath, input.evidenceDir);
      if (!status.clean) {
        throw new Error(`Worktree path exists and is dirty: ${input.worktreePath}`);
      }
      return runGit(executor, input.repoRoot, input.evidenceDir, 'git-worktree-reuse', [
        'worktree',
        'list',
      ]);
    }
    return runGit(executor, input.repoRoot, input.evidenceDir, 'git-worktree-add', [
      'worktree',
      'add',
      '-b',
      input.branch,
      input.worktreePath,
      input.baseRef,
    ]);
  },

  async changedPaths(worktreePath, baseRef, evidenceDir) {
    const trackedPaths = commandPaths(evidenceDir, 'git-diff-names');
    const trackedResult = await executor.run('git', {
      cwd: worktreePath,
      args: ['diff', '--name-only', baseRef],
      ...trackedPaths,
    });
    const untrackedPaths = commandPaths(evidenceDir, 'git-untracked-names');
    const untrackedResult = await executor.run('git', {
      cwd: worktreePath,
      args: ['ls-files', '--others', '--exclude-standard'],
      ...untrackedPaths,
    });
    const tracked = commandEvidenceStatus(trackedResult) === 'pass'
      ? parsePathList(await readFile(trackedResult.stdoutPath, 'utf8'))
      : [];
    const untracked = commandEvidenceStatus(untrackedResult) === 'pass'
      ? parsePathList(await readFile(untrackedResult.stdoutPath, 'utf8'))
      : [];
    return uniqueSortedPaths([...tracked, ...untracked]);
  },

  async diffText(worktreePath, baseRef, evidenceDir) {
    const paths = commandPaths(evidenceDir, 'git-diff');
    const result = await executor.run('git', {
      cwd: worktreePath,
      args: ['diff', baseRef],
      ...paths,
    });
    const diff = commandEvidenceStatus(result) === 'pass'
      ? await readFile(result.stdoutPath, 'utf8')
      : '';
    const untrackedPaths = commandPaths(evidenceDir, 'git-untracked-for-diff');
    const untrackedResult = await executor.run('git', {
      cwd: worktreePath,
      args: ['ls-files', '--others', '--exclude-standard'],
      ...untrackedPaths,
    });
    if (commandEvidenceStatus(untrackedResult) !== 'pass') {
      return diff;
    }
    const untracked = uniqueSortedPaths(parsePathList(await readFile(untrackedResult.stdoutPath, 'utf8')));
    const untrackedDiff = await Promise.all(
      untracked.map((changedPath) => readUntrackedContentForDiff(worktreePath, changedPath)),
    );
    return [diff, ...untrackedDiff].filter((entry) => entry.length > 0).join('\n');
  },

  async status(worktreePath, evidenceDir) {
    const paths = evidenceDir
      ? commandPaths(evidenceDir, 'git-status')
      : {
          stdoutPath: path.join(worktreePath, '.phase-runner-status.stdout.log'),
          stderrPath: path.join(worktreePath, '.phase-runner-status.stderr.log'),
        };
    const result = await executor.run('git', {
      cwd: worktreePath,
      args: ['status', '--short', '--branch'],
      ...paths,
    });
    const raw = await readFile(result.stdoutPath, 'utf8').catch(() => '');
    return parsePorcelainStatus(raw);
  },

  async commitIfNeeded(input) {
    const status = await this.status(input.worktreePath, input.evidenceDir);
    if (status.clean) {
      return { committed: false };
    }
    const message = input.message ?? `${input.phaseId}: complete phase work`;
    const addPaths = commandPaths(input.evidenceDir, 'git-add');
    const addResult = await executor.run('git', {
      cwd: input.worktreePath,
      args: ['add', '-A'],
      ...addPaths,
    });
    if (commandEvidenceStatus(addResult) !== 'pass') {
      return { committed: false, commandResult: addResult };
    }
    const commitPaths = commandPaths(input.evidenceDir, 'git-commit');
    const result = await executor.run('git', {
      cwd: input.worktreePath,
      args: ['commit', '-m', message],
      ...commitPaths,
    });
    const committed = commandEvidenceStatus(result) === 'pass';
    let commitSha: string | undefined;
    if (committed) {
      const headPaths = commandPaths(input.evidenceDir, 'git-rev-parse-head');
      const shaResult = await executor.run('git', {
        cwd: input.worktreePath,
        args: ['rev-parse', 'HEAD'],
        ...headPaths,
      });
      if (commandEvidenceStatus(shaResult) === 'pass') {
        commitSha = (await readFile(shaResult.stdoutPath, 'utf8')).trim();
      }
    }
    return {
      committed,
      ...(commitSha ? { commitSha } : {}),
      commandResult: result,
    };
  },

  async removeWorktree(input) {
    const status = await this.status(input.worktreePath, input.evidenceDir);
    if (!status.clean && !input.allowDirty) {
      throw new Error(`Refusing to remove dirty worktree: ${input.worktreePath}`);
    }
    return runGit(executor, input.repoRoot, input.evidenceDir, 'git-worktree-remove', [
      'worktree',
      'remove',
      input.worktreePath,
    ]);
  },
});

export const writeGitArtifacts = async (
  evidenceDir: string,
  artifacts: {
    statusBefore?: GitStatus;
    statusAfter?: GitStatus;
    changedPaths?: string[];
    diffSummary?: string;
    commits?: unknown;
  },
): Promise<void> => {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const gitDir = path.join(evidenceDir, 'git');
  await mkdir(gitDir, { recursive: true });
  if (artifacts.statusBefore) {
    await writeFile(
      path.join(gitDir, 'status-before.json'),
      stringifyDeterministicJson(artifacts.statusBefore),
    );
  }
  if (artifacts.statusAfter) {
    await writeFile(
      path.join(gitDir, 'status-after.json'),
      stringifyDeterministicJson(artifacts.statusAfter),
    );
  }
  if (artifacts.changedPaths) {
    await writeFile(
      path.join(gitDir, 'changed-paths.json'),
      stringifyDeterministicJson(artifacts.changedPaths),
    );
  }
  if (artifacts.diffSummary !== undefined) {
    await writeFile(path.join(evidenceDir, 'diff-summary.txt'), artifacts.diffSummary);
  }
  if (artifacts.commits !== undefined) {
    await writeFile(path.join(gitDir, 'commits.json'), stringifyDeterministicJson(artifacts.commits));
  }
};
