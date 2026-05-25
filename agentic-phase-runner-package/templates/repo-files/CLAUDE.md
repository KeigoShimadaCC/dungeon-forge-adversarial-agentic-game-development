# CLAUDE.md

## Project Workflow

This repo uses a phase-based agentic workflow.

Source of truth:

1. `concept-and-ideas/**`
2. `phase-plans/**`
3. active phase plan
4. `PROGRESS.md`
5. generated run evidence under `runs/**`

## Rules

- Implement only the active phase.
- Prefer small, verifiable changes.
- Run validation commands before claiming completion.
- Record evidence in `PROGRESS.md`.
- Do not treat agent output as proof without deterministic validation.
