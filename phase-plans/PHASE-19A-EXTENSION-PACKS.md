# PHASE-19A - Extension Packs

## Purpose

Define a bounded extension-pack model for local content, policies, personas, and scenarios.

## Source Context

Derived from long-term extension-system guidance in `01_NORTH_STAR_AND_VISION.md`, local content pack work in `PHASE-16C`, and forbidden MVP scope in `PHASE-00A`.

## Target Outcome

The project can load small local extension packs while preserving validation, finite gameplay, and harness compatibility.

## In Scope

- Extension manifest for content, baseline policies, reviewer personas, and scenario presets.
- Compatibility checks against engine and artifact schema versions.
- Local-only loading and validation.
- Tests for accepted and rejected extension packs.

## Out Of Scope

- Remote marketplace.
- Untrusted code execution.
- Runtime plugin sandbox.
- External-service gameplay dependency.

## Technical Spec

Dependencies: all `PHASE-18*` phases.

Extension packs should be declarative wherever possible. If policy extension code is allowed, it must be constrained by explicit interfaces and validation tests.

## Deliverables

- Extension pack manifest.
- Loader and validator.
- Example accepted and rejected packs.
- Documentation of compatibility and security limits.

## Tests And Validation

- Valid extension pack loads deterministically.
- Invalid manifest or forbidden capability is rejected.
- Extension metadata appears in run evidence.
- Default game works without extensions.

## Acceptance Criteria

- Extensions increase experimentation without weakening invariants.
- Invalid extensions cannot produce silent protocol breakage.
- Local artifact evidence records which extension was used.

## AI Coder Handoff Notes

Do not build a general-purpose plugin platform unless a later plan explicitly scopes sandboxing and security.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
