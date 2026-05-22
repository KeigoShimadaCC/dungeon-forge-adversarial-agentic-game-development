import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ArtifactWriteMode = 'fail' | 'overwrite' | 'archive';

export const ARTIFACT_WRITE_MODES: readonly ArtifactWriteMode[] = [
  'fail',
  'overwrite',
  'archive',
] as const;

export const DEFAULT_ARTIFACT_WRITE_MODE: ArtifactWriteMode = 'fail';

export interface ArtifactWriteOptions {
  onExisting?: ArtifactWriteMode;
}

export interface ArtifactWritePolicyContext {
  /** Injectable clock for deterministic archive folder names in tests. */
  now?: () => Date;
  /** When set, archive directories use this label instead of a timestamp. */
  archiveLabel?: string;
}

const VERSION_ID_ALIASES: Readonly<Record<string, string>> = {
  'v09c-smoke': 'v009',
};

export const VERSION_ID_ALIAS_ENTRIES = Object.entries(VERSION_ID_ALIASES) as ReadonlyArray<
  readonly [string, string]
>;

export const resolveVersionId = (version: string): string => {
  const trimmed = version.trim();
  return VERSION_ID_ALIASES[trimmed] ?? trimmed;
};

export const parseArtifactWriteMode = (value: string): ArtifactWriteMode => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'fail' || normalized === 'overwrite' || normalized === 'archive') {
    return normalized;
  }
  throw new Error(
    `Invalid --on-existing "${value}". Expected one of: ${ARTIFACT_WRITE_MODES.join(', ')}.`,
  );
};

export const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

const formatArchiveLabel = (date: Date): string => {
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    pad(date.getUTCMilliseconds(), 3),
  ].join('');
};

export const buildArchiveDestination = (
  runsRoot: string,
  existingAbsolutePath: string,
  context: ArtifactWritePolicyContext = {},
): string => {
  const relative = path.relative(runsRoot, existingAbsolutePath);
  const label = context.archiveLabel ?? formatArchiveLabel((context.now ?? (() => new Date()))());
  return path.join(runsRoot, 'runs', '_archive', label, relative);
};

export const archiveExistingFile = async (
  runsRoot: string,
  existingAbsolutePath: string,
  context: ArtifactWritePolicyContext = {},
): Promise<string> => {
  const destination = buildArchiveDestination(runsRoot, existingAbsolutePath, context);
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(existingAbsolutePath, destination);
  return destination;
};

export const assertArtifactWritable = async (
  absolutePath: string,
  options: ArtifactWriteOptions = {},
  context: {
    runsRoot?: string;
    policyContext?: ArtifactWritePolicyContext;
    artifactLabel?: string;
  } = {},
): Promise<{ archivedFrom?: string }> => {
  if (!(await fileExists(absolutePath))) {
    return {};
  }

  const mode = options.onExisting ?? DEFAULT_ARTIFACT_WRITE_MODE;
  const label = context.artifactLabel ?? path.relative(context.runsRoot ?? process.cwd(), absolutePath);

  switch (mode) {
    case 'overwrite':
      return {};
    case 'archive': {
      if (!context.runsRoot) {
        throw new Error('Archive mode requires runsRoot when replacing an existing artifact.');
      }
      const archivedFrom = await archiveExistingFile(
        context.runsRoot,
        absolutePath,
        context.policyContext,
      );
      return { archivedFrom };
    }
    case 'fail':
    default:
      throw new Error(
        `Artifact already exists (${label}). Re-run with --on-existing overwrite or --on-existing archive to replace it intentionally.`,
      );
  }
};

export const writeArtifactFile = async (
  absolutePath: string,
  contents: string,
  options: ArtifactWriteOptions = {},
  context: {
    runsRoot?: string;
    policyContext?: ArtifactWritePolicyContext;
    artifactLabel?: string;
  } = {},
): Promise<{ archivedFrom?: string }> => {
  const prep = await assertArtifactWritable(absolutePath, options, context);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, 'utf8');
  return prep;
};
