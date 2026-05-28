#!/usr/bin/env node
import { createRunnerPackageCopy } from '../core/package-installer.js';
import { stringifyDeterministicJson } from '../core/json.js';

const booleanFlags = new Set(['help', 'dry-run', 'apply', 'force']);

const parseArgs = (argv: string[]): Record<string, string | boolean> => {
  const options: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    if (booleanFlags.has(key)) {
      options[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    options[key] = value;
    index += 1;
  }
  return options;
};

const usage = (): string => [
  'Usage:',
  '  create-agentic-runner --target <repo> --dry-run',
  '  create-agentic-runner --target <repo> --apply [--force]',
  '',
  'Options:',
  '  --destination <dir>  Destination directory name. Default: agentic-phase-runner-package',
  '',
].join('\n');

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help === true) {
    process.stdout.write(usage());
    return;
  }
  if (options.apply === true && options['dry-run'] === true) {
    throw new Error('Choose either --dry-run or --apply, not both.');
  }
  const targetRoot = typeof options.target === 'string' ? options.target : undefined;
  if (!targetRoot) {
    throw new Error('--target is required.');
  }
  const report = await createRunnerPackageCopy({
    targetRoot,
    destination: typeof options.destination === 'string' ? options.destination : undefined,
    apply: options.apply === true,
    force: options.force === true,
  });
  process.stdout.write(stringifyDeterministicJson(report));
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
