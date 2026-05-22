# PHASE-19B - Content Governance

## Purpose

Add governance tooling for authored, generated, or extension-provided content before it enters gameplay.

## Source Context

Derived from content validation in `PHASE-02C`, scenario packs in `PHASE-16C`, extension packs in `PHASE-19A`, and forbidden feature rules in `PHASE-00A`.

## Target Outcome

Content changes can be linted, validated, explained, and rejected before they create untestable or forbidden gameplay.

## In Scope

- Content lint rules for required fields, references, finite bounds, and clear text descriptions.
- Forbidden-scope checks for infinite play, unstructured commands, required media, or external-service gameplay.
- Content diff summaries for review.
- Tests for governance failures.

## Out Of Scope

- Full content editor.
- Remote moderation service.
- LLM-generated content during gameplay.
- Automatic acceptance of generated content.

## Technical Spec

Dependencies: all `PHASE-18*` phases.

Governance should run before content is used by the engine or harness. Reports should be local artifacts or command output suitable for phase validation.

## Deliverables

- Content governance command or validator module.
- Rule set documentation.
- Content diff summary format.
- Tests for invalid, forbidden, and warning-only content.

## Tests And Validation

- Missing references fail validation.
- Infinite or no-ending content settings are rejected.
- Required media dependencies are rejected.
- Valid content passes without warnings or with documented warnings.

## Acceptance Criteria

- Content can be reviewed before it affects playthroughs.
- Governance findings are concrete and actionable.
- The game remains finite, seedable, and text/ASCII playable.

## AI Coder Handoff Notes

Use structured validation over ad hoc string checks when practical.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
