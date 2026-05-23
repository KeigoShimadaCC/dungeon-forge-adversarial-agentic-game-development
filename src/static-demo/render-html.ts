import type { DashboardArtifactRef, DashboardVersionEntry } from '../dashboard/types.js';
import {
  acceptanceEvidenceLabel,
  artifactEvidenceLabel,
  coverageEvidenceLabel,
} from './evidence-labels.js';
import type { StaticDemoBundle } from './types.js';

export interface RenderStaticDemoHtmlOptions {
  linkBase?: string;
}

const escapeHtml = (value: string | number | null | undefined): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const normalizeHref = (value: string): string => value.replace(/\\/g, '/');

const artifactHref = (relativePath: string, linkBase = ''): string => {
  const normalizedPath = normalizeHref(relativePath);
  const normalizedBase = normalizeHref(linkBase).replace(/\/$/, '');
  if (!normalizedBase || normalizedBase === '.') {
    return normalizedPath;
  }
  return `${normalizedBase}/${normalizedPath}`;
};

const artifactLink = (
  relativePath: string,
  label: string,
  present: boolean,
  linkBase: string,
): string =>
  present
    ? `<a href="${escapeHtml(artifactHref(relativePath, linkBase))}">${escapeHtml(label)}</a>`
    : `<span class="missing">${escapeHtml(label)} (missing)</span>`;

const labelBadge = (label: string, className: string): string =>
  `<span class="label label-${escapeHtml(className)}">${escapeHtml(label)}</span>`;

const artifactPresent = (
  entry: DashboardVersionEntry,
  relativePath: string,
): boolean => entry.artifacts.some((artifact) => artifact.relativePath === relativePath && artifact.present);

const renderTimeline = (bundle: StaticDemoBundle, linkBase: string): string => {
  if (bundle.timeline.length === 0) {
    return '<p class="muted">No version folders found under runs/.</p>';
  }
  const versionById = new Map(bundle.index.versions.map((entry) => [entry.version, entry]));
  return `<table>
    <thead>
      <tr>
        <th>Version</th><th>Coverage</th><th>Acceptance</th><th>Runs</th><th>Win rate</th>
        <th>Missing artifacts</th><th>Summary</th><th>Changelog</th><th>Acceptance file</th>
      </tr>
    </thead>
    <tbody>
      ${bundle.timeline
        .map(
          (entry) => {
            const versionEntry = versionById.get(entry.version);
            const summaryPresent = versionEntry
              ? artifactPresent(versionEntry, entry.summaryPath)
              : false;
            const changelogPresent = versionEntry
              ? artifactPresent(versionEntry, entry.changelogPath)
              : false;
            const acceptancePresent = versionEntry
              ? artifactPresent(versionEntry, entry.acceptancePath)
              : false;
            return `<tr>
            <td><a href="#version-${escapeHtml(entry.version)}">${escapeHtml(entry.version)}</a></td>
            <td>${labelBadge(coverageEvidenceLabel(entry.coverageStatus), entry.coverageStatus)}</td>
            <td>${labelBadge(acceptanceEvidenceLabel(entry.acceptanceStatus), entry.acceptanceStatus)}</td>
            <td>${entry.runCount}</td>
            <td>${Math.round(entry.winRate * 100)}%</td>
            <td>${entry.missingArtifactCount}</td>
            <td>${artifactLink(entry.summaryPath, 'summary', summaryPresent, linkBase)}</td>
            <td>${artifactLink(entry.changelogPath, 'changelog', changelogPresent, linkBase)}</td>
            <td>${artifactLink(entry.acceptancePath, 'acceptance', acceptancePresent, linkBase)}</td>
          </tr>`;
          },
        )
        .join('\n')}
    </tbody>
  </table>`;
};

