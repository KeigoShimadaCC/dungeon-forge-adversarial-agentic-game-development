# PHASE-14C - Reviewer Persona Reporting

## Purpose

Improve reviewer persona configuration and human-readable review reports while preserving JSON as the contract artifact.

## Source Context

Derived from `PHASE-06B-REVIEWER-CRITIC`, reviewer personas in `PHASE-00A`, demo evidence requirements in `PHASE-12A`, and backlog item `F-06B-001`.

## Target Outcome

Reviewer outputs are easier to inspect across personas, with optional Markdown reports generated from validated JSON reviews and trace evidence.

## In Scope

- Persona configuration metadata.
- Markdown review rendering alongside JSON review artifacts.
- Evidence citations to trace turns, scorecard metrics, and notable events.
- Malformed or incomplete reviewer output diagnostics.

## Out Of Scope

- Replacing JSON review contracts with Markdown.
- Arbitrary free-form reviewer authority over game state.
- Browser dashboard rendering.
- Real provider integration beyond mocked or existing client interfaces.

## Technical Spec

Dependencies: all `PHASE-13*` phases.

Keep JSON review data as the machine-readable source of truth. Markdown should be generated from validated review data and should cite evidence from saved trace and scorecard artifacts.

## Deliverables

- Persona metadata format.
- Markdown review renderer.
- Tests for persona-specific reports and malformed-review handling.
- Documentation of JSON-vs-Markdown artifact roles.

## Tests And Validation

- Markdown review is generated from a valid JSON review.
- Report includes persona, result, top issues, recommendations, and evidence references.
- Malformed review data is rejected or reported without corrupting artifacts.
- Default reviewer tests continue to pass.

## Acceptance Criteria

- Human readers can scan reviewer findings without losing structured machine evidence.
- Persona differences are explicit in artifacts.
- JSON remains the authoritative review contract.

## AI Coder Handoff Notes

Avoid subjective report text that is not grounded in trace or scorecard evidence.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
