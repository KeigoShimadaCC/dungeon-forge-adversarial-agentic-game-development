import type {
  ControlRoomWebShellEvent,
  ControlRoomWebShellEvidenceLink,
  ControlRoomWebShellVersionSection,
  ControlRoomWebShellViewModel,
} from './index.js';

const escapeHtml = (value: string | number | boolean | null | undefined): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const evidenceLink = (evidence: ControlRoomWebShellEvidenceLink): string => {
  const label = escapeHtml(evidence.label);
  const path = escapeHtml(evidence.relativePath);
  if (!evidence.present) {
    return `<li><span class="evidence-kind">${escapeHtml(evidence.kind)}</span> <span class="missing">${label} (missing)</span><code>${path}</code>${evidence.missingReason ? `<p>${escapeHtml(evidence.missingReason)}</p>` : ''}</li>`;
  }
  return `<li><span class="evidence-kind">${escapeHtml(evidence.kind)}</span> <a href="${escapeHtml(evidence.href)}">${label}</a><code>${path}</code></li>`;
};

const missingEvidenceList = (event: ControlRoomWebShellEvent): string => {
  if (event.missingEvidence.length === 0) {
    return '';
  }
  return `<ul class="missing-list">${event.missingEvidence
    .map((entry) => `<li>${escapeHtml(entry)}</li>`)
    .join('')}</ul>`;
};

const renderEvent = (event: ControlRoomWebShellEvent): string => {
  const evidence =
    event.evidence.length > 0
      ? `<details><summary>Evidence links (${event.evidence.length})</summary><ul>${event.evidence.map(evidenceLink).join('')}</ul></details>`
      : '<p class="muted">No raw evidence links recorded for this timeline event.</p>';
  const missingLabel =
    event.isHumanFeedback
      ? '<span class="badge badge-human">human feedback</span>'
      : event.missingEvidence.length > 0
      ? `<span class="badge badge-missing">${event.missingEvidence.length} missing</span>`
      : '<span class="badge badge-present">evidence ok</span>';

  return `<article class="message role-${escapeHtml(event.roleId)}" id="event-${escapeHtml(event.id)}">
    <div class="message-meta">
      <span class="actor">${escapeHtml(event.actorLabel)}</span>
      <span>${escapeHtml(event.type)}</span>
      <time datetime="${escapeHtml(event.timestamp)}">${escapeHtml(event.timestamp)}</time>
      ${missingLabel}
    </div>
    <p>${escapeHtml(event.summary)}</p>
    ${missingEvidenceList(event)}
    ${evidence}
  </article>`;
};

const renderVersion = (version: ControlRoomWebShellVersionSection): string =>
  `<section class="version" id="version-${escapeHtml(version.versionId)}">
    <div class="section-heading">
      <h2>${escapeHtml(version.versionId)}</h2>
      <div class="summary-strip">
        ${version.isActiveBase ? '<span><strong>Active base</strong></span>' : ''}
        ${version.isLatestKnown ? '<span><strong>Latest known</strong></span>' : ''}
        ${version.isHistoricalAfterActiveBase ? '<span>Historical after active base</span>' : ''}
        <span>Events: <strong>${version.eventCount}</strong></span>
        <span>Evidence links: <strong>${version.evidenceCount}</strong></span>
        <span>Missing: <strong>${version.missingEvidenceCount}</strong></span>
      </div>
    </div>
    <p class="version-summary">${escapeHtml(version.summary)}</p>
    <div class="feed">${version.events.map(renderEvent).join('\n')}</div>
  </section>`;

const renderHumanCaptureControls = (viewModel: ControlRoomWebShellViewModel): string =>
  `<section class="panel capture-panel" aria-labelledby="human-capture-heading">
    <div class="section-heading">
      <h2 id="human-capture-heading">Human Input</h2>
      <div class="summary-strip">
        <span>Initial idea: <strong>${viewModel.humanFeedback.initialIdea ? 'captured' : 'none'}</strong></span>
        <span>Comments: <strong>${viewModel.humanFeedback.comments.length}</strong></span>
      </div>
    </div>
    <div class="capture-grid">
      <form class="capture-form" data-capture-kind="initial-idea">
        <label for="initial-game-idea">Initial game idea</label>
        <textarea id="initial-game-idea" name="idea" maxlength="4000">${escapeHtml(viewModel.humanFeedback.initialIdea?.text ?? '')}</textarea>
        <output class="diagnostic" name="idea-diagnostic">Use the local capture command to persist plain text into the timeline artifact.</output>
      </form>
      <form class="capture-form" data-capture-kind="version-comment">
        <label for="target-version">Target version</label>
        <select id="target-version" name="targetVersion">
          <option value="">Session</option>
          ${viewModel.versions
            .map((version) => `<option value="${escapeHtml(version.versionId)}">${escapeHtml(version.versionId)}</option>`)
            .join('')}
        </select>
        <label for="human-comment">Human comment</label>
        <textarea id="human-comment" name="comment" maxlength="4000"></textarea>
        <output class="diagnostic" name="comment-diagnostic">Empty or oversized text is rejected before timeline writes.</output>
      </form>
    </div>
  </section>`;

