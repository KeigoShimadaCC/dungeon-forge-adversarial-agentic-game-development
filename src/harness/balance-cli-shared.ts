import { stringifyDeterministicJson } from './json.js';

export const writeJson = (value: unknown): void => {
  process.stdout.write(`${stringifyDeterministicJson(value)}\n`);
};

export const handleCliError = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
};
