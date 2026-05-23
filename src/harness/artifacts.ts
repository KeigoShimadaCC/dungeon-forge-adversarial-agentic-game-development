import path from 'node:path';

import {
  type ArtifactWriteOptions,
  type ArtifactWritePolicyContext,
  writeArtifactFile,
} from './artifact-write-policy.js';
import type { PlaythroughReview } from './reviewer-client.js';
import type { PlaythroughScorecard, PlaythroughTrace } from './types.js';
import { stringifyDeterministicJson } from './json.js';
import { enrichPlaythroughReview, renderReviewMarkdown } from './review-report.js';
import {
  assertValidPlaythroughReview,
  ReviewValidationError,
} from './review-validation.js';

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
  reviewMarkdownPath: string;
}

export { ReviewValidationError };

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
  assertValidPlaythroughReview(review);

  const enriched = enrichPlaythroughReview(review, {
    trace_path: review.trace_path,
    scorecard_path: review.scorecard_path,
    scorecard_result: review.scorecard_result,
    scorecard_turns: review.scorecard_turns,
  });
  const reviewRelative = buildReviewRelativePath(
    enriched.version,
    enriched.seed,
    enriched.persona,
  );
  const reviewMarkdownRelative = enriched.review_markdown_path!;
  const reviewPath = path.join(runsRoot, reviewRelative);
  const reviewMarkdownPath = path.join(runsRoot, reviewMarkdownRelative);
  const writeContext = {
    runsRoot,
    policyContext: options.policyContext,
  };

  await writeArtifactFile(
    reviewPath,
    stringifyDeterministicJson(enriched),
    options.write,
    { ...writeContext, artifactLabel: reviewRelative },
  );
  await writeArtifactFile(
    reviewMarkdownPath,
    renderReviewMarkdown(enriched),
    options.write,
    { ...writeContext, artifactLabel: reviewMarkdownRelative },
  );

  return { reviewPath, reviewMarkdownPath };
};
