import type { DashboardArtifactRef, DashboardVersionEntry } from '../dashboard/types.js';
import {
  acceptanceEvidenceLabel,
  artifactEvidenceLabel,
  coverageEvidenceLabel,
} from './evidence-labels.js';
import type { StaticDemoBundle } from './types.js';

const artifactMarkdownLink = (
  relativePath: string,
  label: string,
  present: boolean,
): string => (present ? `[${label}](${relativePath})` : `${label} (missing)`);

const renderTimeline = (bundle: StaticDemoBundle): string => {
  if (bundle.timeline.length === 0) {
    return '_No version folders found under runs/._\n';
  }
  const rows = bundle.timeline.map(
    (entry) =>
      `| ${entry.version} | ${coverageEvidenceLabel(entry.coverageStatus)} | ${acceptanceEvidenceLabel(entry.acceptanceStatus)} | ${entry.runCount} | ${Math.round(entry.winRate * 100)}% | ${entry.missingArtifactCount} | [summary](${entry.summaryPath}) | [changelog](${entry.changelogPath}) | [acceptance](${entry.acceptancePath}) |`,
  );
  return `| Version | Coverage | Acceptance | Runs | Win rate | Missing | Summary | Changelog | Acceptance |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
${rows.join('\n')}\n`;
};

const renderComparisons = (bundle: StaticDemoBundle): string => {
  if (bundle.comparisons.length === 0) {
    return '_No persisted comparisons found._\n';
  }
  return bundle.comparisons
    .map((comparison) => {
      const status =
        comparison.jsonPresent && comparison.markdownPresent
          ? 'generated'
          : comparison.jsonPresent || comparison.markdownPresent
            ? 'partial'
            : 'missing';
      const interpretation = comparison.interpretation ?? '_Interpretation unavailable._';
      return `### ${comparison.baseVersion} -> ${comparison.targetVersion}

- Status: ${status}
- Interpretation: ${interpretation}
- Artifacts: ${artifactMarkdownLink(comparison.jsonPath, 'json', comparison.jsonPresent)}, ${artifactMarkdownLink(comparison.markdownPath, 'markdown', comparison.markdownPresent)}
`;
    })
    .join('\n');
};

const renderArtifactList = (artifacts: readonly DashboardArtifactRef[]): string =>
  artifacts
    .map(
      (artifact) =>
        `- ${artifact.kind}: ${artifactMarkdownLink(artifact.relativePath, artifact.label, artifact.present)} (${artifactEvidenceLabel(artifact)})`,
    )
    .join('\n');

const renderVersionSection = (entry: DashboardVersionEntry): string => {
  const missing = entry.summary.artifact_coverage.traces.missing
    .concat(entry.summary.artifact_coverage.reviews.missing)
    .concat(entry.summary.artifact_coverage.scorecards.missing);
  const missingBlock =
    missing.length > 0
      ? `\nMissing generated evidence (not fabricated): ${missing.join(', ')}\n`
      : '';

  return `## ${entry.version}

- Coverage: ${coverageEvidenceLabel(entry.summary.status)} (${entry.summary.status})
- Acceptance: ${acceptanceEvidenceLabel(entry.summary.acceptance_status)} (${entry.summary.acceptance_status})
- Runs: ${entry.summary.runs.length}
- Missing artifacts: ${entry.missingArtifactCount}
${missingBlock}
### Artifacts

${renderArtifactList(entry.artifacts)}

### Comparisons

${
  entry.comparisons.length === 0
    ? '_No comparisons reference this version._'
    : entry.comparisons
        .map(
          (comparison) =>
            `- ${comparison.baseVersion} vs ${comparison.targetVersion}: [json](${comparison.jsonPath}), [markdown](${comparison.markdownPath})`,
        )
        .join('\n')
}
`;
};

const indentedCodeBlock = (value: string): string =>
  value
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');

export const renderStaticDemoMarkdown = (bundle: StaticDemoBundle): string => {
  const demoSummary = bundle.demoSummaryPresent
    ? `## Demo loop summary

Source: [${bundle.demoSummaryPath}](${bundle.demoSummaryPath})

${indentedCodeBlock(bundle.demoSummaryExcerpt ?? '')}
`
    : `## Demo loop summary

No \`runs/demo_summary.md\` found. Regenerate with \`pnpm run demo-loop -- --runs-root .\`.
`;

  return `# Dungeon Forge Static Demo

Generated: ${bundle.generatedAt}
Runs root: \`${bundle.runsRoot}\`
Read-only publisher: ${bundle.readOnly}

${bundle.loopSummary}

${demoSummary}

## Version timeline

${renderTimeline(bundle)}

## Version comparisons

${renderComparisons(bundle)}

## Regenerate evidence

${bundle.regenerationCommands.map((command) => `- \`${command}\``).join('\n')}

${bundle.index.versions.map((entry) => renderVersionSection(entry)).join('\n')}
`;
};
