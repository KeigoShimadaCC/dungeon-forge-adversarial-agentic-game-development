import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { loadAgenticConfig, runnerPathsFromAgenticConfig } from '../config/load-config.js';
import type { CommandExecutionResult } from '../adapters/command-executor.js';
import type { AgentStructuredReport } from '../evidence/agent-report-parser.js';
import type { SecretScanResult } from '../evidence/secret-scan.js';
import { discoverRunEvidence, type InspectOptions } from './inspect.js';
import {
  loadPhaseRunnerConfig,
  type AutomergeDecision,
  type PhaseMergeEvidence,
  type PhaseRunnerConfig,
} from './phase-runner.js';
import type { PhaseRunState } from './run-state.js';

export type BlockerSeverity = 'blocking' | 'warning' | 'info';

export interface BlockerFinding {
  source: string;
  severity: BlockerSeverity;
  message: string;
  suggestedAction: string;
}

export interface WhyBlockedReport {
  schemaVersion: 1;
  status: 'blocked' | 'not_blocked' | 'no_run_found';
  phase?: string;
  runId?: string;
  blockers: BlockerFinding[];
  nonBlockingGaps: BlockerFinding[];
  recommendedNextActions: string[];
  message?: string;
}

const readJsonIfExists = async <T>(filePath: string): Promise<T | undefined> => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
};

const loadRunnerConfigIfAvailable = async (
  repoRoot: string,
): Promise<PhaseRunnerConfig | undefined> => {
  try {
    const agenticConfig = await loadAgenticConfig(repoRoot);
    const paths = runnerPathsFromAgenticConfig(repoRoot, agenticConfig);
    return await loadPhaseRunnerConfig(repoRoot, paths);
  } catch {
    return undefined;
  }
};

const suggestionForReason = (reason: string): string => {
  if (reason.includes('Missing local command evidence')) {
    return 'Run local validation or inspect command-results.';
  }
  if (reason.includes('Local command did not pass')) {
    return 'Fix failing command before rerun/resume.';
  }
  if (reason.includes('Remote PR checks are absent')) {
    return 'Keep manual mode, configure checks, or change policy consciously.';
  }
  if (reason.includes('Cursor recheck did not pass')) {
    return 'Inspect recheck report and fix blocking gaps.';
  }
  if (reason.includes('Phase acceptance criteria are incomplete')) {
    return 'Update implementation or acceptance report.';
  }
  if (reason.includes('Changed path is outside phase scope') || reason.includes('Changed path outside phase scope')) {
    return 'Move change into an allowed path or update the phase plan intentionally.';
  }
  if (reason.includes('Secret or credential material was detected') || reason.toLowerCase().includes('secret')) {
    return 'Remove credential-like content and rotate if needed.';
  }
  if (reason.includes('Worktree is not clean')) {
    return 'Commit or revert local changes before cleanup.';
  }
  if (reason.includes('Plan acceptance blocked')) {
    return 'Inspect accepted-plan and planner report.';
  }
  return 'Inspect the referenced evidence file, fix the issue, then rerun or resume.';
};

const finding = (source: string, message: string, severity: BlockerSeverity = 'blocking'): BlockerFinding => ({
  source,
  severity,
  message,
  suggestedAction: suggestionForReason(message),
});

const reasonsFromFinalDecision = (finalDecision: Record<string, unknown> | undefined): string[] => {
  if (!finalDecision) return [];
  const decision = finalDecision.decision;
  const topLevelReasons = finalDecision.reasons;
  if (
    decision === 'block' &&
    Array.isArray(topLevelReasons)
  ) {
    return topLevelReasons.filter((reason): reason is string => typeof reason === 'string');
  }
  if (decision && typeof decision === 'object' && 'reasons' in decision) {
    const reasons = (decision as { reasons?: unknown }).reasons;
    return Array.isArray(reasons) ? reasons.filter((reason): reason is string => typeof reason === 'string') : [];
  }
  const status = finalDecision.status;
  const message = finalDecision.message;
  if (status === 'blocked' && typeof message === 'string') return [message];
  return [];
};

