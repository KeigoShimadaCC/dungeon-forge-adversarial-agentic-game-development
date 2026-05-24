# Control Room Timeline Artifacts

PHASE-25A adds a local artifact layer for future control-room UI work. It is a data boundary only: no browser UI, command runner, LLM call, game-engine behavior, harness behavior, rollback, deletion, or branching timeline is introduced here.

## Storage Boundary

Timeline artifacts live under:

```text
runs/control-room/timeline/
```

The timeline source module lives under:

```text
src/control-room/timeline/
```

This keeps the PHASE-25A timeline contract separate from PHASE-25B role/persona metadata and later UI wiring. Consumers should import the timeline module directly until a later integration phase adds shared control-room exports.

## Artifact Shape

A timeline JSON artifact includes:

- `schemaVersion`: currently `1`.
- `sessionId`: stable local session identifier.
- `createdAt` and `updatedAt`: explicit timestamps supplied by the caller.
- `runsRoot`: the local evidence root label, normally `runs`.
- `initialGameIdea`: optional human-authored seed idea.
- `activeBaseVersion`: optional non-destructive base-version pointer, such as `v002`.
- `events`: ordered timeline events.

Supported event types are:

- `human_idea`
- `developer_summary`
- `reviewer_summary`
- `human_comment`
- `version_selected_as_base`
- `prepared_next_step`

Each event records a stable `id`, timestamp, actor label, source classification, optional version id, summary text, evidence references, and missing-evidence notes.

## Source Semantics

Timeline events distinguish authorship from evidence:

- `human`: human ideas, comments, and base-version selections.
- `developer_ai`: summaries of developer-agent work.
- `reviewer_ai`: summaries of reviewer-agent findings.
- `system`: orchestrator/preparation metadata.

Human comments are stored as human input. They are not treated as reviewer trace evidence.

## Evidence References

Evidence references are repo-relative paths under `runs/`, for example:

```text
runs/v001/traces/seed_001_careful_player.json
runs/v001/reviews/seed_001_careful_player.json
runs/v001/scorecards/seed_001_careful_player.json
runs/v002/changelog.md
runs/comparisons/v001_vs_v002.json
```

The loader validates evidence paths so they stay under `runs/` and do not contain `..` segments. It only checks whether referenced files exist. It does not infer, summarize, or fabricate missing traces, reviews, scorecards, summaries, comparisons, acceptance notes, or developer notes.

When optional evidence is absent, the loaded event records:

```json
{
  "present": false,
  "missingReason": "Missing on disk: runs/v003/reviews/missing_optional_review.json"
}
```

The event also carries a sorted `missingEvidence` note such as:

```text
review: runs/v003/reviews/missing_optional_review.json
```

## Determinism

`stringifyControlRoomTimeline` sorts events by `timestamp` then `id`, and uses the repo deterministic JSON serializer. This keeps equivalent input stable even if callers provide events in a different order.

`projectControlRoomTimeline` returns a high-level render model for future UI work. It exposes event summaries, evidence refs, and missing-evidence counts so a UI can render the human-facing `v001 -> v002 -> v003` history without parsing raw version evidence directly.

## Active Base Selection

PHASE-28A treats "go back to v005" as pointer selection, not rollback. `selectControlRoomBaseVersion` only accepts a known `v001`-style version already present in timeline evidence. On success it:

- updates `activeBaseVersion`,
- updates `updatedAt`,
- appends a new `version_selected_as_base` event, and
- preserves every later event and evidence reference.

Unknown versions are rejected and the timeline is left unchanged. The projection also exposes `latestKnownVersion`, `knownVersions`, and `historicalVersionsAfterActiveBase` so consumers can label the active base separately from later historical versions.

This feature does not delete, hide, rewrite, reset git history, create branches, or move files. Later versions remain inspectable evidence.

## Sample Artifact

The committed sample is:

```text
runs/control-room/timeline/v001-v002-v003.timeline.json
```

It shows:

- an initial human idea,
- a `v001` developer summary,
- a `v001` reviewer summary,
- a `v002` human comment,
- a non-destructive `v002` base-version selection,
- a `v003` reviewer summary with one missing optional review labeled honestly,
- a prepared next step linked to `v003` acceptance notes,
- a later non-destructive `v001` base-version selection that keeps `v002` and `v003` visible as historical evidence.
