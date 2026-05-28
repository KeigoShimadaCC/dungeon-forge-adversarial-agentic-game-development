import { runMigrations } from '../../core/migrate.js';
import { writeJson } from './shared.js';

export const runMigrateCommand = async (
  repoRoot: string,
  options: Record<string, string | boolean>,
): Promise<void> => {
  if (options.apply === true && options['dry-run'] === true) {
    throw new Error('Choose either --dry-run or --apply, not both.');
  }
  writeJson(await runMigrations(repoRoot, { apply: options.apply === true }));
};
