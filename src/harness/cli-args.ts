import { normalizeChallengeModeId } from '../game/challenge-modes.js';
import { parseArtifactWriteMode, type ArtifactWriteMode } from './artifact-write-policy.js';

export interface HarnessCliCommonArgs {
  runsRoot: string;
  onExisting: ArtifactWriteMode;
  challengeMode?: string;
}

export interface HarnessLlmCliArgs {
  useLlmPlayer: boolean;
  useLlmReviewer: boolean;
}

export const parseHarnessLlmCliArgs = (
  argv: string[],
  base: Partial<HarnessLlmCliArgs> = {},
): HarnessLlmCliArgs => {
  const args: HarnessLlmCliArgs = {
    useLlmPlayer: base.useLlmPlayer ?? false,
    useLlmReviewer: base.useLlmReviewer ?? false,
  };

  for (const token of argv) {
    if (token === '--use-llm-player' || token === '--llm-player') {
      args.useLlmPlayer = true;
      continue;
    }
    if (token === '--use-llm-reviewer' || token === '--llm-reviewer') {
      args.useLlmReviewer = true;
      continue;
    }
    if (token === '--use-llm') {
      args.useLlmPlayer = true;
      args.useLlmReviewer = true;
    }
  }

  return args;
};

export const parseHarnessCliCommonArgs = (
  argv: string[],
  base: Partial<HarnessCliCommonArgs> = {},
): HarnessCliCommonArgs => {
  const args: HarnessCliCommonArgs = {
    runsRoot: base.runsRoot ?? process.cwd(),
    onExisting: base.onExisting ?? 'fail',
    challengeMode: normalizeChallengeModeId(base.challengeMode),
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
    if (token === '--challenge-mode' && next) {
      args.challengeMode = normalizeChallengeModeId(next);
      index += 1;
    }
  }

  return args;
};
