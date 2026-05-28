import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { analyzeWhyBlocked } from './blocker-analysis.js';
import { inspectRepo } from './inspect.js';

export interface GenerateRunReportOptions {
  phase?: string;
  runId?: string;
  latest?: boolean;
  output?: string;
}

export interface GeneratedReport {
  schemaVersion: 1;
  status: 'generated' | 'written';
  markdown?: string;
  outputPath?: string;
}

const bulletList = (items: string[]): string =>
  items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- None.';

const displayValue = (value: unknown): string =>
  typeof value === 'string' && value.length > 0 ? value : 'none';

const decisionText = (decision: unknown): string => {
  if (decision && typeof decision === 'object') {
    const record = decision as Record<string, unknown>;
    return displayValue(record.decision ?? record.status);
  }
  return 'none';
};

export const buildRunReportMarkdown = async (
  repoRootInput: string,
  options: GenerateRunReportOptions = {},
): Promise<string> => {
  const repoRoot = path.resolve(repoRootInput);
  const inspect = await inspectRepo(repoRoot, options);
  const blocked = await analyzeWhyBlocked(repoRoot, options);
  const latestRun = inspect.latestRun;
  const evidenceFiles = latestRun?.evidenceDir
    ? [
        path.join(latestRun.evidenceDir, 'run-state.json'),
        path.join(latestRun.evidenceDir, 'final-decision.json'),
        path.join(latestRun.evidenceDir, 'phase-merge-evidence.json'),
        path.join(latestRun.evidenceDir, 'command-results'),
        path.join(latestRun.evidenceDir, 'agent-results'),
        path.join(latestRun.evidenceDir, 'secret-scan.json'),
      ]
    : [];
  const changedPaths = latestRun?.phaseMergeEvidence?.changedPaths ?? [];
  const validation = latestRun?.phaseMergeEvidence?.localCommands?.map(
    (command) => `${command.status}: ${command.command}`,
  ) ?? [];
  const blockers = blocked.blockers.map((blocker) => `${blocker.severity}: ${blocker.message}`);

  return [
    '# Agentic Run Report',
    '',
    '## Summary',
    `- Phase: ${displayValue(latestRun?.phase ?? blocked.phase ?? inspect.currentPhase)}`,
    `- Run ID: ${displayValue(latestRun?.runId ?? blocked.runId)}`,
    `- Status: ${displayValue(latestRun?.status ?? blocked.status)}`,
    `- Current stage: ${displayValue(latestRun?.currentStage)}`,
    `- Decision: ${decisionText(latestRun?.finalDecision)}`,
    '',
    '## What Happened',
    latestRun
      ? `The latest discovered run is ${latestRun.status} at stage ${latestRun.currentStage ?? 'unknown'}.`
      : 'No run evidence was found for the requested selection.',
    '',
    '## Changed Evidence',
    bulletList(changedPaths),
    '',
    '## Validation',
    bulletList(validation),
    '',
    '## Blockers',
    bulletList(blockers),
    '',
    '## Suggested Next Actions',
    bulletList([...blocked.recommendedNextActions, ...inspect.recommendedNextActions]),
    '',
    '## Evidence Files',
    bulletList(evidenceFiles),
    '',
  ].join('\n');
};

export const generateRunReport = async (
  repoRootInput: string,
  options: GenerateRunReportOptions = {},
): Promise<GeneratedReport> => {
  const repoRoot = path.resolve(repoRootInput);
  const markdown = await buildRunReportMarkdown(repoRoot, options);
  if (!options.output) {
    return { schemaVersion: 1, status: 'generated', markdown };
  }

  const outputPath = path.isAbsolute(options.output) ? options.output : path.join(repoRoot, options.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown);
  return {
    schemaVersion: 1,
    status: 'written',
    outputPath: path.relative(repoRoot, outputPath) || outputPath,
  };
};
