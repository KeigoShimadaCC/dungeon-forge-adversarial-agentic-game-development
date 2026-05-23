# PHASE-25B - Agent Roles Personas And Models

## Purpose

Define the AI role, persona, prompt-visibility, and model-choice metadata that the future control room will display before it can safely orchestrate anything.

## Source Context

Derived from `PHASE-06A-LLM-PLAYER`, `PHASE-06B-REVIEWER-CRITIC`, `PHASE-14B-REAL-LLM-RUNS`, `PHASE-14C-REVIEWER-PERSONA-REPORTING`, existing reviewer persona metadata, LLM provider configuration, and the user request to choose personas, inspect system prompts, and maybe choose AIs.

## Target Outcome

The repo exposes a safe local catalog of visible control-room actors: game developer, game reviewer, and narrator. The catalog can list personas, prompt text or prompt references where safe, and available model-choice metadata without exposing credentials or launching provider calls.

## In Scope

- Role catalog for `game_developer`, `game_reviewer`, and `narrator`.
- Reviewer persona metadata suitable for UI selection.
- Developer and narrator role descriptions suitable for human display.
- Prompt visibility metadata for safe prompt inspection.
- Model-choice metadata that can be used by later prepared handoffs.
- Tests for catalog shape, safe prompt display, and no-secret behavior.

## Out Of Scope

- Live LLM calls.
- Browser UI.
- Running developer or reviewer agents.
- Storing API keys, base URLs with credentials, or environment values in artifacts.
- Letting reviewer output mutate game state.
- Rewriting existing prompts unless needed to expose a safe reference.

## Technical Spec

Dependencies: `PHASE-24B`.

Add a small typed catalog that can be consumed by both CLI/tests and future UI. Role entries should include stable ID, display name, role kind, short human-facing description, default persona or prompt reference, and supported model-choice metadata.

Prompt inspection must be safe by default. If a prompt is stored in the repo and contains no secrets, the catalog may expose its text or a safe path. If a prompt is assembled dynamically, expose a concise description and source references rather than inventing text.

Model choices should be metadata only. They may name environment-driven defaults such as the current configured default model, but must not read or serialize secret environment variables.

For automation parallelism, keep implementation inside the `PHASE-25B` allowed paths. Do not add shared control-room barrel exports or timeline artifact wiring in this phase; later dependent phases should integrate the catalog.

## Deliverables

- Typed role/persona/model catalog helpers.
- Safe prompt-inspection metadata.
- Documentation for how the control room should interpret roles and model choices.
- Focused tests for catalog validity and secret-safe output.

## Tests And Validation

- Tests verify all required roles exist.
- Tests verify reviewer personas are selectable and stable.
- Tests verify prompt visibility excludes secrets and environment values.
- Tests verify model-choice metadata is advisory and does not require credentials.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `git diff --check`

## Acceptance Criteria

- A future UI can show who is speaking: game developer, game reviewer, narrator, or human.
- A human can inspect safe prompt/persona information before choosing a role.
- Model choices are represented without starting provider calls.
- Gameplay and harness commands remain credential-free by default.

## AI Coder Handoff Notes

Keep this as metadata, not orchestration. If prompt text is ambiguous or unsafe to display, expose a safe reference and diagnostic instead of copying hidden or environment-derived content. Keep files in the roles-specific control-room boundary so `PHASE-25A` can run in parallel.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
