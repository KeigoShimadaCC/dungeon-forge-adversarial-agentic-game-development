import { access, cp, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeJson } from './shared.js';

const exists = async (filePath: string): Promise<boolean> =>
  access(filePath)
    .then(() => true)
    .catch(() => false);

const findPackageRoot = async (): Promise<string> => {
  let current = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    if ((await exists(path.join(current, 'package.json'))) && (await exists(path.join(current, 'templates')))) {
      return current;
    }
    current = path.dirname(current);
  }
  throw new Error('Unable to locate package root with templates/.');
};

const copyEntry = async (source: string, target: string, force: boolean): Promise<string[]> => {
  const sourceStat = await stat(source);
  if (sourceStat.isDirectory()) {
    const copied: string[] = [];
    await mkdir(target, { recursive: true });
    for (const entry of await readdir(source)) {
      copied.push(...(await copyEntry(path.join(source, entry), path.join(target, entry), force)));
    }
    return copied;
  }
  if ((await exists(target)) && !force) {
    throw new Error(`Refusing to overwrite existing file: ${target}. Re-run with --force to replace templates.`);
  }
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { force });
  return [target];
};

export const runInitCommand = async (
  repoRoot: string,
  options: Record<string, string | boolean>,
): Promise<void> => {
  const force = options.force === true;
  const packageRoot = await findPackageRoot();
  const templatesRoot = path.join(packageRoot, 'templates');
  const copied: string[] = [];
  copied.push(...(await copyEntry(path.join(templatesRoot, 'repo-files'), repoRoot, force)));
  copied.push(...(await copyEntry(path.join(templatesRoot, 'concept-and-ideas'), path.join(repoRoot, 'concept-and-ideas'), force)));
  copied.push(...(await copyEntry(path.join(templatesRoot, 'phase-plans'), path.join(repoRoot, 'phase-plans'), force)));
  copied.push(...(await copyEntry(path.join(templatesRoot, 'automation'), path.join(repoRoot, 'automation'), force)));
  writeJson({ status: 'initialized', repoRoot, copied });
};
