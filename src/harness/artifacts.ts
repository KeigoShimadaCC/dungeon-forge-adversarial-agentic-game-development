import path from 'node:path';

import {
  type ArtifactWriteOptions,
  type ArtifactWritePolicyContext,
  writeArtifactFile,
} from './artifact-write-policy.js';
import type { PlaythroughReview } from './reviewer-client.js';
import type { PlaythroughScorecard, PlaythroughTrace } from './types.js';
import { stringifyDeterministicJson } from './json.js';

export const buildArtifactBasename = (seed: string, policyId: string): string =>
  `${seed}_${policyId}`;

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

export interface SavePlaythroughArtifactOptions {
  write?: ArtifactWriteOptions;
  policyContext?: ArtifactWritePolicyContext;
}

export const savePlaythroughArtifacts = async (
  runsRoot: string,
  trace: PlaythroughTrace,
  scorecard: PlaythroughScorecard,
  options: SavePlaythroughArtifactOptions = {},
): Promise<SavedArtifacts> => {
  const traceRelative = buildTraceRelativePath(trace.version, trace.seed, trace.persona);
  const scorecardRelative = buildScorecardRelativePath(
    scorecard.version,
    scorecard.seed,
    scorecard.persona,
  );

  const tracePath = path.join(runsRoot, traceRelative);
  const scorecardPath = path.join(runsRoot, scorecardRelative);
  const writeContext = {
    runsRoot,
    policyContext: options.policyContext,
  };

  await writeArtifactFile(
    tracePath,
    stringifyDeterministicJson(trace),
    options.write,
    { ...writeContext, artifactLabel: traceRelative },
  );
  await writeArtifactFile(
    scorecardPath,
    stringifyDeterministicJson(scorecard),
    options.write,
    { ...writeContext, artifactLabel: scorecardRelative },
  );

  return { tracePath, scorecardPath };
};

export const savePlaythroughReview = async (
  runsRoot: string,
  review: PlaythroughReview,
  options: SavePlaythroughArtifactOptions = {},
): Promise<SavedReviewArtifact> => {
  const reviewRelative = buildReviewRelativePath(review.version, review.seed, review.persona);
  const reviewPath = path.join(runsRoot, reviewRelative);

  await writeArtifactFile(
    reviewPath,
    stringifyDeterministicJson(review),
    options.write,
    {
      runsRoot,
      policyContext: options.policyContext,
      artifactLabel: reviewRelative,
    },
  );

  return { reviewPath };
};
