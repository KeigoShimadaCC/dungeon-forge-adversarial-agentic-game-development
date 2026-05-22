import { parseArtifactWriteMode, type ArtifactWriteMode } from './artifact-write-policy.js';

export interface HarnessCliCommonArgs {
  runsRoot: string;
  onExisting: ArtifactWriteMode;
}

export const parseHarnessCliCommonArgs = (
  argv: string[],
  base: Partial<HarnessCliCommonArgs> = {},
): HarnessCliCommonArgs => {
  const args: HarnessCliCommonArgs = {
    runsRoot: base.runsRoot ?? process.cwd(),
    onExisting: base.onExisting ?? 'fail',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--') {
      continue;
    }
    if (token === '--runs-root' && next) {
      args.runsRoot = next;
      index += 1;
      continue;
    }
    if (token === '--on-existing' && next) {
      args.onExisting = parseArtifactWriteMode(next);
      index += 1;
      continue;
    }
  }

  return args;
};
