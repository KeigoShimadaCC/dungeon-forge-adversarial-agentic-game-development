# Control Room Narration

PHASE-27B adds deterministic narrator-style summaries for the control-room timeline. The default path is credential-free and reads only local timeline and evidence artifacts.

Narration is a presentation layer. It does not replace reviewer reports, make acceptance decisions, run developer or reviewer agents, call providers, execute commands, commit, open PRs, or merge.

## Sources

The narrator derives claims from supported fields in:

- `version_summary.json`
- `changelog.md`
- `developer_notes.md`
- reviewer JSON
- scorecard JSON
- comparison JSON
- acceptance markdown
- balance summary JSON
- control-room timeline events

Unsupported or unparsable files are marked as unavailable. Missing files are labeled as missing. The narrator should not invent claims from a filename or design intent alone.

## Roles

Narration artifacts keep messages distinguishable:

- `developer_summary`: developer-authored timeline summary and linked developer evidence.
- `reviewer_summary`: reviewer-authored timeline summary and linked review/scorecard evidence.
- `human_comment`: human idea or comment.
- `narrator_summary`: deterministic compact summary derived from local source artifacts.

## CLI

PHASE-27B does not add a package script because `package.json` is outside the phase scope. Use the built entrypoint:

```bash
pnpm run build
node dist/src/control-room/narration/control-room-narration-cli.js --timeline runs/control-room/timeline/v001-v002-v003.timeline.json --out runs/control-room/narration/v001-v002-v003.narration.json --html runs/control-room/narration/v001-v002-v003.narration.html --generated-at 2026-05-24T06:00:00.000Z
```

The command writes local narration JSON and inert HTML only. The HTML has no scripts, forms, provider controls, agent launch controls, or command execution hooks.

## Provider Boundary

No LLM API key is required. If a later phase adds an optional provider-backed summarizer, the deterministic fallback must remain available and testable, and provider output must stay secondary to traceable local artifacts.
