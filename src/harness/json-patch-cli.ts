import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assertJsonPatchStructurallyValid,
  applyDeterministicJsonPatch,
  collectJsonPatchDiagnostics,
  formatJsonPatchValidationMessage,
  JsonPatchValidationError,
  type DeterministicJsonPatch,
  type JsonPatchMode,
} from './deterministic-json-patch.js';
import { stringifyDeterministicJson } from './json.js';
import {
  assertPatchProposalStructurallyValid,
  type StructuredPatchProposal,
} from './structured-patch-proposal.js';

export const JSON_PATCH_CLI_USAGE = `Usage:
  pnpm run build && node dist/src/harness/json-patch.js -- --patch <path> --proposal <path> [options]

Required:
  --patch <path>            Deterministic JSON patch document (repo-relative or absolute)
  --proposal <path>         Linked patch_proposal.json for evidence and scope validation

Optional:
  --repo-root <path>        Repository root for target files (default: current working directory)
  --runs-root <path>        Runs root for evidence resolution and reports (default: current working directory)
  --apply                   Explicit apply mode (default is dry-run; makes no file changes)
  --write-report            Write runs/<target>/json_patch_report.json
  --write-audit             Append apply audit entry to runs/<target>/json_patch_audit.jsonl (apply only)
  --validate-only           Validate patch + proposal without simulating file changes
  --help, -h                Show this help text

Notes:
  Default mode is dry-run. Dry-run computes before/after summaries without writing target files.
  Apply mode requires governance.human_approved=true and leaves rollback copies under runs/<version>/json_patch_rollback/.
  Patches are limited to bounded JSON content and Markdown prompt surfaces; TypeScript source is never mutated.
`;

interface ParsedArgs {
  patchPath?: string;
  proposalPath?: string;
  repoRoot: string;
  runsRoot: string;
  mode: JsonPatchMode;
  writeReport: boolean;
  writeAudit: boolean;
  validateOnly: boolean;
  help: boolean;
}

const parseArgs = (argv: string[]): ParsedArgs => {
  const args: ParsedArgs = {
    repoRoot: process.cwd(),
    runsRoot: process.cwd(),
    mode: 'dry_run',
    writeReport: false,
    writeAudit: false,
    validateOnly: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--') {
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--patch' && next) {
      args.patchPath = next;
      index += 1;
      continue;
    }
    if (arg === '--proposal' && next) {
      args.proposalPath = next;
      index += 1;
      continue;
    }
    if (arg === '--repo-root' && next) {
      args.repoRoot = path.resolve(next);
      index += 1;
      continue;
    }
    if (arg === '--runs-root' && next) {
      args.runsRoot = path.resolve(next);
      index += 1;
      continue;
    }
    if (arg === '--apply') {
      args.mode = 'apply';
      continue;
    }
    if (arg === '--write-report') {
      args.writeReport = true;
      continue;
    }
    if (arg === '--write-audit') {
      args.writeAudit = true;
      continue;
    }
    if (arg === '--validate-only') {
      args.validateOnly = true;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${arg}\n${JSON_PATCH_CLI_USAGE}`);
  }

  return args;
};

const requireArg = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`Missing required argument: --${name}\n${JSON_PATCH_CLI_USAGE}`);
  }
  return value;
};

const resolveInputPath = (baseRoot: string, inputPath: string): string =>
  path.isAbsolute(inputPath) ? inputPath : path.resolve(baseRoot, inputPath);

export const runJsonPatchCli = async (
  argv: string[] = process.argv.slice(2),
): Promise<{ report?: Awaited<ReturnType<typeof applyDeterministicJsonPatch>> }> => {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(JSON_PATCH_CLI_USAGE);
    return {};
  }

  const patchPath = requireArg(args.patchPath, 'patch');
  const proposalPath = requireArg(args.proposalPath, 'proposal');
  const absolutePatchPath = resolveInputPath(args.repoRoot, patchPath);
  const absoluteProposalPath = resolveInputPath(args.runsRoot, proposalPath);

  const patchRaw = JSON.parse(await readFile(absolutePatchPath, 'utf8')) as unknown;
  if (!assertJsonPatchStructurallyValid(patchRaw)) {
    throw new JsonPatchValidationError('Patch JSON is structurally invalid.');
  }
  const patch = patchRaw as DeterministicJsonPatch;
  const proposalRaw = JSON.parse(await readFile(absoluteProposalPath, 'utf8')) as unknown;
  if (!assertPatchProposalStructurallyValid(proposalRaw)) {
    throw new JsonPatchValidationError('Proposal JSON is structurally invalid.');
  }
  const proposal = proposalRaw as StructuredPatchProposal;

  if (args.validateOnly) {
    const validation = await collectJsonPatchDiagnostics(patch, {
      repoRoot: args.repoRoot,
      runsRoot: args.runsRoot,
      proposal,
      verifyEvidenceFiles: true,
      mode: args.mode,
    });
    process.stdout.write(`${formatJsonPatchValidationMessage(validation)}\n`);
    if (!validation.ok) {
      throw new JsonPatchValidationError(
        formatJsonPatchValidationMessage(validation),
        validation.blockers,
      );
    }
    return {};
  }

  const report = await applyDeterministicJsonPatch(patch, {
    repoRoot: args.repoRoot,
    runsRoot: args.runsRoot,
    proposal,
    mode: args.mode,
    writeReport: args.writeReport,
    writeAuditLog: args.writeAudit && args.mode === 'apply',
  });

  if (!report.ok) {
    process.stdout.write(`${formatJsonPatchValidationMessage({
      ok: false,
      diagnostics: report.diagnostics,
      blockers: report.blockers,
      warnings: report.warnings,
    })}\n`);
    throw new JsonPatchValidationError('JSON patch application blocked by validation failures.', report.blockers);
  }

  process.stdout.write(`${stringifyDeterministicJson(report)}`);
  if (args.mode === 'dry_run') {
    process.stdout.write('Dry-run completed; no target files were modified.\n');
  } else {
    process.stdout.write('Apply completed; rollback copies saved under runs/<version>/json_patch_rollback/.\n');
  }

  return { report };
};

export const handleJsonPatchCliError = (error: unknown): void => {
  if (error instanceof JsonPatchValidationError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (error instanceof Error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
};
