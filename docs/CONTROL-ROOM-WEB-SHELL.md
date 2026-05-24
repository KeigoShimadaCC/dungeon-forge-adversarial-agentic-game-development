# Control Room Web Shell

PHASE-26A added a local browser surface for inspecting the control-room timeline and role catalog together. PHASE-26B adds local human idea/comment capture through the control-room timeline helpers and CLI. The generated HTML page is still not a command runner and not a source of truth; timeline JSON remains the durable artifact.

## Generate Or Open

Generate the fixture shell:

```bash
pnpm run control-room-web-shell -- --timeline runs/control-room/timeline/v001-v002-v003.timeline.json --out runs/control-room/web-shell/index.html
```

Open the resulting file in a browser:

```text
runs/control-room/web-shell/index.html
```

For smoke validation without writing HTML:

```bash
pnpm run control-room-web-shell -- --timeline runs/control-room/timeline/v001-v002-v003.timeline.json --json
```

Without `--out`, the CLI writes HTML to stdout. With `--out`, it writes only the derived viewer file and does not edit timeline, trace, review, scorecard, comparison, acceptance, summary, changelog, or developer-note artifacts.

## Capture Human Input

Add or replace the initial human game idea in the selected timeline artifact:

```bash
pnpm run control-room-web-shell -- --timeline runs/control-room/timeline/v001-v002-v003.timeline.json --capture-idea "Make a tiny dungeon loop that can improve through trace-backed review."
```

Add a per-version human comment:

```bash
pnpm run control-room-web-shell -- --timeline runs/control-room/timeline/v001-v002-v003.timeline.json --capture-comment "Keep the Smoke Bomb clarity improvement." --target-version v002
```

Capture writes are deliberately narrow:

- They load one artifact under `runs/control-room/timeline/`.
- They validate plain text before saving.
- They mutate only that timeline artifact.
- They do not run agents, Cursor, provider calls, gameplay commands, shell commands from the browser, or build hooks.

Human feedback text normalizes line endings to `\n` and trims only outer whitespace. Empty text is rejected. Text longer than 4000 characters is rejected. Invalid input returns a diagnostic and leaves the timeline file unchanged.

## What It Reads

The shell consumes:

- Timeline artifacts from `runs/control-room/timeline/`.
- Timeline loading and missing-evidence labeling from `src/control-room/timeline/`.
- Role, persona, prompt-visibility, and model metadata from `src/control-room/roles/`.

The page header shows the session id, active base version, runs root, event count, and read-only status. Version sections group timeline messages by version and show event counts, evidence-link counts, and missing-evidence counts.

The page also renders local human input controls for an initial idea and a version-targeted comment. These controls are inert in the static HTML output: they are visible capture affordances and diagnostics, but persistence is performed by the timeline-only CLI path above.

## Evidence Links

Evidence links stay repo-relative and point back to source artifacts under `runs/`, such as traces, reviews, scorecards, changelogs, developer notes, comparisons, acceptance notes, version summaries, and balance summaries.

Unsafe href values such as absolute paths, protocol URLs, `javascript:`, and `..` segments are blocked with `#blocked-artifact-link`. Missing evidence is labeled as missing instead of fabricated or summarized away.

## Roles And Models

The role panel renders the PHASE-25B catalog:

- `Human`
- `Game Developer`
- `Game Reviewer`
- `Narrator`

Persona entries, prompt references, and model choices are displayed as metadata. The shell does not resolve credentials, read secret env vars, call providers, launch agents, or run Cursor/Codex.

## Boundaries

The browser page does not execute commands, launch agents, select branches, launch local servers, call providers, or change game/harness behavior. Human-authored events are labeled with `source: "human"` and `actor: "human"` and are not reviewer trace evidence.

Prepared human feedback context is derived from timeline artifacts for later handoff logic:

- `initialIdea`: latest human idea text, timestamp, actor, source, selected base version, and optional target version.
- `comments`: human comment text, timestamp, actor, source, selected base version, and optional target version.

Existing terminal human-play, dashboard, static-demo, and harness workflows remain separate.
