import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { PlaythroughScorecard, PlaythroughTrace } from './types.js';
import { stringifyDeterministicJson } from './json.js';

export const buildArtifactBasename = (seed: string, policyId: string): string =>
  `${seed}__${policyId}`;

export const buildTraceRelativePath = (
  version: string,
  seed: string,
  policyId: string,
): string => path.join('runs', version, 'traces', `${buildArtifactBasename(seed, policyId)}.json`);

export const buildScorecardRelativePath = (
  version: string,
  seed: string,
  policyId: string,
): string =>
  path.join('runs', version, 'scorecards', `${buildArtifactBasename(seed, policyId)}.json`);

export interface SavedArtifacts {
  tracePath: string;
  scorecardPath: string;
}

export const savePlaythroughArtifacts = async (
  runsRoot: string,
  trace: PlaythroughTrace,
  scorecard: PlaythroughScorecard,
): Promise<SavedArtifacts> => {
  const traceRelative = buildTraceRelativePath(trace.version, trace.seed, trace.persona);
  const scorecardRelative = buildScorecardRelativePath(
    scorecard.version,
    scorecard.seed,
    scorecard.persona,
  );

  const tracePath = path.join(runsRoot, traceRelative);
  const scorecardPath = path.join(runsRoot, scorecardRelative);

  await mkdir(path.dirname(tracePath), { recursive: true });
  await mkdir(path.dirname(scorecardPath), { recursive: true });

  await writeFile(tracePath, stringifyDeterministicJson(trace), 'utf8');
  await writeFile(scorecardPath, stringifyDeterministicJson(scorecard), 'utf8');

  return { tracePath, scorecardPath };
};
