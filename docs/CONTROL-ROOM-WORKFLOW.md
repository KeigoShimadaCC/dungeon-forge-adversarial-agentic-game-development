# Control Room Workflow

The control room is a local, read-only command center over existing artifacts. It helps a human inspect iteration history, choose metadata for a prepared handoff, and decide what to run next. It does not execute commands from the browser, launch agents, call providers, commit, open PRs, merge, or rewrite version history.

## Local Flow

1. Capture the human idea or comments into the timeline artifact with the control-room web-shell CLI.
2. Generate the web shell from the timeline artifact.
3. Inspect version summary cards, evidence links, missing-evidence labels, active base, latest known version, and historical versions after the selected base.
4. Review persona/model metadata in the prepared handoff panel. These choices are advisory metadata only.
5. Inspect prompt metadata from the role catalog. Runtime prompts, evidence JSON, environment variables, credentials, and assembled hidden prompts are not exposed.
6. Select an older base version only through the timeline helper. Later versions remain visible historical evidence.
7. Generate a prepared handoff and let the human/orchestrator decide whether to run any suggested command text.

## Commands

Generate the web shell:

```bash
pnpm run control-room-web-shell -- --timeline runs/control-room/timeline/v001-v002-v003.timeline.json --out runs/control-room/web-shell/index.html
```

Preview the web-shell projection as JSON:

```bash
pnpm run control-room-web-shell -- --timeline runs/control-room/timeline/v001-v002-v003.timeline.json --json
```

Generate prepared handoff artifacts with explicit reviewer metadata:

```bash
pnpm run build
node dist/src/control-room/handoffs/control-room-handoff-cli.js --timeline runs/control-room/timeline/v001-v002-v003.timeline.json --out runs/control-room/handoffs/v001-v002-v003.prepared-handoff.json --html runs/control-room/handoffs/v001-v002-v003.panel.html --reviewer-persona bug_hunter --reviewer-model configured_reviewer_model
```

## Safety Boundaries

- Persona/model choices do not run a reviewer or call an LLM provider.
- Prompt inspection shows safe catalog metadata and references, not assembled runtime prompts or secrets.
- Suggested commands are rendered as inert text.
- Browser HTML contains no scripts and no command-launch controls.
- Base selection is a timeline pointer event, not deletion, rollback, git reset, or branch creation.
