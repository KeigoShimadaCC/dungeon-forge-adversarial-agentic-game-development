import type {
  ControlRoomHandoffPanelEvidenceLink,
  ControlRoomHandoffPanelModel,
  ControlRoomPreparedHandoffCommand,
  ControlRoomPreparedHandoffComment,
} from './types.js';

const escapeHtml = (value: string | number | boolean | null | undefined): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const renderComment = (comment: ControlRoomPreparedHandoffComment): string =>
  `<li><strong>${escapeHtml(comment.targetVersion ?? 'session')}</strong> <time datetime="${escapeHtml(comment.timestamp)}">${escapeHtml(comment.timestamp)}</time><p>${escapeHtml(comment.text)}</p></li>`;

const renderEvidence = (evidence: ControlRoomHandoffPanelEvidenceLink): string => {
  const status = evidence.present ? 'present' : 'missing';
  const label = evidence.present
    ? `<a href="${escapeHtml(evidence.href)}">${escapeHtml(evidence.label)}</a>`
    : `<span class="missing">${escapeHtml(evidence.label)}</span>`;
  return `<li class="${status}"><span>${escapeHtml(evidence.kind)}</span>${label}<code>${escapeHtml(evidence.relativePath)}</code>${evidence.missingReason ? `<p>${escapeHtml(evidence.missingReason)}</p>` : ''}</li>`;
};

const renderCommand = (command: ControlRoomPreparedHandoffCommand): string =>
  `<li><strong>${escapeHtml(command.label)}</strong><pre><code>${escapeHtml(command.command)}</code></pre><p>${escapeHtml(command.reason)}</p></li>`;

export const renderControlRoomHandoffPanelHtml = (
  model: ControlRoomHandoffPanelModel,
): string => {
  const handoff = model.handoff;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Prepared Control Room Handoff</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --panel: #ffffff;
      --text: #17202a;
      --muted: #5f6b7a;
      --line: #d1d9e0;
      --ok: #0f7b45;
      --warn: #9a5b00;
      --bad: #b42318;
      --accent: #1d4ed8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    header, main { width: min(1080px, calc(100vw - 32px)); margin: 0 auto; }
    header { padding: 24px 0 12px; }
    h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0; }
    h2 { margin: 0 0 10px; font-size: 19px; letter-spacing: 0; }
    p { margin: 8px 0; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
      margin: 0 0 16px;
    }
    .strip {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      color: var(--muted);
      font-size: 13px;
    }
    .strip span, .badge {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 9px;
      background: #fff;
    }
    .badge-ready { color: var(--ok); border-color: #8bd3ad; }
    .badge-blocked, .badge-missing_evidence, .badge-needs_human_decision {
      color: var(--bad);
      border-color: #f2a7a2;
    }
    ul { padding-left: 20px; }
    li { margin: 8px 0; }
    code, pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
    }
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px;
      background: #f8fafc;
    }
    .missing { color: var(--bad); font-weight: 700; }
    .muted { color: var(--muted); }
  </style>
</head>
<body>
  <header>
    <h1>Prepared Control Room Handoff</h1>
    <div class="strip">
      <span>Session: <strong>${escapeHtml(handoff.sessionId)}</strong></span>
      <span>Base: <strong>${escapeHtml(handoff.selectedBaseVersion ?? 'needs decision')}</strong></span>
      <span>Latest known: <strong>${escapeHtml(handoff.latestKnownVersion ?? 'none')}</strong></span>
      <span>Historical after base: <strong>${escapeHtml(handoff.historicalVersionsAfterSelectedBase.join(', ') || 'none')}</strong></span>
      <span class="badge badge-${escapeHtml(handoff.status)}">Status: <strong>${escapeHtml(handoff.status)}</strong></span>
      <span>Prepared: <strong>${escapeHtml(handoff.preparedAt)}</strong></span>
    </div>
  </header>
  <main>
    <section class="panel">
      <h2>Next Step</h2>
      <p>${escapeHtml(handoff.humanSummary)}</p>
      <p class="muted">Suggested commands are inert text. This panel does not execute commands, start agents, create commits, open PRs, merge branches, or call providers.</p>
    </section>
    <section class="panel">
      <h2>Human Context</h2>
      <p>${escapeHtml(handoff.humanIdea ?? 'No initial human idea recorded.')}</p>
      ${handoff.humanComments.length > 0 ? `<ul>${handoff.humanComments.map(renderComment).join('')}</ul>` : '<p class="muted">No human comments recorded.</p>'}
    </section>
    <section class="panel">
      <h2>Developer And Reviewer Context</h2>
      <p><strong>Developer:</strong> ${escapeHtml(handoff.developerContext ?? 'None recorded.')}</p>
      <p><strong>Reviewer:</strong> ${escapeHtml(handoff.reviewerSummary ?? 'None recorded.')}</p>
      <p><strong>Reviewer persona metadata:</strong> ${escapeHtml(handoff.reviewerSelection.personaLabel)} (${escapeHtml(handoff.reviewerSelection.personaId)})</p>
      <p><strong>Reviewer model metadata:</strong> ${escapeHtml(handoff.reviewerSelection.modelLabel)} (${escapeHtml(handoff.reviewerSelection.modelId)}; provider calls ${handoff.reviewerSelection.providerCallEnabled ? 'enabled' : 'disabled'})</p>
      <p><strong>Version:</strong> ${escapeHtml(handoff.versionSummary ?? 'No selected-base summary recorded.')}</p>
    </section>
    <section class="panel">
      <h2>Evidence</h2>
      ${handoff.evidence.length > 0 ? `<ul>${handoff.evidence.map(renderEvidence).join('')}</ul>` : '<p class="missing">No evidence references are recorded.</p>'}
    </section>
    <section class="panel">
      <h2>Blockers</h2>
      ${handoff.blockers.length > 0 ? `<ul>${handoff.blockers.map((blocker) => `<li class="missing">${escapeHtml(blocker)}</li>`).join('')}</ul>` : '<p>No blockers recorded.</p>'}
    </section>
    <section class="panel">
      <h2>Suggested Commands</h2>
      <ul>${handoff.suggestedCommands.map(renderCommand).join('')}</ul>
    </section>
    <section class="panel">
      <h2>Developer Task Text</h2>
      <pre><code>${escapeHtml(handoff.developerTaskText)}</code></pre>
    </section>
  </main>
</body>
</html>`;
};
