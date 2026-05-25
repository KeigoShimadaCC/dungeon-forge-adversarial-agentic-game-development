import { access, readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from './json.js';

export type PackageManager = 'pnpm' | 'yarn' | 'npm' | 'bun' | 'unknown';

export interface RepoProfile {
  schemaVersion: 1;
  repoRoot: string;
  packageManager: PackageManager;
  languages: string[];
  frameworks: string[];
  detectedFiles: {
    packageJson: boolean;
    tsconfig: boolean;
    vite: boolean;
    next: boolean;
    pyproject: boolean;
    requirements: boolean;
  };
  sourceDirectories: string[];
  testDirectories: string[];
  docsDirectories: string[];
  packageScripts: Record<string, string>;
  validationCandidates: string[];
  riskProfile: {
    hasEnvFiles: boolean;
    hasGitHubWorkflows: boolean;
    hasDeploymentConfig: boolean;
    secretSensitivePaths: string[];
  };
  recommendedConfig: {
    globalValidationCommands: string[];
    defaultAllowedPaths: string[];
    defaultForbiddenPaths: string[];
  };
}

const exists = async (filePath: string): Promise<boolean> =>
  access(filePath)
    .then(() => true)
    .catch(() => false);

const fileExists = async (filePath: string): Promise<boolean> =>
  stat(filePath)
    .then((entry) => entry.isFile())
    .catch(() => false);

const directoryExists = async (filePath: string): Promise<boolean> =>
  stat(filePath)
    .then((entry) => entry.isDirectory())
    .catch(() => false);

const readTextIfFileExists = async (filePath: string): Promise<string | undefined> =>
  fileExists(filePath)
    .then((present) => (present ? readFile(filePath, 'utf8') : undefined))
    .catch(() => undefined);

const pushUnique = (values: string[], value: string): void => {
  if (!values.includes(value)) values.push(value);
};

const rootEntries = async (repoRoot: string): Promise<string[]> =>
  readdir(repoRoot)
    .then((entries) => entries.sort((left, right) => left.localeCompare(right)))
    .catch(() => []);

const detectPackageManager = async (repoRoot: string): Promise<PackageManager> => {
  if (await fileExists(path.join(repoRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fileExists(path.join(repoRoot, 'yarn.lock'))) return 'yarn';
  if (await fileExists(path.join(repoRoot, 'package-lock.json'))) return 'npm';
  if ((await fileExists(path.join(repoRoot, 'bun.lockb'))) || (await fileExists(path.join(repoRoot, 'bun.lock')))) {
    return 'bun';
  }
  return 'unknown';
};

const hasRootFileMatching = (entries: string[], matcher: RegExp): boolean =>
  entries.some((entry) => matcher.test(entry));

const collectDirectories = async (repoRoot: string, candidates: string[]): Promise<string[]> => {
  const found: string[] = [];
  for (const candidate of candidates) {
    if (await directoryExists(path.join(repoRoot, candidate))) {
      found.push(candidate);
    }
  }
  return found;
};

const parsePackageScripts = async (repoRoot: string): Promise<Record<string, string>> => {
  const packageJson = await readTextIfFileExists(path.join(repoRoot, 'package.json'));
  if (!packageJson) return {};
  try {
    const parsed = JSON.parse(packageJson) as { scripts?: Record<string, unknown> };
    const scripts: Record<string, string> = {};
    for (const [name, value] of Object.entries(parsed.scripts ?? {})) {
      if (typeof value === 'string') scripts[name] = value;
    }
    return scripts;
  } catch {
    return {};
  }
};

const commandPrefix = (packageManager: PackageManager): string => {
  if (packageManager === 'unknown') return 'npm';
  return packageManager;
};

const validationCandidatesFromScripts = (
  packageManager: PackageManager,
  scripts: Record<string, string>,
): string[] => {
  const pm = commandPrefix(packageManager);
  const candidates: string[] = [];
  if (scripts.test) candidates.push(`${pm} test`);
  for (const scriptName of ['typecheck', 'lint', 'build', 'check']) {
    if (scripts[scriptName]) candidates.push(`${pm} run ${scriptName}`);
  }
  return candidates;
};

const findFileWithExtension = async (
  repoRoot: string,
  extension: string,
  options: { maxDepth: number },
): Promise<boolean> => {
  const ignored = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', 'runs']);
  const visit = async (dir: string, depth: number): Promise<boolean> => {
    if (depth > options.maxDepth) return false;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;
      const entryPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(extension)) return true;
      if (entry.isDirectory() && (await visit(entryPath, depth + 1))) return true;
    }
    return false;
  };
  return visit(repoRoot, 0);
};

const detectsFastApiImport = async (repoRoot: string): Promise<boolean> => {
  const ignored = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', 'runs']);
  const visit = async (dir: string, depth: number): Promise<boolean> => {
    if (depth > 3) return false;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;
      const entryPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.py')) {
        const contents = await readFile(entryPath, 'utf8').catch(() => '');
        if (/from\s+fastapi\s+import|import\s+fastapi/.test(contents)) return true;
      }
      if (entry.isDirectory() && (await visit(entryPath, depth + 1))) return true;
    }
    return false;
  };
  return visit(repoRoot, 0);
};