const renderComparisons = (bundle: StaticDemoBundle, linkBase: string): string => {
  if (bundle.comparisons.length === 0) {
    return '<p class="muted">No persisted comparisons found. Run compare-versions or demo-loop to generate them.</p>';
  }
  return `<table>
    <thead><tr><th>Base</th><th>Target</th><th>Status</th><th>Interpretation</th><th>Artifacts</th></tr></thead>
    <tbody>
      ${bundle.comparisons
        .map((comparison) => {
          const status =
            comparison.jsonPresent && comparison.markdownPresent
              ? 'generated'
              : comparison.jsonPresent || comparison.markdownPresent
                ? 'partial'
                : 'missing';
          const interpretationCell = comparison.interpretation
            ? escapeHtml(comparison.interpretation)
            : '<span class="muted">Interpretation unavailable; open comparison artifacts directly.</span>';
          return `<tr>
            <td>${escapeHtml(comparison.baseVersion)}</td>
            <td>${escapeHtml(comparison.targetVersion)}</td>
            <td>${labelBadge(status, status)}</td>
            <td>${interpretationCell}</td>
            <td>
              ${artifactLink(comparison.jsonPath, 'json', comparison.jsonPresent, linkBase)}
              ${artifactLink(comparison.markdownPath, 'markdown', comparison.markdownPresent, linkBase)}
            </td>
          </tr>`;
        })
        .join('\n')}
    </tbody>
  </table>`;
};

const renderArtifactRow = (artifact: DashboardArtifactRef, linkBase: string): string => {
  const label = artifactEvidenceLabel(artifact);
  return `<tr>
    <td>${escapeHtml(artifact.kind)}</td>
    <td>${artifactLink(artifact.relativePath, artifact.label, artifact.present, linkBase)}</td>
    <td>${labelBadge(label, label)}</td>
    <td><code>${escapeHtml(artifact.relativePath)}</code></td>
  </tr>`;
};

const renderVersionSection = (entry: DashboardVersionEntry, linkBase: string): string => {
  const acceptanceLabel = acceptanceEvidenceLabel(entry.summary.acceptance_status);
  const coverageLabel = coverageEvidenceLabel(entry.summary.status);
  const missingList = entry.summary.artifact_coverage.traces.missing
    .concat(entry.summary.artifact_coverage.reviews.missing)
    .concat(entry.summary.artifact_coverage.scorecards.missing);

  return `<section class="version" id="version-${escapeHtml(entry.version)}">
    <div class="section-heading">
      <h2>${escapeHtml(entry.version)}</h2>
      <div class="summary-strip">
        <span>Coverage: ${labelBadge(coverageLabel, entry.summary.status)}</span>
        <span>Acceptance: ${labelBadge(acceptanceLabel, entry.summary.acceptance_status)}</span>
        <span>Runs: <strong>${entry.summary.runs.length}</strong></span>
        <span>Missing artifacts: <strong>${entry.missingArtifactCount}</strong></span>
      </div>
    </div>
    ${
      missingList.length > 0
        ? `<p class="warn">Missing generated evidence (not fabricated): <code>${escapeHtml(missingList.join(', '))}</code></p>`
        : ''
    }
    <h3>Trace-backed artifacts</h3>
    <table>
      <thead><tr><th>Kind</th><th>Artifact</th><th>Label</th><th>Path</th></tr></thead>
      <tbody>${entry.artifacts.map((artifact) => renderArtifactRow(artifact, linkBase)).join('\n')}</tbody>
    </table>
    <h3>Comparisons referencing this version</h3>
    ${
      entry.comparisons.length === 0
        ? '<p class="muted">No comparisons reference this version.</p>'
        : `<ul>${entry.comparisons
            .map(
              (comparison) =>
                `<li>${escapeHtml(comparison.baseVersion)} vs ${escapeHtml(comparison.targetVersion)}: ${artifactLink(comparison.jsonPath, 'json', true, linkBase)} ${artifactLink(comparison.markdownPath, 'markdown', true, linkBase)}</li>`,
            )
            .join('')}</ul>`
    }
  </section>`;
};

