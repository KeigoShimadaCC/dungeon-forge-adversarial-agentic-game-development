# PHASE-16C - Scenario Content Packs

## Purpose

Support bounded scenario/content packs for finite events, NPCs, items, enemies, and floor rules.

## Source Context

Derived from content-data foundations in `PHASE-02C`, finite narrative work in `PHASE-10A`, and long-term extension guidance in `01_NORTH_STAR_AND_VISION.md`.

## Target Outcome

The game can load and validate small local content packs without creating an unbounded plugin system or runtime LLM content generation.

## In Scope

- Local scenario pack manifest.
- Schema validation for content references.
- Pack selection through config or harness options.
- Tests for valid, invalid, and conflicting pack data.

## Out Of Scope

- Marketplace/plugin framework.
- Database-backed content editor.
- Arbitrary LLM-generated story during play.
- Remote content downloads.

## Technical Spec

Dependencies: all `PHASE-15*` phases.

Scenario packs should remain static local files. Content must be validated before play starts, and selected pack metadata must be saved into run evidence.

## Deliverables

- Scenario pack manifest format.
- Loader and validator.
- Example local content pack.
- Tests for validation, determinism, and artifact metadata.

## Tests And Validation

- Valid pack loads and affects a deterministic run.
- Invalid references fail with clear diagnostics.
- Selected pack appears in traces and scorecards.
- Default content remains playable without packs.

## Acceptance Criteria

- Content variety can expand without code edits for every small addition.
- Invalid content cannot produce undefined runtime behavior.
- Gameplay remains finite and inspectable.

## AI Coder Handoff Notes

Keep this as local content packaging. Do not build a general plugin platform here.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
