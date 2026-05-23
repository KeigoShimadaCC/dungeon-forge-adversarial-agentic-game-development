import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from './json.js';

const SENSITIVE_ENV_KEYS = /^(.*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL).*)$/i;

export interface CommandExecutionOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  stdoutPath: string;
  stderrPath: string;
  stdin?: string;
  shell?: boolean;
}

export interface CommandExecutionResult {
  command: string;
  cwd: string;
  exitCode: number | null;
  signal?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stdoutPath: string;
  stderrPath: string;
  resultPath?: string;
  status: 'pass' | 'fail' | 'timeout';
}

export interface CommandExecutor {
  run(command: string, options: CommandExecutionOptions): Promise<CommandExecutionResult>;
}

export const redactEnvForLogging = (env: NodeJS.ProcessEnv): Record<string, string> => {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      continue;
    }
    redacted[key] = SENSITIVE_ENV_KEYS.test(key) ? '[REDACTED]' : value;
  }
  return redacted;
};

export const createSpawnCommandExecutor = (): CommandExecutor => ({
  async run(command, options): Promise<CommandExecutionResult> {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    await mkdir(path.dirname(options.stdoutPath), { recursive: true });
    await mkdir(path.dirname(options.stderrPath), { recursive: true });

    await writeFile(options.stdoutPath, '');
    await writeFile(options.stderrPath, '');

    const child = spawn(command, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: options.shell ?? true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let timedOut = false;
    const timeoutMs = options.timeoutMs;
    const timeoutHandle =
      timeoutMs !== undefined && timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
          }, timeoutMs)
        : undefined;

    if (options.stdin !== undefined) {
      child.stdin?.write(options.stdin);
      child.stdin?.end();
    } else {
      child.stdin?.end();
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    const exit = await new Promise<{ exitCode: number | null; signal?: string }>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code, signal) => {
        resolve({
          exitCode: code,
          ...(signal ? { signal } : {}),
        });
      });
    });

    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    await writeFile(options.stdoutPath, Buffer.concat(stdoutChunks));
    await writeFile(options.stderrPath, Buffer.concat(stderrChunks));

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;
    const status: CommandExecutionResult['status'] = timedOut
      ? 'timeout'
      : exit.exitCode === 0
        ? 'pass'
        : 'fail';

    const result: CommandExecutionResult = {
      command,
      cwd: options.cwd,
      exitCode: exit.exitCode,
      ...(exit.signal ? { signal: exit.signal } : {}),
      startedAt,
      finishedAt,
      durationMs,
      stdoutPath: options.stdoutPath,
      stderrPath: options.stderrPath,
      status,
    };

    const resultPath = options.stdoutPath.replace(/\.stdout\.log$/, '.json');
    if (resultPath !== options.stdoutPath) {
      result.resultPath = resultPath;
      await writeFile(
        resultPath,
        stringifyDeterministicJson({
          ...result,
          env: options.env ? redactEnvForLogging(options.env) : undefined,
        }),
      );
    }

    return result;
  },
});

export const commandEvidenceStatus = (
  result: CommandExecutionResult,
): 'pass' | 'fail' | 'blocked' | 'not_run' => {
  if (result.status === 'pass') {
    return 'pass';
  }
  if (result.status === 'timeout') {
    return 'fail';
  }
  return 'fail';
};
