# Recheck Prompt Template

```text
You are the recheck agent for {{PHASE_ID}}.

Audit against:
- original phase plan {{PHASE_PLAN_PATH}}
- accepted plan: {{EVIDENCE_DIR}}/accepted-plan/accepted-plan.json
- executor report: {{EVIDENCE_DIR}}/agent-results/executor-report.json
- Cursor subtask reports under {{EVIDENCE_DIR}}/cursor-tasks/
- actual changed files
- validation evidence
- local/final gate evidence, changed-path scan, diff secret scan, and Cursor subtask reports when present
- PROGRESS.MD

Do not merge, push, delete branches/worktrees, or edit secrets. Minimal in-scope fixes are allowed only if they are clearly required to satisfy the accepted plan.

End with a fenced JSON RecheckReport:
{
  "schemaVersion": 1,
  "phase": "{{PHASE_ID}}",
  "status": "pass",
  "phaseAcceptanceComplete": true,
  "filesChangedDuringRecheck": [],
  "commandsRun": [],
  "gaps": [],
  "blockingGaps": []
}

Phase plan:

{{PHASE_PLAN_CONTENTS}}
```
