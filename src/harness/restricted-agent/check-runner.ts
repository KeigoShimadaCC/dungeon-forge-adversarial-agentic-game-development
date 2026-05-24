import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from '../json.js';
import {
  DEFAULT_RESTRICTED_AGENT_COMMAND_REGISTRY,
  looksLikeRawShellCommand,
  type RestrictedAgentCommandDefinition,
  type RestrictedAgentCommandRegistry,
} from './command-registry.js';
import type { RestrictedAgentValidationDiagnostic } from './schemas.js';

export type RestrictedAgentCheckStatus = 'pass' | 'fail' | 'blocked';

export interface RestrictedAgentCheckResult {
  commandId: string;
  status: RestrictedAgentCheckStatus;
  command?: readonly string[];
  exitCode?: number;
  durationMs: number;
  stdoutExcerpt: string;
  stderrExcerpt: string;
  diagnostics: RestrictedAgentValidationDiagnostic[];
  summary: string;
}

export interface RestrictedAgentCheckRunnerOptions {
  cwd: string;
  requestedChecks: readonly string[];
  registry?: RestrictedAgentCommandRegistry;
  executor?: RestrictedAgentCommandExecutor;
  evidenceDir?: string;
  excerptBytes?: number;
}

export interface RestrictedAgentCommandExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export type RestrictedAgentCommandExecutor = (
  command: RestrictedAgentCommandDefinition,
  cwd: string,
) => Promise<RestrictedAgentCommandExecutionResult>;

const DEFAULT_EXCERPT_BYTES = 2000;

const excerpt = (value: string, maxBytes: number): string => {
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.byteLength <= maxBytes) {
    return value;
  }
  return `${buffer.subarray(0, maxBytes).toString('utf8')}\n[truncated]`;
};

const blockedResult = (
  commandId: string,
  diagnostic: RestrictedAgentValidationDiagnostic,
): RestrictedAgentCheckResult => ({
  commandId,
  status: 'blocked',
  durationMs: 0,
  stdoutExcerpt: '',
  stderrExcerpt: '',
  diagnostics: [diagnostic],
  summary: `${commandId}: blocked - ${diagnostic.message}`,
});

export const summarizeRestrictedAgentFailedChecks = (
  results: readonly RestrictedAgentCheckResult[],
): Array<{ commandId: string; summary: string }> =>
  results
    .filter((result) => result.status !== 'pass')
    .map((result) => ({
      commandId: result.commandId,
      summary: result.summary,
    }));

export const executeRestrictedAgentCommand: RestrictedAgentCommandExecutor = async (
  command,
  cwd,
) =>
  new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command.command[0] ?? '', command.command.slice(1), {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        durationMs: Date.now() - started,
      });
    });
    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        stdout: '',
        stderr: error.message,
        durationMs: Date.now() - started,
      });
    });
  });

export const runRestrictedAgentChecks = async (
  options: RestrictedAgentCheckRunnerOptions,
): Promise<RestrictedAgentCheckResult[]> => {
  const registry = options.registry ?? DEFAULT_RESTRICTED_AGENT_COMMAND_REGISTRY;
  const executor = options.executor ?? executeRestrictedAgentCommand;
  const excerptBytes = options.excerptBytes ?? DEFAULT_EXCERPT_BYTES;
  const results: RestrictedAgentCheckResult[] = [];

  for (const commandId of options.requestedChecks) {
    if (looksLikeRawShellCommand(commandId)) {
      results.push(blockedResult(commandId, {
        category: 'command',
        field: 'requestedChecks',
        entry: commandId,
        message: 'Requested checks must be command IDs, not raw shell command strings.',
      }));
      continue;
    }

    const command = registry[commandId];
    if (!command || command.id !== commandId) {
      results.push(blockedResult(commandId, {
        category: 'command',
        field: 'requestedChecks',
        entry: commandId,
        message: `Unknown restricted-agent command ID: ${commandId}`,
      }));
      continue;
    }

    const executed = await executor(command, options.cwd);
    const status: RestrictedAgentCheckStatus = executed.exitCode === 0 ? 'pass' : 'fail';
    const stdoutExcerpt = excerpt(executed.stdout, excerptBytes);
    const stderrExcerpt = excerpt(executed.stderr, excerptBytes);
    results.push({
      commandId,
      status,
      command: command.command,
      exitCode: executed.exitCode,
      durationMs: executed.durationMs,
      stdoutExcerpt,
      stderrExcerpt,
      diagnostics: [],
      summary: status === 'pass'
        ? `${commandId}: pass`
        : `${commandId}: fail exit ${executed.exitCode}; ${stderrExcerpt || stdoutExcerpt || 'no output'}`,
    });
  }

  if (options.evidenceDir) {
    await mkdir(options.evidenceDir, { recursive: true });
    await writeFile(
      path.join(options.evidenceDir, 'check-results.json'),
      stringifyDeterministicJson(results),
      'utf8',
    );
  }

  return results;
};
