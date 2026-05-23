# PHASE-23A - North Star Gap Planning

## Purpose

Audit the implemented repository against the North Star and produce the next roadmap plans without changing gameplay or harness behavior.

## Source Context

Derived from `concept-and-ideas/`, `docs/NORTH_STAR.md`, the complete `phase-plans/PHASE-*.md` set through `PHASE-22A`, `automation/phase-graph.json`, `automation/phase-state.json`, `PROGRESS.MD`, README, package metadata, and the current source/test/artifact layout.

## Target Outcome

The repo has a durable gap audit and a queued sequence of next phases that refresh stale documentation, prove longitudinal improvement, harden validation, add browser play/replay inspection, and deepen gameplay evaluation.

## In Scope

- Audit all tracked `phase-plans/PHASE-*.md` files for the required 10-section schema.
- Compare concept documents and `docs/NORTH_STAR.md` against live repo capabilities.
- Identify stale scaffold-era docs and metadata.
- Rank roadmap gaps by value and dependency order.
- Add future phase plans for PHASE-23B, PHASE-23C, PHASE-23D, PHASE-24A, and PHASE-24B.
- Wire the new docs-only roadmap phases into automation graph/state/progress.

## Out Of Scope

- Implementing any future phase.
- Changing game engine, harness behavior, content, tests, generated evidence, or package scripts.
- Running real reviewer/developer agents.
- Adding browser UI, new validation behavior, or new evaluation metrics during this phase.

## Technical Spec

Dependencies: `PHASE-22A`.

Create `docs/NORTH_STAR_GAP_AUDIT.md` as the durable audit artifact. It must record:

- Phase-plan schema coverage.
- Automation graph/state coverage.
- Current implementation alignment with the North Star.
- Stale documentation and metadata.
- Ranked gaps and the phases that should address them.

Create future phase plans using the `PHASE-00A` 10-section schema:

- `PHASE-23B-CURRENT-STATE-DOCS-REFRESH.md`
- `PHASE-23C-LONGITUDINAL-IMPROVEMENT-BENCHMARK.md`
- `PHASE-23D-EVIDENCE-VALIDATION-HARDENING.md`
- `PHASE-24A-BROWSER-PLAY-AND-REPLAY-UI.md`
- `PHASE-24B-GAMEPLAY-EVALUATION-DEPTH.md`

Update `automation/phase-graph.json` so automation can discover PHASE-23A through PHASE-24B. Update `automation/phase-state.json` so PHASE-23A is complete and PHASE-23B is the next current phase.

## Deliverables

- `docs/NORTH_STAR_GAP_AUDIT.md`.
- `phase-plans/PHASE-23A-NORTH-STAR-GAP-PLANNING.md`.
- Future phase plans for PHASE-23B, PHASE-23C, PHASE-23D, PHASE-24A, and PHASE-24B.
- Automation graph/state updates.
- `PROGRESS.MD` handoff updated for PHASE-23B.

## Tests And Validation

- Re-run the phase-plan schema audit and record the result.
- Verify every new phase plan has all 10 required sections.
- Verify graph entries point to existing plan files and depend on prior phases.
- Run `git diff --check`.

No `pnpm test` is required because this phase is docs and metadata only.

## Acceptance Criteria

- The audit states that the pre-existing 46 formal phase plans pass the 10-section schema check.
- Each new plan also passes the same 10-section schema check.
- The graph extends beyond PHASE-22A and can pick PHASE-23B as the next implementation phase.
- Stale docs are identified for PHASE-23B rather than edited in PHASE-23A.
- No gameplay, harness, content, test, or package-script behavior changes are made.

## AI Coder Handoff Notes

Keep this phase documentation-only. If you notice an implementation problem, capture it in the audit or future phase scope rather than fixing it here.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