export const renderStaticDemoHtml = (
  bundle: StaticDemoBundle,
  options: RenderStaticDemoHtmlOptions = {},
): string => {
  const linkBase = options.linkBase ?? '';
  const demoSummaryBlock = bundle.demoSummaryPresent
    ? `<section class="panel">
        <h2>Demo loop summary</h2>
        <p>Source: ${artifactLink(bundle.demoSummaryPath ?? '', bundle.demoSummaryPath ?? '', true, linkBase)}</p>
        <pre>${escapeHtml(bundle.demoSummaryExcerpt ?? '')}</pre>
      </section>`
    : `<section class="panel">
        <h2>Demo loop summary</h2>
        <p class="muted">No <code>runs/demo_summary.md</code> found. Regenerate with <code>pnpm run demo-loop -- --runs-root .</code>.</p>
      </section>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dungeon Forge Static Demo</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f6f8;
      --panel: #ffffff;
      --text: #15202b;
      --muted: #5f6b7a;
      --line: #d5dde6;
      --accent: #1d4ed8;
      --ok: #0f7b45;
      --warn: #946200;
      --bad: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    header, main { width: min(1180px, calc(100vw - 32px)); margin: 0 auto; }
    header { padding: 24px 0 12px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 0 0 10px; font-size: 20px; }
    h3 { margin: 18px 0 8px; font-size: 15px; }
    p { margin: 8px 0; }
    pre {
      background: #eef2f6;
      border: 1px solid var(--line);
      padding: 12px;
      overflow-x: auto;
      font-size: 12px;
      white-space: pre-wrap;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
      border: 1px solid var(--line);
      margin: 0 0 16px;
    }
    th, td { border-bottom: 1px solid var(--line); padding: 8px 10px; text-align: left; font-size: 13px; vertical-align: top; }
    th { background: #eef2f6; }
    .panel, .version { background: var(--panel); border: 1px solid var(--line); padding: 16px; margin-bottom: 18px; }
    .version { border-top: 3px solid var(--accent); }
    .meta, .muted { color: var(--muted); }
    .warn { color: var(--warn); }
    .missing { color: var(--bad); font-weight: 600; }
    .label {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 650;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .label-generated, .label-complete, .label-accepted { background: #e8f6ee; color: var(--ok); }
    .label-partial, .label-pending, .label-unknown, .label-blocked { background: #fff5e6; color: var(--warn); }
    .label-missing, .label-rejected { background: #fdecec; color: var(--bad); }
    ul { margin: 0; padding-left: 20px; }
    .section-heading { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .summary-strip { display: flex; flex-wrap: wrap; gap: 8px 14px; color: var(--muted); font-size: 13px; }
  </style>
</head>
<body>
  <header>
    <h1>Dungeon Forge Static Demo</h1>
    <p class="meta">Generated: ${escapeHtml(bundle.generatedAt)} | Runs root: <code>${escapeHtml(bundle.runsRoot)}</code> | Read-only publisher: ${String(bundle.readOnly)}</p>
    <p>${escapeHtml(bundle.loopSummary)}</p>
  </header>
  <main>
    ${demoSummaryBlock}
    <section class="panel">
      <h2>Version timeline</h2>
      <p class="muted">Ordered versions with coverage and acceptance labels. Links point at saved artifacts under runs/.</p>
      ${renderTimeline(bundle, linkBase)}
    </section>
    <section class="panel">
      <h2>Version comparisons</h2>
      <p class="muted">Comparisons summarize how metrics moved between adjacent versions. Missing comparison files stay visible as missing.</p>
      ${renderComparisons(bundle, linkBase)}
    </section>
    <section class="panel">
      <h2>Regenerate evidence</h2>
      <ul>${bundle.regenerationCommands.map((command) => `<li><code>${escapeHtml(command)}</code></li>`).join('')}</ul>
    </section>
    ${bundle.index.versions.map((entry) => renderVersionSection(entry, linkBase)).join('\n')}
  </main>
</body>
</html>`;
};
