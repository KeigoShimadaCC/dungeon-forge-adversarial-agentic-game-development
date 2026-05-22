import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { PlaythroughReview } from './reviewer-client.js';
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

export const buildReviewRelativePath = (
  version: string,
  seed: string,
  persona: string,
): string => path.join('runs', version, 'reviews', `${buildArtifactBasename(seed, persona)}.json`);

export interface SavedArtifacts {
  tracePath: string;
  scorecardPath: string;
}

export interface SavedReviewArtifact {
  reviewPath: string;
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

export const savePlaythroughReview = async (
  runsRoot: string,
  review: PlaythroughReview,
): Promise<SavedReviewArtifact> => {
  const reviewRelative = buildReviewRelativePath(review.version, review.seed, review.persona);
  const reviewPath = path.join(runsRoot, reviewRelative);

  await mkdir(path.dirname(reviewPath), { recursive: true });
  await writeFile(reviewPath, stringifyDeterministicJson(review), 'utf8');

  return { reviewPath };
};