const detectRiskProfile = async (repoRoot: string, entries: string[]): Promise<RepoProfile['riskProfile']> => {
  const envFiles = entries.filter((entry) => entry === '.env' || entry.startsWith('.env.'));
  const deploymentPaths = [
    'Dockerfile',
    'docker-compose.yml',
    'compose.yml',
    'compose.yaml',
    'vercel.json',
    'netlify.toml',
    'wrangler.toml',
    'firebase.json',
  ];
  const deploymentMatches = [];
  for (const deploymentPath of deploymentPaths) {
    if (await exists(path.join(repoRoot, deploymentPath))) {
      deploymentMatches.push(deploymentPath);
    }
  }
  if (await directoryExists(path.join(repoRoot, 'supabase'))) {
    deploymentMatches.push('supabase/**');
  }
  return {
    hasEnvFiles: envFiles.length > 0,
    hasGitHubWorkflows: await directoryExists(path.join(repoRoot, '.github', 'workflows')),
    hasDeploymentConfig: deploymentMatches.length > 0,
    secretSensitivePaths: envFiles,
  };
};

export const createRepoProfile = async (repoRootInput: string): Promise<RepoProfile> => {
  const repoRoot = path.resolve(repoRootInput);
  const entries = await rootEntries(repoRoot);
  const packageManager = await detectPackageManager(repoRoot);
  const packageScripts = await parsePackageScripts(repoRoot);
  const packageJson = await fileExists(path.join(repoRoot, 'package.json'));
  const tsconfig = await fileExists(path.join(repoRoot, 'tsconfig.json'));
  const pyproject = await fileExists(path.join(repoRoot, 'pyproject.toml'));
  const requirements = await fileExists(path.join(repoRoot, 'requirements.txt'));
  const pyprojectContents = await readTextIfFileExists(path.join(repoRoot, 'pyproject.toml'));

  const languages: string[] = [];
  if (tsconfig) pushUnique(languages, 'typescript');
  else if (packageJson) pushUnique(languages, 'javascript');
  if (pyproject || requirements) pushUnique(languages, 'python');
  if (await fileExists(path.join(repoRoot, 'Gemfile'))) pushUnique(languages, 'ruby');
  if (await fileExists(path.join(repoRoot, 'go.mod'))) pushUnique(languages, 'go');
  if (await fileExists(path.join(repoRoot, 'Cargo.toml'))) pushUnique(languages, 'rust');
  if (await fileExists(path.join(repoRoot, 'Package.swift'))) pushUnique(languages, 'swift');
  if (await findFileWithExtension(repoRoot, '.csproj', { maxDepth: 3 })) pushUnique(languages, 'csharp');

  const frameworks: string[] = [];
  const hasNext = hasRootFileMatching(entries, /^next\.config\.(js|mjs|cjs|ts)$/);
  const hasVite = hasRootFileMatching(entries, /^vite\.config\.(js|mjs|cjs|ts)$/);
  const hasNuxt = hasRootFileMatching(entries, /^nuxt\.config\.(js|mjs|cjs|ts)$/);
  const hasSvelte = hasRootFileMatching(entries, /^svelte\.config\.(js|mjs|cjs|ts)$/);
  if (hasNext) pushUnique(frameworks, 'nextjs');
  if (hasVite) pushUnique(frameworks, 'vite');
  if (hasNuxt) pushUnique(frameworks, 'nuxt');
  if (hasSvelte) pushUnique(frameworks, 'svelte');
  if (/\bfastapi\b/i.test(pyprojectContents ?? '') || (await detectsFastApiImport(repoRoot))) {
    pushUnique(frameworks, 'fastapi');
  }

  const sourceDirectories = await collectDirectories(repoRoot, ['src', 'app', 'lib', 'packages', 'services']);
  const testDirectories = await collectDirectories(repoRoot, ['tests', 'test', '__tests__', 'spec']);
  const docsDirectories = await collectDirectories(repoRoot, ['docs', 'doc']);
  const validationCandidates = validationCandidatesFromScripts(packageManager, packageScripts);
  const riskProfile = await detectRiskProfile(repoRoot, entries);
  const globalValidationCommands = [...validationCandidates];
  pushUnique(globalValidationCommands, 'git diff --check');

  const defaultAllowedPaths: string[] = [];
  for (const dir of sourceDirectories.length > 0 ? sourceDirectories : ['src']) {
    pushUnique(defaultAllowedPaths, `${dir}/**`);
  }
  for (const dir of testDirectories.length > 0 ? testDirectories : ['tests']) {
    pushUnique(defaultAllowedPaths, `${dir}/**`);
  }
  for (const dir of docsDirectories.length > 0 ? docsDirectories : ['docs']) {
    pushUnique(defaultAllowedPaths, `${dir}/**`);
  }
  for (const file of ['README.md', 'package.json', 'tsconfig.json', 'PROGRESS.md']) {
    pushUnique(defaultAllowedPaths, file);
  }

  return {
    schemaVersion: 1,
    repoRoot,
    packageManager,
    languages,
    frameworks,
    detectedFiles: {
      packageJson,
      tsconfig,
      vite: hasVite,
      next: hasNext,
      pyproject,
      requirements,
    },
    sourceDirectories,
    testDirectories,
    docsDirectories,
    packageScripts,
    validationCandidates,
    riskProfile,
    recommendedConfig: {
      globalValidationCommands,
      defaultAllowedPaths,
      defaultForbiddenPaths: ['.env', '.env.*', 'node_modules/**', 'dist/**', 'build/**'],
    },
  };
};

export const writeRepoProfile = async (profile: RepoProfile, outputPath: string): Promise<void> => {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, stringifyDeterministicJson(profile));
};
