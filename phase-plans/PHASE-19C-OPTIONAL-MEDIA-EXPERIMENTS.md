# PHASE-19C - Optional Media Experiments

## Purpose

Plan optional visual or audio presentation experiments without making media required for gameplay or reviewer evaluation.

## Source Context

Derived from long-term visual/audio layer guidance in `01_NORTH_STAR_AND_VISION.md` and repeated MVP prohibitions on image-only or audio-required gameplay.

## Target Outcome

The project can experiment with optional presentation layers while preserving text/ASCII, structured-action, seedable, finite core gameplay.

## In Scope

- Optional generated or authored visual/audio presentation outside the core harness.
- Metadata linking optional media to versions or scenes.
- Fallback text/ASCII rendering for every state.
- Clear acceptance rules that media cannot be required for play or review.

## Out Of Scope

- Image-only gameplay.
- Required audio, voice, music, or generated media.
- Real-time animation-dependent mechanics.
- Replacing trace evidence with screenshots or videos.

## Technical Spec

Dependencies: all `PHASE-18*` phases.

Optional media must be additive and ignorable by the harness. Agent play and acceptance checks must be able to run without loading media assets.

## Deliverables

- Optional media metadata format.
- Fallback rules for missing media.
- Tests or checks proving headless gameplay does not require media.
- Documentation of allowed and forbidden media use.

## Tests And Validation

- Headless harness runs with no media files.
- Text/ASCII render remains complete.
- Optional media metadata references valid version or scene IDs.
- Acceptance report flags any required-media dependency as forbidden.

## Acceptance Criteria

- Media experiments cannot break agent-playable evaluation.
- Every claim about gameplay remains trace-backed.
- Core loop remains finite, turn-based, and structured-action based.

## AI Coder Handoff Notes

Treat media as presentation only. Do not add mechanics that depend on seeing or hearing an asset.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
