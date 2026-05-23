import type {
  DashboardArtifactRef,
  DashboardComparisonRef,
  DashboardIndex,
  DashboardLeaderboardEntry,
  DashboardVersionEntry,
} from './types.js';

export interface RenderDashboardHtmlOptions {
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
  label = relativePath,
  linkBase = '',
): string =>
  `<a href="${escapeHtml(artifactHref(relativePath, linkBase))}">${escapeHtml(label)}</a>`;

const optionalArtifactLink = (
  relativePath: string,
  present: boolean,
  label: string,
  linkBase: string,
): string =>
  present
    ? artifactLink(relativePath, label, linkBase)
    : `<span class="missing">${escapeHtml(label)}</span>`;

const formatNumber = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(2);

const renderLeaderboardRow = (
  entry: DashboardLeaderboardEntry,
  linkBase: string,
): string => {
  const comparisons =
    entry.comparisonPaths.length > 0
      ? entry.comparisonPaths.map((comparisonPath) => artifactLink(comparisonPath, 'comparison', linkBase)).join(' ')
      : '<span class="muted">none</span>';
  const scorecards =
    entry.scorecardPaths.length > 0
      ? entry.scorecardPaths.map((scorecardPath) => artifactLink(scorecardPath, 'scorecard', linkBase)).join(' ')
      : '<span class="muted">none</span>';

  return `<tr>
    <td>${entry.rank}</td>
    <td><a href="#version-${escapeHtml(entry.version)}">${escapeHtml(entry.version)}</a></td>
    <td>${formatNumber(entry.evidenceScore)}</td>
    <td>${Math.round(entry.winRate * 100)}%</td>
    <td>${entry.reviewedRunCount}</td>
    <td>${entry.averageReviewerFun === null ? '<span class="muted">n/a</span>' : formatNumber(entry.averageReviewerFun)}</td>
    <td>${entry.softlockCount}</td>
    <td>${entry.invalidActionCount}</td>
    <td><span class="status status-${escapeHtml(entry.acceptanceStatus)}">${escapeHtml(entry.acceptanceStatus)}</span></td>
    <td>${artifactLink(entry.summaryPath, 'summary', linkBase)} ${artifactLink(entry.acceptancePath, 'acceptance', linkBase)}</td>
    <td>${comparisons}</td>
    <td>${scorecards}</td>
  </tr>`;
};

const artifactStatus = (artifact: DashboardArtifactRef, linkBase: string): string => {
  const status = artifact.present ? 'present' : 'missing';
  return `<tr>
    <td>${escapeHtml(artifact.kind)}</td>
    <td>${optionalArtifactLink(artifact.relativePath, artifact.present, artifact.label, linkBase)}</td>
    <td><span class="${artifact.present ? 'present' : 'missing'}">${status}</span></td>
    <td><code>${escapeHtml(artifact.relativePath)}</code></td>
  </tr>`;
};

const renderRunRow = (entry: DashboardVersionEntry, linkBase: string): string =>
  entry.summary.runs
    .map((run) => `<tr>
      <td>${escapeHtml(run.seed)}</td>
      <td>${escapeHtml(run.persona)}</td>
      <td>${escapeHtml(run.player_kind)}</td>
      <td>${escapeHtml(run.result)}</td>
      <td>${run.turns}</td>
      <td>${run.metrics.floors_reached}</td>
      <td>${run.metrics.damage_taken}</td>
      <td>${run.metrics.items_used}</td>
      <td>${run.metrics.softlocks}</td>
      <td>${run.metrics.invalid_actions}</td>
      <td>${artifactLink(run.trace_path, 'trace', linkBase)}</td>
      <td>${run.review_path ? artifactLink(run.review_path, 'review', linkBase) : '<span class="muted">none</span>'}</td>
      <td>${artifactLink(run.scorecard_path, 'scorecard', linkBase)}</td>
    </tr>`)
    .join('\n');

const renderComparisonLinks = (
  comparisons: readonly DashboardComparisonRef[],
  linkBase: string,
): string => {
  if (comparisons.length === 0) {
    return '<p class="muted">No persisted comparisons reference this version.</p>';
  }
  return `<ul class="link-list">
    ${comparisons
      .map(
        (comparison) =>
          `<li>${escapeHtml(comparison.baseVersion)} vs ${escapeHtml(comparison.targetVersion)}: ${artifactLink(comparison.jsonPath, 'json', linkBase)} ${artifactLink(comparison.markdownPath, 'markdown', linkBase)}</li>`,
      )
      .join('\n')}
  </ul>`;
};

