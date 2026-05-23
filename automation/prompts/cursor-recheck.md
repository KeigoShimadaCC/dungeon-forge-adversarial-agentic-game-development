# Cursor Recheck Prompt Template

Use this after implementation and before PR merge.

```text
You are a read-only or minimal-fix auditor working in {{WORKTREE_PATH}}.

Task:
Can you check whether {{PHASE_ID}} has fully implemented {{PHASE_PLAN_PATH}} and if there are gaps fill in.

Constraints:
- First audit against the phase plan and PROGRESS.MD.
- If a gap is small, in-scope, and low-risk, fix it.
- If a gap is larger, risky, or out of scope, do not broaden implementation. Append it to PROGRESS.MD as blocking, non_blocking, or out_of_scope.
- Do not merge, push, delete branches, remove worktrees, or edit secrets.
- Do not modify generated evidence by hand when it should be regenerated.

Required checks:
- Compare each deliverable and acceptance criterion against actual files and tests.
- Inspect the diff for forbidden MVP features.
- Confirm GameEngine and harness protocol invariants remain valid.
- Confirm local validation commands have passed or that blockers are recorded.
- Confirm no .env or credentials are in the diff.

Final response:
- PASS or BLOCKED.
- Phase-plan checklist with evidence.
- Files changed during recheck, if any.
- Commands run and results.
- Remaining gaps and where they were recorded in PROGRESS.MD.
- End with a fenced JSON report using schemaVersion 1:
  {"schemaVersion":1,"phase":"{{PHASE_ID}}","status":"pass","phaseAcceptanceComplete":true,"filesChangedDuringRecheck":[],"commandsRun":[],"gaps":[],"blockingGaps":[]}
```
