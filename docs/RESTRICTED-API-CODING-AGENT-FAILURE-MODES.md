# Restricted API Coding Agent Failure Modes

This log records dogfood findings and operating blockers for the restricted API
coding agent. The model is untrusted in every mode; local deterministic harness
policy remains authoritative.

## PHASE-31B Dogfood Summary

Fake/dry-run dogfood path:

- Mode: fake provider dry-run.
- Target: `PHASE-31B` / `dogfood-fake`.
- Command: `pnpm run restricted-agent-dry-run -- --provider fake --phase PHASE-31B --task dogfood-fake --out runs/restricted-agent/PHASE-31B/fake-dogfood --fake-response valid`.
- Expected result: accepted dry-run decision with `request_check` intent and no
  filesystem mutation, shell execution, git command, commit, PR, merge, or
  phase-state authority.

Real supervised dogfood:

- Status: skipped for PHASE-31B.
- Blocker: this automation run has no explicit user-approved real provider
  dogfood task and no requirement to use credentials. CI must remain
  credential-free, and the phase can pass with fake/dry-run evidence plus this
  concrete blocker.

## Observed Failure Modes

| ID | Failure mode | Observed in | Required harness behavior |
| --- | --- | --- | --- |
| FM-001 | Model response includes Markdown fences, prose, malformed JSON, or wrong phase/task. | PHASE-29C dry-run validation tests. | Reject before schema/action handling and write diagnostics. |
| FM-002 | Model requests unknown command IDs or raw shell-like strings such as `pnpm test`. | PHASE-30C check-runner tests. | Block the check request; model never supplies shell text. |
| FM-003 | Model proposes patches outside allowed paths, over budget, against generated evidence, lockfiles, package manifests, private files, or `.env`. | PHASE-30A patch-validator tests. | Reject before mutation and report path/operation diagnostics. |
| FM-004 | Exact patch anchors are missing, duplicated, or ambiguous. | PHASE-30A/30B patch tests. | Reject or fail the whole apply set before target writes. |
| FM-005 | A check fails and the repair loop keeps requesting the same failing check. | PHASE-30C repair-loop tests. | Summarize failed checks into the next turn and stop at `maxAttempts`. |
| FM-006 | Unit tests accidentally execute real nested checks and become suite-order or environment sensitive. | PHASE-31A remote CI failure on `tests/restricted-agent-autopilot.test.ts`. | Inject fake executors in tests; reserve real command execution for explicit smoke/gate commands. |
| FM-007 | Merge or phase-state authority is inferred from a passing restricted-agent result. | PHASE-31A integration review. | Keep reports explicit: `canCommit: false`, `canMerge: false`, `canChangePhaseState: false`; recheck and release gates remain mandatory. |
| FM-008 | Real provider mode is attempted without credentials or explicit approval. | PHASE-29C and PHASE-31B dogfood. | Block before network access and record the missing-credential or approval blocker. |
| FM-009 | `propose_patch` is parsed but not routed through deterministic validation/application before a repair loop passes. | Post-merge phase-plan audit after PHASE-31B. | Validate proposed patches with PHASE-30A, apply only normalized plans with PHASE-30B, and write patch evidence before checks can pass. |

## Hardening Decisions

- Keep the default shared delegate config disabled.
- Keep fake provider mode available for CI and local deterministic dogfood.
- Keep real provider dogfood opt-in and outside required CI gates.
- Keep test-only fake check executors injectable so integration tests do not
  depend on nested Vitest or shell behavior.
- Keep `propose_patch` handling wired to deterministic validator/applier
  evidence. A parsed patch proposal is never implementation proof by itself.
- Keep generated dogfood evidence under `runs/restricted-agent/**`; do not hand
  edit generated reports.

## Recommended Use

Use the restricted API coding agent when the task can be described as structured
JSON intent with narrow allowed paths and small patch budgets. Use normal
orchestrator/Cursor/Codex workflows for broader implementation work where a
coding agent needs direct file editing, repo exploration, or iterative
debugging.

Do not use the restricted API coding agent for dependency updates, lockfile
changes, generated evidence mutation, secrets, release decisions, branch
management, or gameplay changes that require broad design judgment.
