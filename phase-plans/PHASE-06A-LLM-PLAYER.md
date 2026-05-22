# PHASE-06A - LLM Player

## Purpose

Allow an LLM reviewer/player agent to play the game through the harness by selecting from explicit available actions.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-06A-LLMPLAYER-BUILDING` and reviewer/player architecture in `02_STRUCTURE_AND_TECH_SPECS.md`.

## Target Outcome

An API-backed player wrapper can be plugged into the harness, while tests use mocked responses and gameplay remains runnable without credentials.

## In Scope

- LLM player client interface.
- Prompt/input shape containing render, available actions, recent log, and persona.
- JSON response parsing.
- Validation that `action_id` exists in available actions.
- Fallback behavior for malformed or invalid outputs.
- Trace capture of selected action and reason.

## Out Of Scope

- Reviewer critique generation.
- Letting the LLM edit files.
- Letting the LLM invent arbitrary gameplay actions.
- Making gameplay require API credentials.

## Technical Spec

Dependencies: `PHASE-05A-HARNESS`.

LLM input shape should be similar to:

```json
{
  "render": "...",
  "available_actions": [],
  "recent_log": [],
  "persona": "careful_player"
}
```

Expected output:

```json
{
  "action_id": "move_east",
  "reason": "The east corridor is unexplored."
}
```

The wrapper must validate model JSON before use. On invalid JSON, missing action IDs, unavailable actions, or timeout, choose a deterministic safe fallback from available actions and record the failure in trace metadata.

Initial supported personas are:

- `careful_player`.
- `naive_player`.
- `bug_hunter`.

Persona is a prompt/input control only. It must not bypass available-action validation or give the model code/file access.

## Deliverables

- LLM player adapter/client boundary.
- Prompt template under `src/agents/prompts/**` if useful.
- Mock-based tests for valid and invalid responses.
- Trace fields for LLM reason and fallback metadata.

## Tests And Validation

- Valid mocked response selects the expected action.
- Invalid action is rejected and fallback is used.
- Malformed JSON is handled.
- Missing `action_id` is handled.
- Reason is saved into trace.
- Persona ID is saved into trace.
- Tests do not require real API credentials.

## Acceptance Criteria

- The LLM can only choose from available actions.
- Reviewer/player behavior cannot mutate game state directly.
- The harness can still run with baseline players when no API key is present.
- All initial personas use the same stable action protocol.

## AI Coder Handoff Notes

Keep the provider boundary thin. Validate all model output and make failure boring, deterministic, and visible in traces.
