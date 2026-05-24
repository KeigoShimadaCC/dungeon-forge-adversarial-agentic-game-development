# PHASE-29A - Restricted API Coding Agent Architecture And Schemas

## Purpose

Define the architecture, schemas, and invariants for a minimal API-based restricted coding agent that can propose structured actions but cannot directly edit files, run shell commands, use git, or decide merge authority.

## Source Context

Derived from `PHASE-15A` structured patch proposals, `PHASE-16D` deterministic JSON patching, `PHASE-20A` through `PHASE-22A` autopilot safety work, `docs/PATCH-PROPOSALS.md`, `docs/JSON-PATCHING.md`, `automation/README.md`, `automation/autopilot-config.json`, existing LLM provider configuration, and the requirement that the local harness remains the trusted policy authority.

## Target Outcome

The repo has a documented restricted-agent contract and TypeScript schema/types for agent requests, responses, patch intents, command requests, and evidence records. The model is explicitly untrusted and can only emit JSON intent.

## In Scope

- Restricted agent architecture document.
- Request/response schema and TypeScript types.
- Fixed action set: `search_allowed`, `read_file_range`, `propose_patch`, `request_check`, and `explain_blocker`.
- Patch-intent schema for later deterministic validation.
- Command registry schema using command IDs, not raw shell.
- Evidence schema for model input/output, decisions, blockers, and validation status.
- Schema validation tests for invalid actions, unknown command IDs, and forbidden operation shapes.

## Out Of Scope

- Real LLM/API calls.
- Reading repository files for model context.
- Applying patches.
- Running checks.
- Autopilot integration.
- Cursor/Codex/Claude Code replacement behavior.
- Direct filesystem, git, PR, merge, package-install, dependency, or shell authority for the model.

## Technical Spec

Dependencies: `PHASE-28B`.

Add a small restricted-agent module under `src/harness/restricted-agent/**`. The schema must make the security boundary explicit:

- The model receives bounded turn input from the harness.
- The model returns one strict JSON response.
- The harness validates the response before any read, patch, or check behavior is considered.
- Raw shell command strings are not accepted.
- Git commands, package installs, dependency changes, lockfile changes, file deletion, file rename, generated evidence edits, and credential paths are not valid v1 operations.

The response schema should include `schemaVersion`, `phase`, `taskId`, `action`, `rationale`, optional `patches`, optional `requestedChecks`, and optional `blockers`. Action-specific validation must reject missing or incompatible fields.

Allowed paths for this phase:

- `src/harness/restricted-agent/**`
- `src/harness/index.ts`
- `tests/restricted-agent*.test.ts`
- `docs/RESTRICTED-API-CODING-AGENT.md`
- `phase-plans/**`
- `PROGRESS.MD`

## Deliverables

- `docs/RESTRICTED-API-CODING-AGENT.md`.
- Restricted-agent schema/types under `src/harness/restricted-agent/**`.
- Schema validation helpers.
- Focused tests for valid and invalid model responses.
- Export additions only if needed by existing harness patterns.

## Tests And Validation

- Focused restricted-agent schema tests.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `git diff --check`

## Acceptance Criteria

- JSON schema/types exist for restricted-agent turn input and model output.
- Invalid action names block.
- Unknown command IDs block at schema/registry validation boundary.
- Forbidden operation shapes block.
- Documentation explains why the model cannot directly edit files, run shell, use git, or merge.
- No real credentials or external LLM calls are required for tests.

## AI Coder Handoff Notes

Keep this as a contract phase. Do not implement patch application, check execution, or autopilot integration. The model is not trusted; the local deterministic harness is trusted.

