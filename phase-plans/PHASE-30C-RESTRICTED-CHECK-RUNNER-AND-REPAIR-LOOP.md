# PHASE-30C - Restricted Check Runner And Repair Loop

## Purpose

Let the restricted agent request whitelisted check IDs and propose bounded repair patches from summarized check results.

## Source Context

Derived from `PHASE-30B`, command evidence handling in `PHASE-20A` and `PHASE-21A`, command ID safety requirements, and the existing repo validation commands.

## Target Outcome

The restricted-agent harness can run approved command IDs, summarize check failures for a second model turn, limit repair attempts, and write evidence without allowing raw shell strings.

## In Scope

- Command ID registry.
- Mapping from command IDs to deterministic local commands.
- Check execution evidence.
- Check result summarization for model repair context.
- Bounded repair loop with max attempts.
- Fake check runner tests.

## Out Of Scope

- Model-provided shell strings.
- Git commands requested by the model.
- Package installation.
- Network commands other than the explicit LLM provider call.
- Infinite repair loops.
- Commit, PR, merge, or phase-completion authority.

## Technical Spec

Dependencies: `PHASE-30B`.

The model may request command IDs such as `focused_tests`, `all_tests`, `typecheck`, `lint`, `build`, `repo_check`, and `diff_check`. The harness owns the mapping. Unknown command IDs block.

The repair loop must stop at a configured maximum attempt count. Each attempt writes context, model output, validation result, applied patch report, command results, and final status.

Allowed paths for this phase:

- `src/harness/restricted-agent/**`
- `tests/restricted-agent-check-runner.test.ts`
- `docs/RESTRICTED-API-CODING-AGENT.md`
- `package.json`
- `phase-plans/**`
- `PROGRESS.MD`

## Deliverables

- Restricted check registry.
- Check runner using command IDs.
- Repair-loop coordinator.
- Evidence report for check and repair attempts.
- Tests with fake checks and fake provider output.

## Tests And Validation

- Focused check-runner and repair-loop tests.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `git diff --check`

## Acceptance Criteria

- Unknown command ID blocks.
- Model raw shell is rejected.
- Failed check is summarized for repair context.
- Repair loop stops at max attempts.
- Passing checks produce evidence.
- The model cannot commit, merge, or change phase state.

## AI Coder Handoff Notes

Treat command execution as a harness-owned service. The model chooses from IDs; it never authors command text.

