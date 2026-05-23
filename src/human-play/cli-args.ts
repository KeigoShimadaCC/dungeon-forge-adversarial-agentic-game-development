import type { HumanPlayMode } from './types.js';

export interface ParsedHumanPlayCliArgs {
  seed: string;
  version: string;
  challengeMode?: string;
  scenarioPack?: string;
  mode: HumanPlayMode;
  scriptIndices?: number[];
  sessionLabel?: string;
  playtestNotes?: string;
  notesFile?: string;
  maxSteps?: number;
  runsRoot: string;
  saveTrace: boolean;
  help: boolean;
}

export const HUMAN_PLAY_CLI_USAGE = `Usage: pnpm run human-play -- [options]

Local human-play interface over the same GameEngine used by the harness.

Options:
  --seed <id>              Required seed for deterministic play (e.g. seed_001)
  --version <id>         Game version profile (default: 0.3.0-minimal-dungeon)
  --challenge-mode <id>  Optional finite challenge preset
  --scenario-pack <id>   Optional bounded scenario pack
  --auto                 Non-interactive auto-play using deterministic action fallback
  --script <i,j,...>     Non-interactive scripted indices into available actions
  --max-steps <n>        Optional step cap (default: derived from maxTurns)
  --save-trace           Write harness-compatible trace/scorecard under runs/
  --label <text>         Optional local session label (max 64 chars, no PII required)
  --notes <text>         Optional post-run feedback saved with --save-trace (max 2000 chars)
  --notes-file <path>    Read post-run feedback from a local text file (used with --save-trace)
  --runs-root <path>     Root directory for saved traces (default: cwd)
  --help                 Show this help

Interactive default (no --auto/--script): terminal UI with numbered structured actions.
`;

export const parseHumanPlayCliArgs = (argv: string[]): ParsedHumanPlayCliArgs => {
  const tokens = argv.filter((token) => token !== '--');
  let seed: string | undefined;
  let version = '0.3.0-minimal-dungeon';
  let challengeMode: string | undefined;
  let scenarioPack: string | undefined;
  let mode: HumanPlayMode = 'terminal';
  let scriptIndices: number[] | undefined;
  let maxSteps: number | undefined;
  let runsRoot = process.cwd();
  let saveTrace = false;
  let sessionLabel: string | undefined;
  let playtestNotes: string | undefined;
  let notesFile: string | undefined;
  let help = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }
    if (token === '--seed') {
      seed = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === '--version') {
      version = tokens[index + 1] ?? version;
      index += 1;
      continue;
    }
    if (token === '--challenge-mode') {
      challengeMode = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === '--scenario-pack') {
      scenarioPack = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === '--auto') {
      mode = 'auto';
      continue;
    }
    if (token === '--script') {
      mode = 'script';
      const raw = tokens[index + 1];
      index += 1;
      scriptIndices = raw
        ? raw.split(',').map((part) => Number.parseInt(part.trim(), 10))
        : [];
      continue;
    }
    if (token === '--max-steps') {
      maxSteps = Number.parseInt(tokens[index + 1] ?? '', 10);
      index += 1;
      continue;
    }
    if (token === '--runs-root') {
      runsRoot = tokens[index + 1] ?? runsRoot;
      index += 1;
      continue;
    }
    if (token === '--save-trace') {
      saveTrace = true;
      continue;
    }
    if (token === '--label') {
      sessionLabel = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === '--notes') {
      playtestNotes = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === '--notes-file') {
      notesFile = tokens[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (help) {
    return {
      seed: seed ?? 'seed_001',
      version,
      mode,
      runsRoot,
      saveTrace,
      help: true,
      ...(challengeMode ? { challengeMode } : {}),
      ...(scenarioPack ? { scenarioPack } : {}),
      ...(scriptIndices ? { scriptIndices } : {}),
      ...(maxSteps !== undefined ? { maxSteps } : {}),
      ...(sessionLabel ? { sessionLabel } : {}),
      ...(playtestNotes ? { playtestNotes } : {}),
      ...(notesFile ? { notesFile } : {}),
    };
  }

  if (!seed) {
    throw new Error('Missing required --seed argument.');
  }

  return {
    seed,
    version,
    mode,
    runsRoot,
    saveTrace,
    help: false,
    ...(challengeMode ? { challengeMode } : {}),
    ...(scenarioPack ? { scenarioPack } : {}),
    ...(scriptIndices ? { scriptIndices } : {}),
    ...(maxSteps !== undefined ? { maxSteps } : {}),
    ...(sessionLabel ? { sessionLabel } : {}),
    ...(playtestNotes ? { playtestNotes } : {}),
    ...(notesFile ? { notesFile } : {}),
  };
};
