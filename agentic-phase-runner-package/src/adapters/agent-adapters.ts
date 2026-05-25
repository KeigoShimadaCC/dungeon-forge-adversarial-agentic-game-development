import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  commandEvidenceStatus,
  createSpawnCommandExecutor,
  type CommandExecutionResult,
  type CommandExecutor,
} from './command-executor.js';
import {
  parseAgentStructuredReport,
  type AgentReportRole,
  type AgentStructuredReport,
} from '../evidence/agent-report-parser.js';
import { stringifyDeterministicJson } from '../core/json.js';

export interface AgentRunInput {
  role: AgentReportRole;
  workspace: string;
  promptPath: string;
  outputPath: string;
  evidenceDir: string;
  phaseId: string;
  timeoutMs?: number;
}

export interface AgentRunResult {
  role: AgentReportRole;
  command: string;
  status: 'pass' | 'fail' | 'blocked' | 'not_run';
  outputPath: string;
  reportPath: string;
  commandResult?: CommandExecutionResult;
  parsedReport?: AgentStructuredReport;
  parseErrors: string[];
}

export interface AgentAdapter {
  run(input: AgentRunInput): Promise<AgentRunResult>;
}

export interface AgentTemplateConfig {
  provider: 'manual' | 'shell';
  commandTemplate: string;
  timeoutMs?: number;
  inactivityTimeoutMs?: number;
  maxRetries?: number;
}

export const renderAgentCommandTemplate = (
  template: string,
  variables: Record<string, string>,
): string => {
  let rendered = template;
  for (const [token, value] of Object.entries(variables)) {
    rendered = rendered.split(`{{${token}}}`).join(value);
  }
  return rendered;
};

const agentTemplateVariables = (input: AgentRunInput): Record<string, string> => ({
  WORKSPACE: input.workspace,
  PROMPT_PATH: input.promptPath,
  OUTPUT_PATH: input.outputPath,
  EVIDENCE_DIR: input.evidenceDir,
  PHASE_ID: input.phaseId,
});

export class ManualAgentAdapter implements AgentAdapter {
  async run(input: AgentRunInput): Promise<AgentRunResult> {
    await mkdir(path.dirname(input.outputPath), { recursive: true });
    const instructions = [
      `# Manual agent stage: ${input.role}`,
      '',
      'Agent execution was not allowed. Run the configured shell command manually, then place output at:',
      input.outputPath,
      '',
      `Prompt: ${input.promptPath}`,
      `Workspace: ${input.workspace}`,
    ].join('\n');
    await writeFile(input.outputPath, `${instructions}\n`);
    const reportPath = input.outputPath.replace(/\.(log|md)$/, '-report.json');
    return {
      role: input.role,
      command: '(manual)',
      status: 'not_run',
      outputPath: input.outputPath,
      reportPath,
      parseErrors: ['Agent execution not allowed'],
    };
  }
}

export class ShellAgentAdapter implements AgentAdapter {
  constructor(
    private readonly config: AgentTemplateConfig,
    private readonly executor: CommandExecutor = createSpawnCommandExecutor(),
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const command = renderAgentCommandTemplate(
      this.config.commandTemplate,
      agentTemplateVariables(input),
    );
    await mkdir(path.dirname(input.outputPath), { recursive: true });
    const commandResultsDir = path.join(input.evidenceDir, 'command-results');
    const slug = input.role;
    const stdoutPath = path.join(commandResultsDir, `agent-${slug}.stdout.log`);
    const stderrPath = path.join(commandResultsDir, `agent-${slug}.stderr.log`);

    const commandResult = await this.executor.run(command, {
      cwd: input.workspace,
      timeoutMs: input.timeoutMs ?? this.config.timeoutMs,
      inactivityTimeoutMs: this.config.inactivityTimeoutMs,
      maxRetries: this.config.maxRetries,
      stdoutPath,
      stderrPath,
    });

    const outputText = await readFile(stdoutPath, 'utf8').catch(() => '');
    await writeFile(input.outputPath, outputText);

    const parsed = parseAgentStructuredReport(outputText, input.role, input.phaseId);
    const reportBase =
      input.role === 'rechecker'
        ? 'recheck-report'
        : input.role === 'cursor-subtask'
          ? 'cursor-subtask-report'
          : `${input.role}-report`;
    const reportPath = path.join(input.evidenceDir, 'agent-results', `${reportBase}.json`);
    await mkdir(path.dirname(reportPath), { recursive: true });
    if (parsed.report) {
      await writeFile(reportPath, stringifyDeterministicJson(parsed.report));
    }

    const commandPassed = commandEvidenceStatus(commandResult) === 'pass';
    let status: AgentRunResult['status'] = 'fail';
    if (!commandPassed) {
      status = 'fail';
    } else if (!parsed.ok || !parsed.report) {
      status = 'blocked';
    } else if (parsed.report.status === 'pass') {
      status = 'pass';
    } else {
      status = 'blocked';
    }

    return {
      role: input.role,
      command,
      status,
      outputPath: input.outputPath,
      reportPath,
      commandResult,
      ...(parsed.report ? { parsedReport: parsed.report } : {}),
      parseErrors: parsed.errors,
    };
  }
}

export const createAgentAdapter = (
  config: AgentTemplateConfig,
  allowExecution: boolean,
  executor?: CommandExecutor,
): AgentAdapter => {
  if (!allowExecution || config.provider === 'manual') {
    return new ManualAgentAdapter();
  }
  return new ShellAgentAdapter(config, executor);
};
