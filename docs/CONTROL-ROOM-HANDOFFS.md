# Control Room Prepared Handoffs

PHASE-27A adds a preparation layer for the control room. It reads local timeline evidence and produces a bounded next-step handoff for a human or orchestrator to review.

The handoff does not execute anything. Suggested commands are copyable text only, and the HTML panel is inert: no scripts, command-running forms, provider calls, branch operations, PR actions, or merge actions.

## Artifact Fields

- `status`: one of `ready`, `blocked`, `missing_evidence`, or `needs_human_decision`.
- `selectedBaseVersion`: the active base version selected in the timeline.
- `humanIdea`: the latest human-authored initial game idea or timeline initial idea.
- `humanComments`: relevant human-authored comments with actor, timestamp, and target version.
- `developerContext`: the most relevant developer summary for the selected base, falling back to the latest developer summary.
- `reviewerSummary`: the most relevant reviewer summary for the selected base, falling back to the latest reviewer summary.
- `evidence`: local evidence paths from developer, reviewer, human-comment, base-selection, and prepared-step events.
- `blockers`: missing summaries, missing base selection, or missing local evidence.
- `suggestedCommands`: local command text an orchestrator may choose to run later.
- `developerTaskText`: a concise prompt-style summary that can start the next coding session without guessing context.
- `timelineEvent`: a `prepared_next_step` event that records preparation and links the generated artifacts/evidence.

## Status Rules

`ready` means a selected base exists, developer/reviewer context exists, and every referenced evidence path is present locally.

`missing_evidence` means one or more evidence references are absent from disk. The handoff remains useful for diagnosis, but it is not ready.

`blocked` means required non-evidence context is absent.

`needs_human_decision` means no selected base version exists.

## Local Evidence Boundary

Handoff evidence paths must stay under `runs/`. Generated handoff JSON and panel HTML must stay under `runs/control-room/handoffs/`.

The panel links only to local artifact paths. Unsafe or escaping links are blocked by the render model.

## CLI

PHASE-27A does not add a package script because the accepted runner plan keeps `package.json` out of scope. Use the built entrypoint after `pnpm run build`:

```bash
node dist/src/control-room/handoffs/control-room-handoff-cli.js --timeline runs/control-room/timeline/v001-v002-v003.timeline.json --out runs/control-room/handoffs/v001-v002-v003.prepared-handoff.json --html runs/control-room/handoffs/v001-v002-v003.panel.html
```

This command only writes prepared handoff artifacts. It does not run the suggested commands or mutate the source timeline.
