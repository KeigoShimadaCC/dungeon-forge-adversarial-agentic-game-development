# PHASE-29B - Restricted Agent Context Builder

## Purpose

Build deterministic context packaging for the restricted API coding agent so model inputs contain only approved snippets from allowed paths.

## Source Context

Derived from `PHASE-29A`, phase allowed-path metadata, `agent-adapters` evidence patterns, current autopilot accepted-plan task boundaries, and the safety requirement that forbidden files are never exposed to the model.

## Target Outcome

The harness can search and read bounded file ranges from allowed paths, enforce context size budgets, and record evidence of exactly what snippets were exposed to the model.

## In Scope

- `search_allowed` implementation over allowed paths.
- `read_file_range` implementation with bounded line ranges.
- Context builder for phase ID, accepted-plan task ID, allowed paths, forbidden paths, objective, snippets, previous check summaries, patch budget, and command IDs.
- Token/byte/line budget enforcement.
- Denial diagnostics for forbidden, missing, binary, oversized, or out-of-scope files.
- Evidence records for exposed files/snippets.

## Out Of Scope

- Real LLM/API calls.
- Patch validation or application.
- Running checks.
- Reading secrets, `.env`, credentials, generated evidence, private files, or paths outside the accepted task scope.
- Summarizing files by sending hidden extra context to the model.

## Technical Spec

Dependencies: `PHASE-29A`.

Context building must be deterministic and auditable. It should accept a phase/task scope and produce a model turn input plus an exposure report. File access must be denied unless the requested path is inside both the phase allowed paths and the accepted task allowed paths.

Large files must be range-limited. The harness should prefer exact snippets over whole-file context. Search output should include path, line number, and a short matched line preview, subject to budget limits.

Allowed paths for this phase:

- `src/harness/restricted-agent/**`
- `tests/restricted-agent-context.test.ts`
- `docs/RESTRICTED-API-CODING-AGENT.md`
- `phase-plans/**`
- `PROGRESS.MD`

## Deliverables

- Restricted-agent context builder.
- Allowed-path search and read-range helpers.
- Context exposure evidence format.
- Tests for allowed reads, forbidden reads, budget limits, and deterministic snippet ordering.
- Documentation update for context-building behavior.

## Tests And Validation

- Focused context-builder tests.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `git diff --check`

## Acceptance Criteria

- Model context includes only allowed files/snippets.
- Forbidden files and credential paths are never exposed.
- Large files are range-limited.
- Context evidence records exposed paths and line ranges.
- Missing or denied context is reported as a blocker/diagnostic, not silently ignored.

## AI Coder Handoff Notes

Do not optimize for maximum context. Optimize for least necessary context with strong evidence. Do not introduce broad repo reads or whole-worktree dumps.