const renderVersionSection = (entry: DashboardVersionEntry, linkBase: string): string => {
  const coverage = entry.summary.artifact_coverage;
  return `<section class="version" id="version-${escapeHtml(entry.version)}">
    <div class="section-heading">
      <h2>${escapeHtml(entry.version)}</h2>
      <div class="summary-strip">
        <span>Status: <strong>${escapeHtml(entry.summary.status)}</strong></span>
        <span>Acceptance: <strong>${escapeHtml(entry.summary.acceptance_status)}</strong></span>
        <span>Runs: <strong>${entry.summary.runs.length}</strong></span>
        <span>Missing: <strong>${entry.missingArtifactCount}</strong></span>
      </div>
    </div>

    <h3>Artifact Coverage</h3>
    <table>
      <thead>
        <tr><th>Kind</th><th>Present</th><th>Expected</th><th>Missing</th></tr>
      </thead>
      <tbody>
        <tr><td>traces</td><td>${coverage.traces.present}</td><td>${coverage.traces.expected}</td><td>${coverage.traces.missing.length}</td></tr>
        <tr><td>reviews</td><td>${coverage.reviews.present}</td><td>${coverage.reviews.expected}</td><td>${coverage.reviews.missing.length}</td></tr>
        <tr><td>scorecards</td><td>${coverage.scorecards.present}</td><td>${coverage.scorecards.expected}</td><td>${coverage.scorecards.missing.length}</td></tr>
      </tbody>
    </table>

    <h3>Runs</h3>
    <table>
      <thead>
        <tr>
          <th>Seed</th><th>Persona</th><th>Player</th><th>Result</th><th>Turns</th>
          <th>Floors</th><th>Damage</th><th>Items</th><th>Softlocks</th><th>Invalid</th>
          <th>Trace</th><th>Review</th><th>Scorecard</th>
        </tr>
      </thead>
      <tbody>${renderRunRow(entry, linkBase)}</tbody>
    </table>

    <h3>Version Artifacts</h3>
    <table>
      <thead><tr><th>Kind</th><th>Artifact</th><th>Status</th><th>Path</th></tr></thead>
      <tbody>${entry.artifacts.map((artifact) => artifactStatus(artifact, linkBase)).join('\n')}</tbody>
    </table>

    <h3>Comparisons</h3>
    ${renderComparisonLinks(entry.comparisons, linkBase)}
  </section>`;
};

const renderComparisonTable = (index: DashboardIndex, linkBase: string): string => {
  if (index.comparisons.length === 0) {
    return '<p class="muted">No persisted comparison artifacts found.</p>';
  }
  return `<table>
    <thead><tr><th>Base</th><th>Target</th><th>JSON</th><th>Markdown</th></tr></thead>
    <tbody>
      ${index.comparisons
        .map(
          (comparison) => `<tr>
            <td>${escapeHtml(comparison.baseVersion)}</td>
            <td>${escapeHtml(comparison.targetVersion)}</td>
            <td>${artifactLink(comparison.jsonPath, comparison.jsonPath, linkBase)}</td>
            <td>${artifactLink(comparison.markdownPath, comparison.markdownPath, linkBase)}</td>
          </tr>`,
        )
        .join('\n')}
    </tbody>
  </table>`;
};

export const renderDashboardHtml = (
  index: DashboardIndex,
  options: RenderDashboardHtmlOptions = {},
): string => {
  const linkBase = options.linkBase ?? '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dungeon Forge Version Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --panel: #ffffff;
      --text: #17202a;
      --muted: #617080;
      --line: #cfd7df;
      --accent: #2563eb;
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
    header, main { width: min(1280px, calc(100vw - 32px)); margin: 0 auto; }
    header { padding: 24px 0 16px; }
    h1 { margin: 0 0 8px; font-size: 26px; font-weight: 700; }
    h2 { margin: 0; font-size: 22px; }
    h3 { margin: 24px 0 10px; font-size: 16px; }
    p { margin: 6px 0; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
      border: 1px solid var(--line);
      margin: 0 0 18px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
      font-size: 13px;
    }
    th { background: #eef2f6; font-weight: 650; }
    tr:last-child td { border-bottom: 0; }
    .meta, .muted { color: var(--muted); }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 18px;
    }
    .version {
      background: var(--panel);
      border-top: 3px solid var(--accent);
      padding: 18px;
      margin: 24px 0;
    }
    .section-heading {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .summary-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      color: var(--muted);
      font-size: 13px;
    }
    .status { font-weight: 650; }
    .status-accepted, .present { color: var(--ok); }
    .status-pending, .status-unknown, .status-blocked { color: var(--warn); }
    .status-rejected, .missing { color: var(--bad); }
    .link-list { margin: 0 0 18px 18px; padding: 0; }
    .link-list li { margin: 4px 0; }
    @media (max-width: 760px) {
      header, main { width: min(100vw - 20px, 1280px); }
      table { display: block; overflow-x: auto; }
      th, td { white-space: nowrap; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Dungeon Forge Version Dashboard</h1>
    <p class="meta">Generated: ${escapeHtml(index.generatedAt)} | Runs root: <code>${escapeHtml(index.runsRoot)}</code> | Read-only: ${String(index.readOnly)}</p>
  </header>
  <main>
    <section class="panel">
      <h2>Leaderboard</h2>
      <table>
        <thead>
          <tr>
            <th>Rank</th><th>Version</th><th>Score</th><th>Win rate</th><th>Reviewed</th>
            <th>Fun</th><th>Softlocks</th><th>Invalid</th><th>Acceptance</th>
            <th>Evidence</th><th>Comparisons</th><th>Scorecards</th>
          </tr>
        </thead>
        <tbody>${index.leaderboard.map((entry) => renderLeaderboardRow(entry, linkBase)).join('\n')}</tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Persisted Comparisons</h2>
      ${renderComparisonTable(index, linkBase)}
    </section>

    ${index.versions.map((entry) => renderVersionSection(entry, linkBase)).join('\n')}
  </main>
</body>
</html>
`;
};
