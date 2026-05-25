import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  blockingGapsFromRecheck,
  phaseAcceptanceFromRecheck,
  recheckStatusFromReport,
  type AgentStructuredReport,
} from './agent-report-parser.js';
import { commandEvidenceStatus, type CommandExecutionResult } from '../adapters/command-executor.js';
import { stringifyDeterministicJson } from '../core/json.js';
import {
  isPathAllowedForPhase,
  type AutomergePolicy,
  type CommandEvidence,
  type PhaseDefinition,
  type PhaseMergeEvidence,
} from '../core/phase-runner.js';
import type { SecretScanResult } from './secret-scan.js';
import type { GitStatus } from '../adapters/git-adapter.js';
import type { RemoteChecksMetadata } from '../adapters/github-cli-adapter.js';

export interface EvidenceCollectionInput {
  phase: PhaseDefinition;
  policy: AutomergePolicy;
  localCommandResults: CommandExecutionResult[];
  recheckReport?: AgentStructuredReport;
  changedPaths: string[];
  worktreeStatus: GitStatus;
  secretScan: SecretScanResult;
  remoteChecks: RemoteChecksMetadata['status'];
  requiredCommands?: string[];
}

export const localCommandsFromResults = (
  results: CommandExecutionResult[],
  requiredCommands: string[],
): CommandEvidence[] => {
  const byCommand = new Map(results.map((result) => [result.command, result]));
  return requiredCommands.map((command) => {
    const exact = byCommand.get(command);
    if (exact) {
      return {
        command,
        status: commandEvidenceStatus(exact) === 'pass' ? 'pass' : 'fail',
      };
    }
    const partial = results.find(
      (result) => result.command.includes(command) || command.includes(result.command),
    );
    if (!partial) {
      return { command, status: 'not_run' };
    }
    return {
      command,
      status: commandEvidenceStatus(partial) === 'pass' ? 'pass' : 'fail',
    };
  });
};

export const collectPhaseMergeEvidence = (input: EvidenceCollectionInput): PhaseMergeEvidence => {
  const requiredCommands =
    input.requiredCommands ?? input.policy.requiredLocalCommands ?? [];
  const localCommands = localCommandsFromResults(
    input.localCommandResults,
    requiredCommands,
  );

  const forbiddenPaths = input.changedPaths.filter(
    (changedPath) => !isPathAllowedForPhase(input.phase, changedPath),
  );

  const blockingGaps = [
    ...blockingGapsFromRecheck(input.recheckReport),
    ...forbiddenPaths.map((changedPath) => `Changed path outside phase scope: ${changedPath}`),
    ...input.secretScan.hits,
  ];

  const remoteChecks = input.remoteChecks;
  if (
    remoteChecks === 'none' &&
    !input.policy.allowNoRemoteChecksWhenLocalGatePasses &&
    input.policy.requiredLocalCommands.length > 0
  ) {
    blockingGaps.push('Remote PR checks are absent and policy does not allow local-only gating.');
  }

  return {
    localCommands,
    remoteChecks,
    cursorRecheck: recheckStatusFromReport(input.recheckReport),
    phaseAcceptanceComplete: phaseAcceptanceFromRecheck(input.recheckReport),
    changedPaths: input.changedPaths,
    worktreeClean: input.worktreeStatus.clean,
    secretsDetected: input.secretScan.secretsDetected,
    blockingGaps,
  };
};

export const writePhaseMergeEvidence = async (
  evidenceDir: string,
  evidence: PhaseMergeEvidence,
): Promise<string> => {
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(evidenceDir, { recursive: true });
  const filePath = path.join(evidenceDir, 'phase-merge-evidence.json');
  await writeFile(filePath, stringifyDeterministicJson(evidence));
  return filePath;
};

export const readRecheckReportFromEvidence = async (
  evidenceDir: string,
): Promise<AgentStructuredReport | undefined> => {
  const reportPath = path.join(evidenceDir, 'agent-results', 'recheck-report.json');
  try {
    return JSON.parse(await readFile(reportPath, 'utf8')) as AgentStructuredReport;
  } catch {
    return undefined;
  }
};

export const readLocalValidationResults = async (
  evidenceDir: string,
): Promise<CommandExecutionResult[]> => {
  const filePath = path.join(evidenceDir, 'command-results', 'local-validation.json');
  try {
    const payload = JSON.parse(await readFile(filePath, 'utf8')) as {
      results?: CommandExecutionResult[];
    };
    return payload.results ?? [];
  } catch {
    return [];
  }
};

export const writeLocalValidationResults = async (
  evidenceDir: string,
  results: CommandExecutionResult[],
): Promise<void> => {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const dir = path.join(evidenceDir, 'command-results');
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'local-validation.json'),
    stringifyDeterministicJson({ results }),
  );
};