const renderPrompt = (roleId: string, label: string, content: string): string =>
  `<li><strong>${escapeHtml(label)}</strong><span>${escapeHtml(content)}</span><code>${escapeHtml(roleId)}</code></li>`;

const renderRoles = (viewModel: ControlRoomWebShellViewModel): string =>
  `<section class="panel">
    <h2>Roles, Personas, And Models</h2>
    <p class="muted">Read-only catalog metadata. Provider calls are disabled here.</p>
    <div class="role-grid">
      ${viewModel.roles
        .map((role) => `<article class="role-card">
          <h3>${escapeHtml(role.displayName)}</h3>
          <p>${escapeHtml(role.shortDescription)}</p>
          <ul class="compact">
            <li><strong>Role kind</strong><span>${escapeHtml(role.roleKind)}</span></li>
            <li><strong>Default persona</strong><span>${escapeHtml(role.defaultPersonaId ?? 'none')}</span></li>
            <li><strong>Prompt reference</strong><span>${escapeHtml(role.defaultPromptReference ?? 'none')}</span></li>
          </ul>
          <details>
            <summary>Personas (${role.personas.length})</summary>
            ${
              role.personas.length === 0
                ? '<p class="muted">No selectable personas for this role.</p>'
                : `<ul>${role.personas.map((persona) => renderPrompt(persona.id, persona.displayName, persona.description)).join('')}</ul>`
            }
          </details>
          <details>
            <summary>Prompt visibility (${role.prompts.length})</summary>
            <ul>${role.prompts
              .map((prompt) =>
                renderPrompt(
                  prompt.level,
                  prompt.label,
                  `${prompt.description} Sources: ${prompt.sourceReferences
                    .map((source) => source.path ?? source.kind)
                    .join(', ')}`,
                ),
              )
              .join('')}</ul>
          </details>
          <details>
            <summary>Model choices (${role.modelChoices.length})</summary>
            <ul>${role.modelChoices
              .map((choice) =>
                renderPrompt(
                  choice.providerKind,
                  choice.displayName,
                  `${choice.modelLabel}; advisoryOnly=${choice.advisoryOnly}; providerCallEnabled=${choice.providerCallEnabled}`,
                ),
              )
              .join('')}</ul>
          </details>
        </article>`)
        .join('\n')}
    </div>
  </section>`;

