import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUPPORTED_CONFIG_SCHEMA_VERSION = 1;

export const SUPPORTED_COMMANDS = [
  'init',
  'doctor',
  'onboard',
  'plan',
  'boom',
  'inspect',
  'why-blocked',
  'status',
  'next',
  'bundle',
  'run',
  'resume',
  'gate',
  'version',
  'presets',
  'configure-agent',
  'migrate',
  'report',
] as const;

export interface VersionInfo {
  schemaVersion: 1;
  packageName: string;
  packageVersion: string;
  supportedConfigSchemaVersion: number;
  supportedCommands: string[];
}

const findPackageJsonPath = async (): Promise<string> => {
  let current = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(current, 'package.json');
    try {
      await readFile(candidate, 'utf8');
      return candidate;
    } catch {
      current = path.dirname(current);
    }
  }
  throw new Error('Unable to locate package.json.');
};

export const getVersionInfo = async (): Promise<VersionInfo> => {
  const packageJsonPath = await findPackageJsonPath();
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
    name?: string;
    version?: string;
  };
  return {
    schemaVersion: 1,
    packageName: packageJson.name ?? 'agentic-phase-runner-package',
    packageVersion: packageJson.version ?? '0.0.0',
    supportedConfigSchemaVersion: SUPPORTED_CONFIG_SCHEMA_VERSION,
    supportedCommands: [...SUPPORTED_COMMANDS],
  };
};

export const formatVersionText = (info: VersionInfo): string =>
  [
    `${info.packageName} ${info.packageVersion}`,
    `schemaVersion: ${info.schemaVersion}`,
    `commands: ${info.supportedCommands.join(', ')}`,
    '',
  ].join('\n');

