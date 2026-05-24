# PHASE-29C - Restricted Agent API Dry-Run Loop

## Purpose

Add an explicit, credential-gated API loop for the restricted agent that can call an OpenAI-compatible provider, parse strict JSON, and write dry-run evidence without mutating files.

## Source Context

Derived from `PHASE-29A`, `PHASE-29B`, existing `llm-provider-config` and `llm-provider` patterns, `docs/REAL-LLM-RUNS.md`, and the requirement that no test or CI gate depends on real credentials.

## Target Outcome

The restricted agent can run in dry-run mode with a fake provider for tests and an optional real provider for supervised local use. Malformed or invalid model output blocks before any mutation.

## In Scope

- Provider adapter that reuses existing OpenAI-compatible configuration patterns.
- Fake provider for tests.
- Strict response parser using PHASE-29A schemas.
- Dry-run CLI or harness entrypoint.
- Evidence files for prompt/context, raw response, parsed response, validation diagnostics, and final dry-run decision.
- Clear missing-credential behavior when real provider mode is explicitly requested.

## Out Of Scope

- Applying patches.
- Running requested checks.
- Autopilot integration.
- New provider ecosystems beyond OpenAI-compatible chat.
- Required credentials in CI.
- Direct file writes outside evidence output.

## Technical Spec

Dependencies: `PHASE-29B`.

The default test path must use an injected fake provider. Real provider mode must require explicit CLI/config selection and existing credential environment variables. The loop must not read extra files beyond the context builder output and must not execute model-requested actions.

Malformed JSON, wrong `schemaVersion`, phase/task mismatch, unsupported actions, unknown command IDs, or invalid patch shapes must produce blocked dry-run evidence.

Allowed paths for this phase:

- `src/harness/restricted-agent/**`
- `src/harness/llm-provider*.ts`
- `tests/restricted-agent-api-loop.test.ts`
- `docs/RESTRICTED-API-CODING-AGENT.md`
- `package.json`
- `phase-plans/**`
- `PROGRESS.MD`

## Deliverables

- Restricted-agent API client/loop module.
- Fake provider test harness.
- Dry-run CLI or package script if needed.
- Response parser and blocked-output evidence.
- Documentation for credential-gated dry-run usage.

## Tests And Validation

- Focused dry-run loop tests with fake provider.
- Malformed output and invalid response tests.
- Missing credential behavior test without real network access.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `git diff --check`

## Acceptance Criteria

- No CI/test path requires real credentials.
- Valid fake response is parsed and evidenced.
- Malformed model output blocks.
- Dry-run writes evidence but no target source files.
- Real provider mode is explicit and credential-gated.

## AI Coder Handoff Notes

Keep the first API loop non-mutating. The purpose is to prove strict JSON and evidence behavior, not to make code changes.

