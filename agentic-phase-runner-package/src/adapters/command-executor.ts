import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from '../core/json.js';

const SENSITIVE_ENV_KEYS = /^(.*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL).*)$/i;

const quoteCommandArg = (value: string): string =>
  /^[A-Za-z0-9_./:=@+-]+$/.test(value) ? value : JSON.stringify(value);

const formatCommandForEvidence = (command: string, args?: readonly string[]): string =>
  args && args.length > 0
    ? [command, ...args].map(quoteCommandArg).join(' ')
    : command;

export interface CommandExecutionOptions {
  cwd: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  inactivityTimeoutMs?: number;
  maxRetries?: number;
  stdoutPath: string;
  stderrPath: string;
  stdin?: string;
  shell?: boolean;
}

export type CommandExecutionStatus = 'pass' | 'fail' | 'timeout' | 'inactive_timeout';

export interface CommandExecutionAttempt {
  attempt: number;
  exitCode: number | null;
  signal?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stdoutPath: string;
  stderrPath: string;
  status: CommandExecutionStatus;
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
  status: CommandExecutionStatus;
  attempt?: number;
  attempts?: CommandExecutionAttempt[];
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
    await mkdir(path.dirname(options.stdoutPath), { recursive: true });
    await mkdir(path.dirname(options.stderrPath), { recursive: true });

    const maxRetries = Math.max(0, options.maxRetries ?? 0);
    const totalAttempts = maxRetries + 1;
    const attempts: CommandExecutionAttempt[] = [];
    let result: CommandExecutionResult | undefined;

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      const attemptStdoutPath =
        totalAttempts > 1
          ? options.stdoutPath.replace(/\.stdout\.log$/, `.attempt-${attempt}.stdout.log`)
          : options.stdoutPath;
      const attemptStderrPath =
        totalAttempts > 1
          ? options.stderrPath.replace(/\.stderr\.log$/, `.attempt-${attempt}.stderr.log`)
          : options.stderrPath;
      const startedAt = new Date().toISOString();
      const startMs = Date.now();

      await writeFile(attemptStdoutPath, '');
      await writeFile(attemptStderrPath, '');

      const commandForEvidence = formatCommandForEvidence(command, options.args);
      const child = spawn(command, options.args ?? [], {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        shell: options.shell ?? (options.args ? false : true),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let timedOut = false;
      let inactiveTimedOut = false;
      let inactivityHandle: NodeJS.Timeout | undefined;
      const resetInactivityTimer = () => {
        if (inactivityHandle) {
          clearTimeout(inactivityHandle);
        }
        if (options.inactivityTimeoutMs !== undefined && options.inactivityTimeoutMs > 0) {
          inactivityHandle = setTimeout(() => {
            inactiveTimedOut = true;
            child.kill('SIGTERM');
          }, options.inactivityTimeoutMs);
        }
      };
      resetInactivityTimer();

      const timeoutHandle =
        options.timeoutMs !== undefined && options.timeoutMs > 0
          ? setTimeout(() => {
              timedOut = true;
              child.kill('SIGTERM');
            }, options.timeoutMs)
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
        resetInactivityTimer();
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
        resetInactivityTimer();
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
      if (inactivityHandle) {
        clearTimeout(inactivityHandle);
      }

      const stdout = Buffer.concat(stdoutChunks);
      const stderr = Buffer.concat(stderrChunks);
      await writeFile(attemptStdoutPath, stdout);
      await writeFile(attemptStderrPath, stderr);
      await writeFile(options.stdoutPath, stdout);
      await writeFile(options.stderrPath, stderr);

      const finishedAt = new Date().toISOString();
      const durationMs = Date.now() - startMs;
      const status: CommandExecutionStatus = inactiveTimedOut
        ? 'inactive_timeout'
        : timedOut
          ? 'timeout'
          : exit.exitCode === 0
            ? 'pass'
            : 'fail';

      attempts.push({
        attempt,
        exitCode: exit.exitCode,
        ...(exit.signal ? { signal: exit.signal } : {}),
        startedAt,
        finishedAt,
        durationMs,
        stdoutPath: attemptStdoutPath,
        stderrPath: attemptStderrPath,
        status,
      });

      result = {
        command: commandForEvidence,
        cwd: options.cwd,
        exitCode: exit.exitCode,
        ...(exit.signal ? { signal: exit.signal } : {}),
        startedAt,
        finishedAt,
        durationMs,
        stdoutPath: options.stdoutPath,
        stderrPath: options.stderrPath,
        status,
        attempt,
        attempts,
      };

      if (status === 'pass') {
        break;
      }
    }

    if (!result) {
      throw new Error('Command executor produced no attempts.');
    }

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
  if (result.status === 'inactive_timeout') {
    return 'fail';
  }
  return 'fail';
};
