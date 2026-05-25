import type { PhaseDefinition } from '../core/phase-runner.js';
import { isPathAllowedForPhase } from '../core/phase-runner.js';

export const uniqueSortedChangedPaths = (paths: readonly string[]): string[] =>
  [...new Set(paths.filter((entry) => entry.length > 0))].sort((left, right) =>
    left.localeCompare(right),
  );

export const changedPathsOutsidePhase = (
  phase: PhaseDefinition,
  changedPaths: readonly string[],
): string[] => changedPaths.filter((changedPath) => !isPathAllowedForPhase(phase, changedPath));