export const renderControlRoomWebShellHtml = (
  viewModel: ControlRoomWebShellViewModel,
): string => {
  const emptyTimeline =
    viewModel.versions.length === 0 && viewModel.unversionedEvents.length === 0
      ? '<section class="panel"><h2>Version timeline</h2><p class="missing">No timeline events found.</p></section>'
      : '';
  const unversioned =
    viewModel.unversionedEvents.length > 0
      ? `<section class="panel"><h2>Session Notes</h2><div class="feed">${viewModel.unversionedEvents.map(renderEvent).join('\n')}</div></section>`
      : '';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dungeon Forge Control Room</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #17202a;
      --muted: #5f6b7a;
      --line: #d1d9e0;
      --accent: #1d4ed8;
      --ok: #0f7b45;
      --warn: #9a5b00;
      --bad: #b42318;
      --developer: #dbeafe;
      --reviewer: #dcfce7;
      --human: #fff7ed;
      --narrator: #f1f5f9;
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
    h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0; }
    h2 { margin: 0 0 10px; font-size: 20px; letter-spacing: 0; }
    h3 { margin: 0 0 8px; font-size: 15px; letter-spacing: 0; }
    p { margin: 8px 0; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code {
      display: inline-block;
      margin-left: 8px;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .panel, .version {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
      margin: 0 0 16px;
    }
    .session-strip, .summary-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      color: var(--muted);
      font-size: 13px;
    }
    .session-strip span, .summary-strip span {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 9px;
      background: #fff;
    }
    .section-heading {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 14px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .feed { display: grid; gap: 12px; }
    .message {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: var(--narrator);
    }
    .role-game_developer { background: var(--developer); }
    .role-game_reviewer { background: var(--reviewer); }
    .role-human { background: var(--human); }
    .message-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      color: var(--muted);
      font-size: 12px;
    }
    .actor { color: var(--text); font-weight: 700; }
    .badge {
      border-radius: 999px;
      padding: 2px 8px;
      font-weight: 700;
    }
    .badge-present { background: #e7f6ed; color: var(--ok); }
    .badge-human { background: #ffedd5; color: #8a3f00; }
    .badge-missing, .missing { color: var(--bad); }
    .badge-missing { background: #fee4e2; }
    .muted { color: var(--muted); }
    details {
      border-top: 1px solid rgba(0,0,0,0.08);
      margin-top: 10px;
      padding-top: 8px;
    }
    summary { cursor: pointer; font-weight: 700; }
    ul { margin: 8px 0 0 18px; padding: 0; }
    li { margin: 6px 0; }
    .evidence-kind {
      display: inline-block;
      min-width: 110px;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
    }
    .role-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 12px;
    }
    .capture-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
    }
    .capture-form {
      display: grid;
      gap: 8px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fbfcfd;
    }
    label { font-weight: 700; }
    textarea, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px;
      font: inherit;
      color: var(--text);
      background: #fff;
    }
    textarea {
      min-height: 92px;
      resize: vertical;
    }
    .diagnostic {
      color: var(--muted);
      font-size: 12px;
    }
    .role-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fbfcfd;
    }
    .compact {
      list-style: none;
      margin-left: 0;
    }
    .compact li {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      border-top: 1px solid var(--line);
      padding-top: 6px;
    }
    @media (max-width: 720px) {
      header, main { width: min(100vw - 20px, 1180px); }
      .section-heading { display: block; }
      .compact li { display: block; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Dungeon Forge Control Room</h1>
    <div class="session-strip">
      <span>Session: <strong>${escapeHtml(viewModel.session.sessionId)}</strong></span>
      <span>Active base: <strong>${escapeHtml(viewModel.session.activeBaseVersion ?? 'none')}</strong></span>
      <span>Latest known: <strong>${escapeHtml(viewModel.session.latestKnownVersion ?? 'none')}</strong></span>
      <span>Historical after base: <strong>${viewModel.session.historicalVersionsAfterActiveBase.length}</strong></span>
      <span>Runs root: <strong>${escapeHtml(viewModel.session.runsRoot)}</strong></span>
      <span>Events: <strong>${viewModel.session.eventCount}</strong></span>
      <span>Read-only: <strong>${viewModel.readOnly}</strong></span>
    </div>
    ${viewModel.session.initialGameIdea ? `<p>${escapeHtml(viewModel.session.initialGameIdea)}</p>` : ''}
  </header>
  <main>
    ${emptyTimeline}
    ${renderHumanCaptureControls(viewModel)}
    <section class="panel capture-panel" aria-labelledby="base-selection-heading">
      <div class="section-heading">
        <h2 id="base-selection-heading">Base Version Selection</h2>
        <div class="summary-strip">
          <span>Active base: <strong>${escapeHtml(viewModel.session.activeBaseVersion ?? 'none')}</strong></span>
          <span>Latest known: <strong>${escapeHtml(viewModel.session.latestKnownVersion ?? 'none')}</strong></span>
        </div>
      </div>
      <form class="capture-form" data-capture-kind="base-version">
        <label for="active-base-version">Active base version</label>
        <select id="active-base-version" name="baseVersion">
          ${viewModel.versions
            .map((version) => `<option value="${escapeHtml(version.versionId)}"${version.isActiveBase ? ' selected' : ''}>${escapeHtml(version.versionId)}${version.isLatestKnown ? ' - latest known' : ''}${version.isHistoricalAfterActiveBase ? ' - historical after base' : ''}</option>`)
            .join('')}
        </select>
        <output class="diagnostic" name="base-version-diagnostic">Use the local selection command to persist the active-base pointer; later versions stay visible as historical evidence.</output>
      </form>
    </section>
    ${unversioned}
    <section class="panel">
      <h2>Version timeline</h2>
      <p class="muted">Chronological local evidence view. Links open source artifacts; this page does not execute commands.</p>
    </section>
    ${viewModel.versions.map(renderVersion).join('\n')}
    ${renderRoles(viewModel)}
  </main>
</body>
</html>`;

  return html
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
};
