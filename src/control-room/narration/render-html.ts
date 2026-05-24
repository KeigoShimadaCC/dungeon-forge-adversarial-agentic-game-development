import type {
  ControlRoomNarrationRenderEvidenceLink,
  ControlRoomNarrationRenderMessage,
  ControlRoomNarrationRenderModel,
} from './types.js';

const escapeHtml = (value: string | number | boolean | null | undefined): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const renderEvidence = (source: ControlRoomNarrationRenderEvidenceLink): string => {
  const status = source.status === 'present' ? 'present' : 'unavailable';
  const link = source.status === 'present' && !source.relativePath.startsWith('timeline:')
    ? `<a href="${escapeHtml(source.href)}">${escapeHtml(source.label)}</a>`
    : `<span>${escapeHtml(source.label)}</span>`;
  return `<li class="${escapeHtml(status)}"><span>${escapeHtml(source.kind)}</span>${link}<code>${escapeHtml(source.relativePath)}</code>${source.missingReason ? `<p>${escapeHtml(source.missingReason)}</p>` : ''}</li>`;
};

const renderMessage = (message: ControlRoomNarrationRenderMessage): string =>
  `<article class="message ${escapeHtml(message.role)}">
    <header>
      <span class="role">${escapeHtml(message.label)}</span>
      <span>${escapeHtml(message.versionId ?? 'session')}</span>
      <time datetime="${escapeHtml(message.timestamp)}">${escapeHtml(message.timestamp)}</time>
    </header>
    <p>${escapeHtml(message.text)}</p>
    ${message.sourceArtifacts.length > 0 ? `<details><summary>Evidence</summary><ul>${message.sourceArtifacts.map(renderEvidence).join('')}</ul></details>` : '<p class="muted">No source artifacts.</p>'}
    ${message.unavailable.length > 0 ? `<ul class="missing">${message.unavailable.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
  </article>`;

export const renderControlRoomNarrationHtml = (
  model: ControlRoomNarrationRenderModel,
): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Control Room Narration</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #17202a;
      --muted: #5f6b7a;
      --line: #d5dce5;
      --accent: #176b87;
      --developer: #0f766e;
      --reviewer: #9a3412;
      --narrator: #334155;
      --human: #1d4ed8;
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
    header.page, main { width: min(1120px, calc(100vw - 32px)); margin: 0 auto; }
    header.page { padding: 24px 0 12px; }
    h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0; }
    h2 { margin: 22px 0 10px; font-size: 20px; letter-spacing: 0; }
    h3 { margin: 0; font-size: 17px; letter-spacing: 0; }
    p { margin: 8px 0; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .strip {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      color: var(--muted);
      font-size: 13px;
    }
    .strip span {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 9px;
      background: #fff;
    }
    .version {
      border-top: 1px solid var(--line);
      padding: 16px 0 4px;
    }
    .message {
      background: var(--panel);
      border: 1px solid var(--line);
      border-left: 5px solid var(--narrator);
      border-radius: 8px;
      padding: 14px;
      margin: 10px 0;
    }
    .developer_summary { border-left-color: var(--developer); }
    .reviewer_summary { border-left-color: var(--reviewer); }
    .human_comment { border-left-color: var(--human); }
    .message header {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      color: var(--muted);
      font-size: 13px;
    }
    .role {
      color: var(--text);
      font-weight: 700;
    }
    details {
      margin-top: 10px;
      border-top: 1px solid var(--line);
      padding-top: 8px;
    }
    ul { padding-left: 20px; }
    li { margin: 6px 0; }
    code {
      display: block;
      overflow-wrap: anywhere;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
    }
    .unavailable, .missing { color: var(--bad); }
    .muted { color: var(--muted); }
  </style>
</head>
<body>
  <header class="page">
    <h1>Control Room Narration</h1>
    <p>${escapeHtml(model.summary)}</p>
    <div class="strip">
      <span>Session: <strong>${escapeHtml(model.sessionId)}</strong></span>
      <span>Base: <strong>${escapeHtml(model.activeBaseVersion ?? 'none')}</strong></span>
      <span>Generated: <strong>${escapeHtml(model.generatedAt)}</strong></span>
      <span>Credential-free fallback: <strong>${escapeHtml(model.boundary.deterministicFallback)}</strong></span>
    </div>
  </header>
  <main>
    ${model.sessionMessages.length > 0 ? `<section><h2>Session</h2>${model.sessionMessages.map(renderMessage).join('')}</section>` : ''}
    ${model.versions.map((version) => `<section class="version"><h2>${escapeHtml(version.versionId)}</h2><p class="muted">Evidence status: ${escapeHtml(version.evidenceStatus)}. Likely next: ${escapeHtml(version.likelyNextFocus)}</p>${version.messages.map(renderMessage).join('')}</section>`).join('')}
  </main>
</body>
</html>`;
