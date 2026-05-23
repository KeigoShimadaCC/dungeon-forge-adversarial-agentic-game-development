# PHASE-27B - Narrated Version Summaries

## Purpose

Add narrator-style version summaries so the control room reads like a high-level log of what changed and what the reviewer found.

## Source Context

Derived from `PHASE-26B-HUMAN-IDEA-AND-FEEDBACK-CAPTURE`, existing version summaries, reviewer reports, scorecards, changelogs, comparisons, and the user request that the frontend look like two AIs discussing the game when the human does not type anything.

## Target Outcome

Each version can show concise, human-friendly narration for developer changes, reviewer critique, evidence status, and likely next focus, while preserving links to full artifacts.

## In Scope

- Narrator summary artifact or derived view.
- Deterministic fallback summaries when no LLM credentials are available.
- Optional provider-backed summary path only if already supported safely by existing LLM configuration.
- Separate labels for developer summary, reviewer summary, narrator summary, and human comment.
- Evidence-grounded summary rules that avoid fabricating changes.

## Out Of Scope

- Replacing full reviewer reports.
- Making acceptance decisions.
- Inventing claims from unavailable evidence.
- Running developer or reviewer agents.
- Requiring LLM credentials for basic frontend use.

## Technical Spec

Dependencies: `PHASE-26B`.

Build summary generation from existing artifacts first: version summary JSON, changelog, developer notes, review reports, scorecards, comparisons, and acceptance files. The narrator must cite or link the source artifacts used by each summary.

If a real LLM summarizer is added, it must be optional and must use the existing provider configuration rules. The credential-free fallback must remain the default testable path.

Summaries should be compact enough for a chat timeline:

- What changed.
- What the reviewer found.
- What evidence supports the claim.
- What is likely next or blocked.

For automation parallelism, keep shared-shell wiring out of this phase. It may provide self-contained narration renderers, view models, or components under the narration-specific boundary, but later dependent phases should import them into the main control-room shell.

## Deliverables

- Narrator summary builder.
- Self-contained narration render model or component for future timeline UI integration.
- Fallback deterministic summary behavior.
- Tests covering evidence-backed summaries and missing evidence.
- Documentation for narrator limits.

## Tests And Validation

- Tests verify summaries are generated from available artifacts.
- Tests verify missing artifacts are labeled and not hallucinated.
- Tests verify developer, reviewer, narrator, and human messages remain distinguishable.
- Tests verify credential-free fallback works.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `git diff --check`

## Acceptance Criteria

- A human can skim each version without opening raw artifacts.
- Every narrator claim is traceable to an artifact or marked as unavailable.
- The control room remains usable with no LLM API key.
- Full reviewer/developer evidence remains available for deeper inspection.

## AI Coder Handoff Notes

Prefer boring, truthful summaries over polished but unsupported prose. The narrator is a presentation layer, not an authority over the evidence. Keep files in the narration-specific control-room boundary so `PHASE-27A` can run in parallel.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
