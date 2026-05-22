# PHASE-14B - Real LLM Runs

## Purpose

Add credential-gated real LLM player and reviewer runs while keeping default gameplay and validation credential-free.

## Source Context

Derived from `PHASE-06A-LLM-PLAYER`, `PHASE-06B-REVIEWER-CRITIC`, `PHASE-10B-BALANCE-TUNING`, and backlog items `F-06A-001`, `F-06A-002`, `F-06A-003`, `F-06A-004`, and `F-10B-002`.

## Target Outcome

The harness can optionally run real provider-backed reviewer/player personas with explicit credentials, validated JSON, fallback behavior, and saved evidence.

## In Scope

- Provider adapter boundary behind the existing LLM client interfaces.
- Documented environment variable names in `.env.example` if credentials are introduced.
- CLI support for selected real LLM persona runs.
- Strong validation of action `id` and `type`.
- Preservation of invalid model output diagnostics in trace metadata.

## Out Of Scope

- Making API credentials required for gameplay, tests, CI, or default balance runs.
- Open-ended LLM NPC or world generation during gameplay.
- Reviewer output directly mutating game state.
- Provider-specific dashboards or billing tools.

## Technical Spec

Dependencies: all `PHASE-13*` phases.

Real LLM runs must sit behind an explicit configuration switch. Default commands continue to use deterministic local policies or mocked clients. Provider output must be parsed and validated before choosing an available action.

## Deliverables

- Provider adapter and configuration docs.
- Optional CLI flags for real LLM play/review runs.
- Trace metadata for invalid or fallback model outputs.
- Tests using mocked provider responses.

## Tests And Validation

- Missing credentials produce a clear skip/blocker, not a crash.
- Valid provider-shaped output selects a valid action.
- Invalid JSON, invalid action ID, wrong action type, and timeout paths are recorded and fall back safely.
- Default tests and smoke runs pass without credentials.

## Acceptance Criteria

- Real LLM evidence can be generated intentionally when credentials are present.
- No required repo gate depends on external LLM services.
- Model output is never trusted without validation.

## AI Coder Handoff Notes

Do not commit secrets. If environment variables are added, document names only and keep `.env` ignored.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
