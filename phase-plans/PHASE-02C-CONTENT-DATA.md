# PHASE-02C - Content Data

## Purpose

Create the first data-driven content layer so future phases can adjust items, enemies, and floor rules without editing core engine logic.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-02C-CONTENTDATA-BUILDING` and the content layout in `02_STRUCTURE_AND_TECH_SPECS.md`.

## Target Outcome

Initial JSON content files exist, load through typed helpers, and validate required fields.

## In Scope

- `content/items.json`.
- `content/enemies.json`.
- `content/floor-rules.json`.
- Initial Potion, Slime, and basic floor-rule records.
- Lightweight validation tests.

## Out Of Scope

- Large content catalogs.
- Dynamic LLM-generated content during gameplay.
- Complex schema frameworks unless already justified by the scaffold.
- Balance tuning beyond basic playable defaults.

## Technical Spec

Dependencies: `PHASE-01A-PROJECT-STRUCTURE`.

Content records should include stable IDs, display names, descriptions, and the minimal gameplay fields needed by later phases. Validation should fail clearly when required fields are missing or malformed.

Content loading must be local-file based and deterministic. Future engine code should refer to content by ID rather than duplicating constants throughout mechanics.

## Deliverables

- Initial content JSON files.
- Content loader/validator module if needed by tests.
- Tests that load and validate content.

## Tests And Validation

- Content files parse.
- Required fields exist.
- Invalid content fails validation in tests.
- Potion and Slime records are available to game logic.

## Acceptance Criteria

- Future phases can add content without changing the core contract.
- Static content is finite, versionable, and inspectable.
- No runtime external service is required to fetch gameplay content.

## AI Coder Handoff Notes

Keep validation lightweight but real. Do not overbuild an editor, database, CMS, or plugin system.