const findingsFromMergeEvidence = (evidence: PhaseMergeEvidence | undefined): BlockerFinding[] => {
  if (!evidence) return [];
  const blockers: BlockerFinding[] = [];
  for (const command of evidence.localCommands) {
    if (command.status === 'not_run') {
      blockers.push(finding('phase-merge-evidence', `Missing local command evidence: ${command.command}`));
    } else if (command.status !== 'pass') {
      blockers.push(finding('phase-merge-evidence', `Local command did not pass: ${command.command} (${command.status})`));
    }
  }
  if (evidence.remoteChecks === 'none') {
    blockers.push(
      finding(
        'phase-merge-evidence',
        'Remote PR checks are absent and policy does not allow local-only gating.',
      ),
    );
  } else if (evidence.remoteChecks === 'fail') {
    blockers.push(finding('phase-merge-evidence', 'Remote PR checks failed.'));
  }
  if (evidence.cursorRecheck !== 'pass') {
    blockers.push(finding('phase-merge-evidence', `Cursor recheck did not pass: ${evidence.cursorRecheck}`));
  }
  if (!evidence.phaseAcceptanceComplete) {
    blockers.push(finding('phase-merge-evidence', 'Phase acceptance criteria are incomplete.'));
  }
  if (!evidence.worktreeClean) {
    blockers.push(finding('phase-merge-evidence', 'Worktree is not clean after commit.'));
  }
  if (evidence.secretsDetected) {
    blockers.push(finding('phase-merge-evidence', 'Secret or credential material was detected.'));
  }
  for (const gap of evidence.blockingGaps) {
    blockers.push(finding('phase-merge-evidence', gap));
  }
  return blockers;
};

const findingsFromLocalValidation = (results: CommandExecutionResult[] | undefined): BlockerFinding[] =>
  (results ?? [])
    .filter((result) => result.status !== 'pass' && result.exitCode !== 0)
    .map((result) => finding('local-validation', `Local command did not pass: ${result.command} (${result.status})`));

const findingsFromRecheck = (report: AgentStructuredReport | undefined): {
  blockers: BlockerFinding[];
  nonBlockingGaps: BlockerFinding[];
} => {
  if (!report) return { blockers: [], nonBlockingGaps: [] };
  const blockers: BlockerFinding[] = [];
  const nonBlockingGaps: BlockerFinding[] = [];
  if (report.status !== 'pass') {
    blockers.push(finding('recheck-report', `Cursor recheck did not pass: ${report.status}`));
  }
  if ('phaseAcceptanceComplete' in report && report.phaseAcceptanceComplete !== true) {
    blockers.push(finding('recheck-report', 'Phase acceptance criteria are incomplete.'));
  }
  if ('blockingGaps' in report && Array.isArray(report.blockingGaps)) {
    for (const gap of report.blockingGaps.filter((entry): entry is string => typeof entry === 'string')) {
      blockers.push(finding('recheck-report', gap));
    }
  }
  if ('gaps' in report && Array.isArray(report.gaps)) {
    for (const gap of report.gaps) {
      const summary = typeof gap.summary === 'string' ? gap.summary : 'Recheck reported a non-blocking gap.';
      const severity = gap.severity === 'blocking' ? 'blocking' : 'warning';
      const target = severity === 'blocking' ? blockers : nonBlockingGaps;
      target.push(finding('recheck-report', summary, severity));
    }
  }
  return { blockers, nonBlockingGaps };
};

const findingsFromSecretScan = (secretScan: SecretScanResult | undefined): BlockerFinding[] => {
  if (!secretScan?.secretsDetected) return [];
  return secretScan.hits.length > 0
    ? secretScan.hits.map((hit) => finding('secret-scan', hit))
    : [finding('secret-scan', 'Secret or credential material was detected.')];
};

