# Control Room Web Shell

PHASE-26A adds a local, read-only browser surface for inspecting the control-room timeline and role catalog together. It is a generated static HTML page, not a command runner and not a source of truth.

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

## What It Reads

The shell consumes:

- Timeline artifacts from `runs/control-room/timeline/`.
- Timeline loading and missing-evidence labeling from `src/control-room/timeline/`.
- Role, persona, prompt-visibility, and model metadata from `src/control-room/roles/`.

The page header shows the session id, active base version, runs root, event count, and read-only status. Version sections group timeline messages by version and show event counts, evidence-link counts, and missing-evidence counts.

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

The browser page does not execute commands, mutate artifacts, capture human comments, select branches, launch local servers, or change game/harness behavior. Existing terminal human-play, dashboard, static-demo, and harness workflows remain separate.
