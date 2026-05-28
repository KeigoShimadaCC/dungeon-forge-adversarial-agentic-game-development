import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CreateRunnerPackageOptions {
  targetRoot: string;
  destination?: string;
  apply?: boolean;
  force?: boolean;
}

export interface CreateRunnerPackageReport {
  schemaVersion: 1;
  status: 'planned' | 'applied';
  sourceRoot: string;
  targetRoot: string;
  destinationPath: string;
  copiedFiles: string[];
  excludedPaths: string[];
  force: boolean;
  recommendedNextActions: string[];
}

const findPackageRoot = async (): Promise<string> => {
  let current = path.dirname(fileURLToPath(import.meta.url));
  for (let index = 0; index < 8; index += 1) {
    const candidate = path.join(current, 'package.json');
    try {
      const parsed = JSON.parse(await readFile(candidate, 'utf8')) as { name?: string };
      if (parsed.name === 'agentic-phase-runner-package') return current;
    } catch {
      // Keep walking up from dist/src/core or src/core.
    }
    current = path.dirname(current);
  }
  throw new Error('Unable to locate agentic-phase-runner-package root.');
};

const excludedNames = new Set(['node_modules', 'dist', 'coverage', 'runs', '.turbo', '.DS_Store']);

const shouldExclude = (relativePath: string): boolean => {
  const parts = relativePath.split(path.sep);
  if (parts.some((part) => excludedNames.has(part))) return true;
  const base = path.basename(relativePath);
  return base === '.env' || base.startsWith('.env.') || base.endsWith('.log');
};

const collectFiles = async (
  root: string,
  current: string,
  files: string[],
  excluded: string[],
): Promise<void> => {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    const relative = path.relative(root, fullPath);
    if (shouldExclude(relative)) {
      excluded.push(relative);
      continue;
    }
    if (entry.isDirectory()) {
      await collectFiles(root, fullPath, files, excluded);
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
};

export const createRunnerPackageCopy = async (
  options: CreateRunnerPackageOptions,
): Promise<CreateRunnerPackageReport> => {
  const sourceRoot = await findPackageRoot();
  const targetRoot = path.resolve(options.targetRoot);
  const destinationPath = path.resolve(targetRoot, options.destination ?? 'agentic-phase-runner-package');
  const copiedFiles: string[] = [];
  const excludedPaths: string[] = [];
  await collectFiles(sourceRoot, sourceRoot, copiedFiles, excludedPaths);
  copiedFiles.sort((left, right) => left.localeCompare(right));
  excludedPaths.sort((left, right) => left.localeCompare(right));

  if (options.apply === true) {
    for (const relative of copiedFiles) {
      const source = path.join(sourceRoot, relative);
      const destination = path.join(destinationPath, relative);
      const existing = await stat(destination)
        .then((entry) => entry.isFile())
        .catch(() => false);
      if (existing && options.force !== true) {
        throw new Error(`Destination file already exists: ${destination}`);
      }
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, await readFile(source));
    }
  }

  return {
    schemaVersion: 1,
    status: options.apply === true ? 'applied' : 'planned',
    sourceRoot,
    targetRoot,
    destinationPath,
    copiedFiles,
    excludedPaths,
    force: options.force === true,
    recommendedNextActions:
      options.apply === true
        ? [
            `cd ${path.relative(process.cwd(), destinationPath) || destinationPath}`,
            'pnpm install',
            'pnpm run build',
          ]
        : ['Review the file list, then rerun with --apply to copy the package.'],
  };
};