const uniqueFindings = (findings: BlockerFinding[]): BlockerFinding[] => {
  const seen = new Set<string>();
  const unique: BlockerFinding[] = [];
  for (const entry of findings) {
    const key = `${entry.source}:${entry.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  return unique;
};

export const analyzeWhyBlocked = async (
  repoRootInput: string,
  options: InspectOptions = {},
): Promise<WhyBlockedReport> => {
  const repoRoot = path.resolve(repoRootInput);
  const config = await loadRunnerConfigIfAvailable(repoRoot);
  const location = await discoverRunEvidence(repoRoot, options);

  if (!location) {
    const phase = options.phase ?? config?.state.currentPhase;
    const stateReason = phase ? config?.state.phases[phase]?.reason : undefined;
    const blockers = stateReason ? [finding('phase-state', stateReason)] : [];
    return {
      schemaVersion: 1,
      status: blockers.length > 0 ? 'blocked' : 'no_run_found',
      ...(phase ? { phase } : {}),
      blockers,
      nonBlockingGaps: [],
      recommendedNextActions: [
        phase
          ? `Run agentic run --repo-root . --phase ${phase} --mode manual --dry-run.`
          : 'Run agentic inspect --repo-root . to review phase state.',
      ],
      ...(!stateReason ? { message: 'No run evidence found under runs/phase-runner.' } : {}),
    };
  }

  const finalDecision = await readJsonIfExists<Record<string, unknown>>(path.join(location.evidenceDir, 'final-decision.json'));
  const mergeEvidence = await readJsonIfExists<PhaseMergeEvidence>(path.join(location.evidenceDir, 'phase-merge-evidence.json'));
  const runState = await readJsonIfExists<PhaseRunState>(path.join(location.evidenceDir, 'run-state.json'));
  const localValidation =
    (await readJsonIfExists<{ results?: CommandExecutionResult[] }>(
      path.join(location.evidenceDir, 'command-results', 'local-validation.json'),
    )) ??
    (await readJsonIfExists<{ results?: CommandExecutionResult[] }>(
      path.join(location.evidenceDir, 'local-validation.json'),
    ));
  const recheckReport =
    (await readJsonIfExists<AgentStructuredReport>(
      path.join(location.evidenceDir, 'agent-results', 'recheck-report.json'),
    )) ??
    (await readJsonIfExists<AgentStructuredReport>(
      path.join(location.evidenceDir, 'recheck-report.json'),
    ));
  const secretScan = await readJsonIfExists<SecretScanResult>(path.join(location.evidenceDir, 'secret-scan.json'));
  const recheckFindings = findingsFromRecheck(recheckReport);
  const phaseStateReason = config?.state.phases[location.phase]?.reason;
  const blockers = uniqueFindings([
    ...(phaseStateReason ? [finding('phase-state', phaseStateReason)] : []),
    ...(runState?.lastError ? [finding('run-state', runState.lastError)] : []),
    ...reasonsFromFinalDecision(finalDecision).map((reason) => finding('final-decision', reason)),
    ...findingsFromMergeEvidence(mergeEvidence),
    ...findingsFromLocalValidation(localValidation?.results),
    ...recheckFindings.blockers,
    ...findingsFromSecretScan(secretScan),
  ]);

  return {
    schemaVersion: 1,
    status: blockers.length > 0 ? 'blocked' : 'not_blocked',
    phase: location.phase,
    runId: location.runId,
    blockers,
    nonBlockingGaps: uniqueFindings(recheckFindings.nonBlockingGaps),
    recommendedNextActions:
      blockers.length > 0
        ? [
            `Run agentic inspect --repo-root . --phase ${location.phase} --latest.`,
            `Fix blockers, then run agentic resume --repo-root . --phase ${location.phase} --run-id ${location.runId}.`,
          ]
        : [`Run agentic inspect --repo-root . --phase ${location.phase} --latest.`],
  };
};
